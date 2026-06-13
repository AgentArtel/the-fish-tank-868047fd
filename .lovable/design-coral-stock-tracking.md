# Design — Coral stock tracking + Clover POS sold-off model

> **Status:** DESIGN / FEASIBILITY ONLY. No schema applied, no SQL run, no features built.
> Claude Code, 2026-06-13. Branch: isolated worktree (no PR, do not touch `main`).
> Boss's decisions are LOCKED; this doc designs to them. DB changes are **Lovable's lane** —
> every migration below is a **spec** for Lovable to apply later, never dashboard SQL.

---

## 0. What exists today (evidence)

| Thing | Where | Relevance |
|---|---|---|
| `inventory_items` master row | `supabase/migrations/20260526235115_*.sql:217-262` | One row per owned thing. Already has qty columns + guards. |
| Qty columns `quantity_received/_available/_on_hold/_sold/_lost` | same mig `:228-232` | **Frag mode already has its counters.** Sold tracking column exists. |
| Qty-balance CHECK | same mig `:245-247` — `received >= available+on_hold+sold+lost` | Constrains any decrement logic. Colony mode needs care here (see A). |
| Availability gate trigger `inv_guard_gates` | same mig `:270-293` | `available` needs approved pricing + retail_price + location + `quantity_available>0`. |
| Photo-required trigger `trg_inv_photo_required` | `20260604224211_*.sql:7-30` | No `available` without ≥1 `inventory_media` row. |
| Pricing-approval guard (admin-only) `vli_guard_pricing` | `20260526235115_*.sql:190-212` | Precedent for an admin-only column guard. |
| Activity log trigger | same mig `:343-399` — logs qty/status/pricing changes | Free audit trail; sale events also want their own ledger (see A). |
| `item_type` enum + per-type `attrs` jsonb | `20260603202651_*.sql:3`, `20260605225114_*.sql:20`; schema in `src/lib/item-type-attrs.ts` | **`attrs` is the migration-free extension point** ("Add new fields here — no migration needed"). |
| Coral attrs: `coral_type` (SPS/LPS/soft/zoanthid/mushroom/anemone), `inventory_role` (for_sale/growout/mother_colony/frag_source/hold), `rack_position` | `src/lib/ops.functions.ts:2028-2029`, `item-type-attrs.ts:73-119` | Existing coral shape. **`mother_colony`/`frag_source` roles already foreshadow colony mode.** |
| `catalogCoralItem` (Coral Discovery) | `src/lib/ops.functions.ts:2044-2147` | Creates the coral row, draft-only (`pricing_status:'not_priced'`), sets qty + attrs + optional photo. **The natural home for `stock_mode`.** |
| `vendor_scrape_items` (title, `photo_source_url`, `photo_path`) | `20260610191101_*.sql:50-75` | Scraped vendor catalog with downloaded images in `inventory-media`. Source for borrowed reference photos. |
| `classifyCoralType(title)` deterministic classifier | `src/lib/coral-type.ts:33-37` | Keyword → coarse type slug. Reusable for name/type matching. |
| Image download helper | `src/lib/scrape.functions.ts:275-285` (`downloadImage` → `inventory-media` upload) | Precedent for materializing a borrowed image into our bucket. |
| Photo wizard | `src/components/photo-on-file-wizard.tsx:57-73` | Take/upload → `inventory-media` + media row. Fallback path for image. |
| **Clover: NOTHING built** | nav stub `src/routes/_app.tsx:113` (`soon:true`); copy in `products.tsx:30`; "Not started" in `REALITY_MAP.md:29` (parked) | No route, no API client, no keys, no webhook, no edge function. Greenfield. |
| Secrets precedent: **Supabase Vault** | `20260612235101_*.sql:3-4` (`vault.create_secret`), `20260612235149_*.sql:24` (`vault.decrypted_secrets`) | Where Clover creds go (Lovable lane). |
| Machine-ingest precedent: **pg_cron + pg_net → app `/api/public/hooks/*` route, Bearer Vault secret** | cron `20260612235149_*.sql:16-29`; handler `src/routes/api/public/hooks/refresh-scrape-sources.ts` | **This is the exact pattern Clover ingestion should reuse.** No edge function needed. |
| BYO-keys settings table | `workspace_ai_settings` `20260605063148_*.sql:2` | Precedent for a `clover_connection` settings row + a `/settings/clover` page. |

