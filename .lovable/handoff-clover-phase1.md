# Hand-off / plan — Inventory sale tracking + Clover sync, Phase 1 (executable spec)

Date: 2026-06-13 · Author: Claude Code. Turns the two design docs
(`design-coral-stock-tracking.md`, `scope-clover-sync.md`) into an executable
Phase-1 plan with the boss's **locked decisions** baked in. DB parts are Lovable's
lane (migration specs below — not applied). Can be built **now**; only the live
Clover connection waits on credentials.

## Locked decisions
- **Workspace = source of truth.** Workspace edits push to Clover; conflicts =
  **workspace wins, but flagged**.
- **Single merchant / one store** → simple Clover **API token** (no OAuth refresh).
- **Import-first:** Clover already has dry goods + some livestock (with gaps); we
  import its catalog, then fill gaps from the workspace (Phase 2 push).
- **Track ALL types:** every Clover sale reflects here — corals via the frag/colony
  ledger, dry goods/fish via a simple stock decrement.
- **Unmatched sales → review queue** (a register-rung item with no workspace link),
  not ignored.
- **Refunds/voids → review step**, no auto-reverse.
- **Colonies are stock-untracked in Clover:** a colony = one Clover item with no
  stock count; each register sale logs a frag-off **event** here, never a Clover
  decrement. Frags + dry goods carry real Clover stock counts.

## Key reconciliation
Generalize the coral-only `coral_sale_events` (from the coral design) into one
**`inventory_sale_events`** ledger that serves every item type. The coral nuance
(frag decrement vs colony accumulate) lives in a single `applyInventorySale()`
helper that branches on the item's `attrs.stock_mode`. Non-coral items just
decrement `quantity_available` / bump `quantity_sold`.

---

## Build order (foundation first → Clover snaps on)

### Phase 1a — Sale-tracking foundation (NO Clover dependency; build now)
Usable immediately via manual "log a sale". This is what Clover later writes into.

**Lovable (migration spec — do not apply until reviewed):**
```sql
-- Per-coral stock mode + colony "gone" toggle (stock_mode/price_mode live in attrs).
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS colony_gone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS colony_gone_at timestamptz,
  ADD COLUMN IF NOT EXISTS colony_gone_by uuid;

-- Generalized sale ledger (all item types; powers "sold-off over time" reports).
CREATE TABLE public.inventory_sale_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL, -- null = unmatched
  qty numeric(12,2) NOT NULL,                 -- heads/frags (or units for dry goods)
  unit_price_cents integer,
  total_cents integer,
  sold_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','clover')),
  kind text NOT NULL DEFAULT 'sale' CHECK (kind IN ('sale','refund','void')),
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','needs_review','reversed')),
  -- Clover refs (phase 1b); unmatched lines keep these + clover_item_name, item_id null.
  clover_order_id text, clover_line_item_id text, clover_payment_id text, clover_item_name text,
  notes text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clover_order_id, clover_line_item_id)   -- idempotent ingest
);
-- RLS: editor select/insert, admin update/delete (mirror inventory patterns); index on (inventory_item_id, sold_at), (status).
```

**Claude (app, my lane):**
- `applyInventorySale(db, { inventoryItemId, qty, unitPriceCents, source, cloverRefs? })`
  — inserts the ledger row, then: coral **frag** → decrement qty; coral **colony**
  → no decrement; non-coral → decrement `quantity_available`/+`quantity_sold`.
  Idempotent on Clover refs. Refund/void → `needs_review`, no auto-reverse.
- `logInventorySale` server fn (editor) for manual entry + an "unreverse/reverse"
  admin action for refunds review.
- UI: a **"Log sale"** action on the coral/item page (heads + price), the
  **colony-gone** toggle, and a small **Sold/report** view ("sold off this coral",
  rolled up by coral type + period).
- Fold coral `stock_mode` (frag|colony) + `price_mode` (per_head|fixed) into the
  Coral Discovery / item form (stored in `attrs`, per the coral design).

### Phase 1b — Clover ingest (import + sales pull). Needs the API token to go live.
**Lovable (migration + secrets):**
```sql
CREATE TABLE public.clover_item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE, -- null = clover-only/unlinked
  clover_item_id text NOT NULL UNIQUE,
  clover_name text, clover_price_cents integer,
  link_status text NOT NULL DEFAULT 'linked' CHECK (link_status IN ('linked','unlinked')),
  last_synced_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.clover_connection (   -- single row: non-secret config
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  merchant_id text, base_url text DEFAULT 'https://api.clover.com',
  connected boolean NOT NULL DEFAULT false,
  last_import_at timestamptz, last_sale_synced_at timestamptz
);
-- Vault: CLOVER_API_TOKEN, CLOVER_WEBHOOK_SECRET.
-- pg_cron: daily POST to /api/public/hooks/clover-poll (Vault bearer), reconciliation backstop.
```

**Claude (app, my lane):**
- `src/lib/clover.client.ts` — typed wrappers (items, item_stocks, orders w/ expand,
  webhooks) reading `process.env.CLOVER_API_TOKEN`; cents money; 429 backoff; paging.
- **Import** server fn — pull Clover items → upsert `clover_item_links`; auto-match
  to existing workspace items by name/type where possible (rest stay `unlinked`).
- `src/routes/api/public/hooks/clover-webhook.ts` — HMAC-verify (`Clover-Signature`),
  resolve each line via `clover_item_links` → `applyInventorySale`; unresolved →
  `inventory_sale_events` row with `inventory_item_id = null`, `status='needs_review'`
  (the **unmatched queue**). Reuses the scrape hook + Vault-secret pattern.
- `clover-poll` route — same logic over recent orders (idempotent) as a backstop.
- `/settings/clover` UI — connect/status, run import, a **mapping** screen (link
  unlinked Clover items ↔ workspace items), and the **unmatched-sales review queue**.

### Phase 2 (later, gated on un-parking Clover in REALITY_MAP)
Push workspace → Clover on inventory/pricing mutation server-fns (after the
pricing/photo/role gates), with last-pushed-hash echo-loop guards.

### Phase 3 (later)
Ingest Clover-side edits with conflict policy: **workspace wins for catalog/pricing;
Clover wins for realized sales**; surface flagged conflicts.

---

## What can start NOW vs waits on the key
- **Now (no creds):** Phase 1a in full (foundation + manual logging + reports);
  the Phase-1b *scaffolding* — `clover.client.ts`, the webhook/poll route shells,
  the import fn, the settings UI — all written, reading the token from env.
- **Waits on the Clover merchant id + API token (+ webhook secret):** actually
  connecting, importing real items, and testing webhook/poll against Clover
  (sandbox creds first if available).

## Boss still provides
Clover **merchant ID + API token**; later a **webhook signing secret**. Sandbox
creds first if you want to test safely before touching the live register.