**Key finding:** there are **no Supabase edge functions** in this project (`supabase/functions/` does not exist). All "server" work is TanStack Start server functions / API routes using `supabaseAdmin` (service role). Machine callers (cron) hit a public `/api/public/hooks/*` route authenticated by a Vault secret. **Clover should follow this same shape — not an edge function.**

---

## A. Data model

### Design principle: reuse `inventory_items`, add ONE new ledger table + a few columns

The qty columns already serve frag mode. We add (1) a per-coral `stock_mode`, (2) pricing-mode fields, (3) a manual "colony gone" flag, and (4) a **sale-event ledger** that is the single source of truth for "sold off over time" and that drives the frag decrement.

#### A.1 Per-coral fields on `inventory_items`

Two reasonable homes:
- **`attrs` jsonb** (migration-free, the documented extension point) for the soft, coral-only descriptors.
- **Real columns** for anything a DB trigger or a reporting query must read cheaply/safely.

Recommendation — keep stock_mode + pricing in `attrs` (coral is the only consumer, no trigger needs them yet), EXCEPT a real boolean column for the colony-gone toggle since it gates availability and should be queryable:

| Field | Home | Values | Notes |
|---|---|---|---|
| `stock_mode` | `attrs.stock_mode` | `'frag'` \| `'colony'` | Default `'frag'`. Drives UI + sale logic. |
| `price_mode` | `attrs.price_mode` | `'per_head'` \| `'fixed'` | Default `'per_head'`. |
| per-head/per-frag default price | reuse existing `retail_price` column | numeric | For `per_head` this is the **default unit price**; for `fixed` it's the **set price**. One column, mode decides meaning — KISS. |
| `colony_gone` | **new real column** `colony_gone boolean NOT NULL DEFAULT false` | — | Manual toggle. Only meaningful when `stock_mode='colony'`. When true → flip availability to `sold_out`. |
| `colony_gone_at` / `_by` | new real columns (nullable) | — | Audit who/when ended the colony. |

Why `retail_price` does double duty: it already flows through the pricing-approval gate (`inv_guard_gates:275`) and the public catalog (`catalog.functions.ts:54`). Adding a parallel price column would fork the pricing-approval invariant. **Per-head default and fixed price are both "the retail price"; `price_mode` is the interpretation.** Per-line overrides at sale time live in the ledger (below), still admin-approved per the invariant.

#### A.2 Sale-event ledger — `coral_sale_events` (NEW TABLE)

One row per sale of frags/heads off one coral, from either Clover or manual entry. Serves **both** modes:
- **frag:** each row decrements `quantity_available` and increments `quantity_sold` by `quantity_heads`; `quantity_available=0` ⇒ sold out.
- **colony:** each row just accumulates (presence stays until `colony_gone`); we do **not** decrement (no up-front count).

```sql
-- SPEC FOR LOVABLE — do NOT apply here. Migration: supabase/migrations/<ts>_coral_sale_events.sql
CREATE TYPE public.coral_sale_source AS ENUM ('clover','manual');

CREATE TABLE public.coral_sale_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  source          public.coral_sale_source NOT NULL DEFAULT 'manual',
  stock_mode_at_sale text NOT NULL CHECK (stock_mode_at_sale IN ('frag','colony')), -- snapshot for reporting
  quantity_heads  numeric(12,2) NOT NULL DEFAULT 1 CHECK (quantity_heads > 0),
  unit_price      numeric(12,2),          -- per head/frag actually charged (admin-approved override allowed)
  total_price     numeric(12,2),          -- line total from POS (authoritative for revenue)
  sold_at         timestamptz NOT NULL DEFAULT now(),
  -- Clover linkage (NULL for manual). Idempotency key:
  clover_order_id      text,
  clover_line_item_id  text,
  clover_payment_id    text,
  note            text,
  created_by      uuid,                    -- NULL for machine/clover ingest
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- one ledger row per Clover line item — makes webhook replay/poll idempotent
  CONSTRAINT coral_sale_clover_uniq UNIQUE (clover_order_id, clover_line_item_id)
);
CREATE INDEX idx_cse_item ON public.coral_sale_events(inventory_item_id, sold_at DESC);
CREATE INDEX idx_cse_sold_at ON public.coral_sale_events(sold_at);

-- RLS mirrors inventory_items (is_active_user select; can_edit_content insert; admin delete).
-- service_role full (for Clover ingest). GRANTs + RLS = Lovable's standard pattern.
```

Notes:
- `UNIQUE (clover_order_id, clover_line_item_id)` is the **idempotency guarantee** — webhook redelivery / poll overlap can't double-decrement. Manual rows have both NULL, and Postgres treats NULLs as distinct in a UNIQUE, so manual entries are unconstrained (correct).
- We keep both `unit_price` and `total_price` because Clover gives us the line total authoritatively; unit price may be derived or admin-overridden.

#### A.3 Applying a sale to inventory (the decrement) — `applyCoralSale` (server-fn helper, Claude lane)

A single server-side helper both Clover ingest and manual logging call. Pseudocode:

```
applyCoralSale({ inventoryItemId, quantityHeads, unitPrice, totalPrice, source, cloverRefs?, soldAt }):
  load item (stock_mode, qty_available, qty_sold, colony_gone)
  insert coral_sale_events row   -- ON CONFLICT (clover_order_id, clover_line_item_id) DO NOTHING → returns "already applied"
  if conflict → return { skipped: true }            -- idempotent
  if stock_mode == 'frag':
     newAvail = max(0, qty_available - quantityHeads)
     newSold  = qty_sold + quantityHeads
     update inventory_items set quantity_available=newAvail, quantity_sold=newSold
     if newAvail == 0 → availability_status='sold_out'
  else  # colony
     # no decrement; presence persists. Optionally bump quantity_sold for reporting parity? NO —
     # would violate the qty-balance CHECK (received >= ...). Keep colony counts in the ledger only.
  # activity log row is emitted automatically by the existing qty trigger (mig :371-385)
```

**Qty-balance CHECK interaction (important):** the CHECK `received >= available+on_hold+sold+lost` means frag decrement must move heads from `available` into `sold` (conserved) — fine. For **colony** we deliberately do **not** touch `quantity_sold` (a colony has no fixed `quantity_received` to balance against), so colony sales live only in `coral_sale_events`. Colony rows can carry `quantity_received` = 1 (the mother) and never decrement it; the toggle, not arithmetic, ends them.

---

## B. Clover integration design

### B.0 Clover's model (brief)
- **Merchant** — the store account; everything is scoped to a `merchantId`.
- **Items** (`/v3/merchants/{mId}/items`) — the POS catalog entry (name, price, priceType `FIXED`/`VARIABLE`/`PER_UNIT`, SKU, modifier groups). A coral record maps to one Clover item.
- **Orders** (`/v3/merchants/{mId}/orders`) with **line items** (`lineItems`) — each sale; a line item references an `item` (or is a custom line), has price + qty, optional **modifiers** (e.g. "frag size").
- **Payments** — attached to orders. Auth via **OAuth token** (per-merchant) or an **API token**; webhooks are configured on the Clover **app** and signed.

### B.1 Auth (Lovable lane — Vault)
- Boss creates a Clover app (or generates an API token for the merchant) and provides: `merchantId`, the access token (OAuth bearer or API token), and the webhook signing secret.
- Store these in **Supabase Vault** exactly like `SCRAPE_CRON_SECRET` (`vault.create_secret`, read via `vault.decrypted_secrets`). Spec'd as a Lovable migration; **the boss provides the secret values** — they are never committed.
- A small **`clover_connection`** settings row (analogous to `workspace_ai_settings`) holds non-secret config: `merchant_id`, `is_active`, `last_sync_at`, `last_sync_status`, ingest mode. Surfaced on the existing `/settings/clover` page (currently a `soon:true` stub at `_app.tsx:113`).

### B.2 Item ↔ coral mapping — `clover_item_links` (NEW TABLE)
A Clover item is mapped to a coral `inventory_items` row. Many corals won't be in Clover; some Clover items aren't corals — so an explicit link table, not a column.

```sql
-- SPEC FOR LOVABLE
CREATE TABLE public.clover_item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clover_item_id text NOT NULL,             -- Clover items.id
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  clover_sku text,
  auto_matched boolean NOT NULL DEFAULT false,  -- true if matched by SKU/name heuristic, false if human-confirmed
  linked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clover_item_id)                    -- one coral per Clover item
);
CREATE INDEX idx_cil_inv ON public.clover_item_links(inventory_item_id);
```
Mapping strategy: prefer **SKU equality** (write the coral's id or rack_position into the Clover item SKU when staffed corals are pushed to POS), fall back to **name match**. Unmatched Clover line items in an order land in a small **review queue** (a Clover line with no link → staff picks the coral once → link persists).

### B.3 Sale ingestion — **recommend WEBHOOK, with poll as backstop**
Two options:
- **Webhook** (Clover app → our endpoint on order/payment events): near-real-time, low load, "seamless." Needs a public signed endpoint.
- **Orders API polling** (cron pulls recent orders): simpler auth, but laggy and heavier.

**Recommendation: webhook primary + a daily reconciliation poll** (catch missed/late webhooks). Both share the same idempotent `applyCoralSale` + `coral_sale_events` unique key, so running both is safe.

Reuse the **existing machine-ingest pattern** (no edge function):
- New route **`src/routes/api/public/hooks/clover-webhook.ts`** (mirrors `refresh-scrape-sources.ts`): verifies Clover's **HMAC signature** against the Vault webhook secret (instead of a Bearer match), parses the event, and for each order line item:
  1. look up `clover_item_links` by `clover_item_id`,
  2. if linked → `applyCoralSale(...)` with `clover_order_id`/`clover_line_item_id` (idempotent),
  3. if unlinked → write a row to a small `clover_unmatched_lines` review queue (or skip with a logged warning) — never guess.
- The **daily reconciliation poll** reuses the cron precedent (`pg_cron` + `pg_net` → `/api/public/hooks/clover-poll`, Bearer Vault secret) to fetch the last 24–48h of orders and replay through the same idempotent path.

### B.4 Mapping a Clover line → coral sale event
| Clover line item field | → `coral_sale_events` |
|---|---|
| `order.id` | `clover_order_id` |
| `lineItem.id` | `clover_line_item_id` |
| `lineItem.item.id` | (resolve via `clover_item_links` → `inventory_item_id`) |
| `lineItem.unitQty` / qty | `quantity_heads` (per-head qty; default 1) |
| `lineItem.price` | `unit_price` (cents → dollars) |
| line total | `total_price` |
| `payment.id` | `clover_payment_id` |
| modifiers (e.g. frag size) | `note` (informational) |

**Per-head qty:** Clover's PER_UNIT / quantity carries the heads sold; if the coral is `price_mode='fixed'`, qty is still the head count but pricing is the set price.

### B.5 Lane split for Clover
- **Lovable:** Vault secrets, `clover_item_links` / `coral_sale_events` / settings migrations + RLS/GRANTs, the daily-poll `pg_cron` schedule.
- **Claude (app code):** `/api/public/hooks/clover-webhook.ts` + `clover-poll.ts` routes, the Clover API client (token from `process.env`/Vault-injected), `applyCoralSale` helper, the `/settings/clover` page, the unmatched-line review UI.
- **Boss provides:** Clover merchant id, API/OAuth token, webhook signing secret, and decides whether corals get pushed into the Clover catalog (for SKU mapping) or mapped after the fact.

---

## C. Image-reference linking (borrow a scraped vendor photo)

**Feasibility: good.** `vendor_scrape_items` already holds `title` + a downloaded `photo_path` in `inventory-media`; `classifyCoralType` gives a coarse type; `downloadImage` (`scrape.functions.ts:275`) is the materialize precedent.

Flow when cataloguing a coral with no photo:
1. **Match:** normalize the coral `item_name`; query `vendor_scrape_items` where `photo_path IS NOT NULL` and `status` in (new/imported), scoring by: (a) name token overlap / `ilike`, (b) `classifyCoralType(title)` == coral's `coral_type`. Take top candidates with a **confidence score**.
2. **Confirm:** show top 1–3 candidate images; **staff taps to confirm** (never silent auto-borrow — keeps a human in the loop, cheap insurance).
3. **Materialize:** on confirm, **copy** the scrape item's stored object to a new `inventory-media` path for this coral (copy, don't reference — the scrape row can be pruned), insert an `inventory_media` row tagged `internal`, set `needs_photo=false`. Record provenance in `attrs.photo_borrowed_from = vendor_scrape_items.id`.
4. **Fallback:** no candidate / staff rejects → existing take/upload `PhotoOnFileWizard` (`photo-on-file-wizard.tsx`). This is already the default in Coral Discovery.

Note the photo-required gate (`trg_inv_photo_required`) only blocks `available`; a borrowed-or-uploaded photo satisfies it identically. Borrowing is purely a convenience to reduce manual photography.

---

## D. Reporting — "sold off a coral / coral type over time"

The ledger makes this a straight rollup (no qty-column archaeology). Reuse `coral_sale_events` joined to `inventory_items.attrs`:

```sql
-- Sold-off by coral_type by month (heads + revenue)
SELECT
  date_trunc('month', cse.sold_at)            AS period,
  COALESCE(ii.attrs->>'coral_type','unknown') AS coral_type,
  count(*)                                     AS sale_events,
  sum(cse.quantity_heads)                      AS heads_sold,
  sum(cse.total_price)                         AS revenue
FROM public.coral_sale_events cse
JOIN public.inventory_items ii ON ii.id = cse.inventory_item_id
GROUP BY 1, 2
ORDER BY 1 DESC, 4 DESC;
```
- **Per-coral over time:** same query filtered `WHERE cse.inventory_item_id = $1`, grouped by period.
- **Frag burn-down:** `inventory_items.quantity_available` is live; history is the ordered ledger.
- **Colony productivity:** colony corals have no decrement, so `sum(quantity_heads)` per colony = total frags cut off that mother — a genuinely new, useful metric.
- Surface in the existing **Dashboard** (`src/routes/_app/dashboard.tsx` already does stock-value-by-category) as a "Sold off (last 30/90d)" panel, KISS.

---

## E. UX flow (KISS — folds into existing surfaces, no new architecture)

1. **Coral Discovery capture** (`inventory.coral-discovery.tsx` → `catalogCoralItem`): add two controls — **Stock mode** (Frag / Colony) and **Price mode** (Per-head / Fixed) with the single price field relabeled by mode. Both write to `attrs`. Colony preselects role `mother_colony`. Photo step gains the **"Borrow vendor photo"** option (Section C) before take/upload.
2. **Item page** (`inventory.$id.tsx`, already edits qty + has "Mark available" at `:186`): add
   - a **"Log sale"** button → small dialog (heads, unit price, note) → `applyCoralSale(source:'manual')`. This is Phase 1's sole sale path.
   - for colony corals, a **"Colony gone"** toggle → sets `colony_gone=true` + flips to `sold_out`.
   - a **sale history** list (the ledger for this coral) under activity.
3. **Unified "Add inventory" launcher:** the audit (`audit-inventory-intake.md` §7) already flags the fragmented Quick Add / Coral Discovery / Batches mental model and gates any launcher change behind sign-off (CLAUDE.md rule 2). **Do not build a new launcher here** — just add the two coral fields into the existing Coral Discovery flow. If the boss later approves the unified launcher, stock_mode slots in cleanly.
4. **Settings → Clover** (`/settings/clover`, currently `soon:true`): connection status, merchant id, "Test connection", unmatched-line review queue (Phase 2).

---

## F. Lane split + phasing

### Phase 1 — Inventory model + manual sale logging (NO Clover). Ships value immediately.
- **Lovable:** migration for `coral_sale_events` (+ enum, RLS, GRANTs, indexes); add `colony_gone`/`_at`/`_by` columns + a trigger so `colony_gone=true` ⇒ `availability_status='sold_out'` (and block un-setting without admin, optional). `stock_mode`/`price_mode` need **no migration** (live in `attrs`).
- **Claude:** `stock_mode`/`price_mode` in `catalogCoralItem` + Coral Discovery UI; `applyCoralSale` helper; "Log sale" dialog + "Colony gone" toggle + sale-history on the item page; reporting panel; image-borrow matcher + confirm UI.
- **Boss:** confirms locked decisions hold; tests the real flow (Definition of Done).

### Phase 2 — Clover auto-ingest. Needs creds.
- **Lovable:** Vault secrets (boss-supplied values); `clover_item_links` (+ optional `clover_unmatched_lines`) migration + RLS; `clover_connection` settings row; daily reconciliation `pg_cron` schedule.
- **Claude:** Clover API client; `clover-webhook.ts` + `clover-poll.ts` hook routes (reuse the `refresh-scrape-sources.ts` pattern); signature verification; route Clover lines through `applyCoralSale`; `/settings/clover` page + unmatched-line review queue.
- **Boss / needs-Clover-creds:** Clover merchant id, API/OAuth token, webhook signing secret; decision on pushing corals into the Clover catalog for SKU-based mapping.

**Parked-scope note:** `REALITY_MAP.md:29/37` lists Clover sync as **parked, do-not-expand-without-sign-off**. Phase 2 is therefore explicitly gated on the boss un-parking it; Phase 1 stays within the current "organize coral inventory" focus.

---

## G. Open questions for the boss

1. **Colony `quantity_received`** — set colony mothers to `quantity_received=1` (presence only) and never decrement, with all frag counts in the ledger? (Recommended — avoids the qty-balance CHECK fighting an open-ended count.)
2. **Per-head default vs fixed via one `retail_price` column** — OK to reuse `retail_price` (mode-interpreted) rather than add a separate fixed-price column, so the admin pricing gate stays single-source? (Recommended.)
3. **Unmatched Clover lines** — when a Clover sale references an item with no coral link: hold in a review queue for staff to map (recommended), or silently ignore non-coral sales (since Clover also rings up fish/dry goods)? Likely: ignore lines whose Clover item isn't in `clover_item_links`, surface a small "unmatched coral-ish lines" review list only.
4. **Coral → Clover catalog direction** — will staff push staged corals INTO Clover (so we control the SKU = mapping key), or catalog in our app first and map to pre-existing Clover items after? Decides mapping ergonomics in B.2.
5. **Sale ⇒ availability** — when frags hit 0, auto-flip to `sold_out` (recommended) — confirm that's desired vs. leaving it for manual review.
6. **Manual sale pricing & the admin invariant** — a per-line `unit_price` override at sale time: must it be admin-approved like other pricing, or is logging an actual past sale exempt (it records what was charged, not a go-live price)? (Lean: exempt — it's historical fact, not a pricing decision.)
