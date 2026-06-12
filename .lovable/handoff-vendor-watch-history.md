# Hand-off — Vendor Watch: append-only history **+ scheduled refresh** (BUNDLED, for Lovable / DB owner)

Date: 2026-06-12 · **Job #1 for Vendor Watch.** Bundled so you can knock out both
DB/infra pieces in one pass (round-trips are our most expensive resource).
Author: Claude Code (frontend/server-fn lane). DB schema + cron/edge infra is your
lane — this note is the spec.

---

## ⚠️ READ FIRST — the one guardrail that must not be violated

`refreshScrapeSource` **still OVERWRITES history today** (it `UPDATE`s the item
row each refresh, destroying the prior price/availability). Claude is rewriting it
to be append-only, but **that rewrite is not merged yet.**

> **If you ship the migration AND turn on a schedule that drives the current
> refresh, you've automated the destruction of history on a timer — strictly
> worse than manual.**

So, concretely:

- **Ship both pieces in this pass**, BUT **leave the schedule DISABLED /
  unscheduled.** Build the cron + edge scaffold, deploy it, but **do not enable
  the cron job.**
- **Claude enables the schedule** — only **after** the append-only
  `refreshScrapeSource` rewrite is merged.

**Safe order, keep to it:**
1. Migration lands (Part 1) + scheduling scaffold deployed-but-OFF (Part 2).
2. Claude merges the append-only `refreshScrapeSource` rewrite (snapshot inserts,
   captures `compare_at_price`, signals computed as diffs over snapshots).
3. **Then** Claude flips the cron on.

**Never enable the schedule against the overwrite logic.** This is the whole
reason the bundle is safe to ship at once.

---

# Part 1 — Migration: append-only snapshots (the data asset)

### 1a. New table: `vendor_scrape_snapshots` (append-only)

One row per item **per observed change**. The *write policy* (snapshot on first
sight + whenever price / availability / `compare_at_price` differs from the most
recent snapshot) is Claude's lane in the refresh rewrite — the table just has to
accept appends and **never be updated in place**.

```sql
CREATE TABLE public.vendor_scrape_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_item_id uuid NOT NULL REFERENCES public.vendor_scrape_items(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.vendor_scrape_sources(id) ON DELETE CASCADE, -- denormalized for source-wide queries
  observed_at timestamptz NOT NULL DEFAULT now(),
  wholesale_cost numeric(12,2),            -- vendor's price = OUR wholesale cost (no retail/x3 here)
  compare_at_price numeric(12,2),          -- Shopify compare_at_price; > price => on sale
  available boolean NOT NULL,
  vendor_currency text DEFAULT 'USD',
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb, -- full variant/product blob at this observation
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vss_item_time   ON public.vendor_scrape_snapshots(scrape_item_id, observed_at DESC);
CREATE INDEX idx_vss_source_time ON public.vendor_scrape_snapshots(source_id, observed_at DESC);

GRANT SELECT, INSERT ON public.vendor_scrape_snapshots TO authenticated; -- NO update/delete grant
GRANT ALL ON public.vendor_scrape_snapshots TO service_role;             -- scheduled refresh writes as service_role

ALTER TABLE public.vendor_scrape_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vss_snap select editor" ON public.vendor_scrape_snapshots
  FOR SELECT TO authenticated USING (can_edit_content(auth.uid()));
CREATE POLICY "vss_snap insert editor" ON public.vendor_scrape_snapshots
  FOR INSERT TO authenticated WITH CHECK (can_edit_content(auth.uid()));
-- Deliberately NO update/delete policy: append-only. (Add an admin-only delete
-- later only if we need a retention/cleanup job.)
```

**Append-only is the invariant.** Please do not add an `ON UPDATE` trigger or
`updated_at` here — these rows are immutable observations.

### 1b. Add two columns to `vendor_scrape_items` (the "latest / current state" row)

We keep `vendor_scrape_items` as the fast current-state row for listing/filtering;
history lives in snapshots. **`compare_at_price` here is non-optional — without it
the on-sale signal is impossible** (it's in the Shopify variant payload and is
currently dropped on the floor; Claude wires the capture app-side).

```sql
ALTER TABLE public.vendor_scrape_items
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(12,2),   -- latest compare_at_price (drives "on sale" badge)
  ADD COLUMN IF NOT EXISTS last_price_change_at timestamptz; -- when wholesale_cost last changed (drives "price dropped" feed)
```

(Keep the existing `available_at_source`, `last_available_at`, `first_seen_at`,
`last_seen_at`. `raw_payload` on the item stays as the "latest" blob; historical
blobs live in snapshots.)

### 1c. Scope note on the `status` enum (no change needed, FYI)

Vendor Watch is now a **monitor, not an importer** — we ripped out the
import-to-batch flow app-side. The `'imported'` value of
`vendor_scrape_items.status` and the `imported_*` FK columns go dormant. **Leave
them in place** (no data loss; may repurpose toward the tagging / "to-order"
feature). Don't drop the `'scrape'` value on `vendor_batch_source_document_type`
either.

---

# Part 2 — Scheduled refresh infra (BUILD IT, BUT LEAVE IT OFF)

Designed for **10+ vendors** — manual refresh won't scale. The linchpin is a timer
that drives the **append-only** refresh. To avoid two diverging copies of the
scrape logic, **the scheduler does NOT reimplement the scrape** — it just pings a
stable app endpoint that runs the single source-of-truth refresh.

### 2a. Lane split (important)

| Piece | Owner | Status after this pass |
|---|---|---|
| Stable hook route `POST /api/hooks/refresh-scrape-sources` (auth via bearer secret; iterates **due** active sources; runs the **append-only** refresh) | **Claude** (app, `src/`) | Built during the refresh rewrite (step 2 of the safe order) |
| `vendor_scrape_snapshots` migration + item columns + grant (Part 1) | **Lovable** | Shipped now |
| pg_cron / edge scheduler that POSTs that hook route on a cadence | **Lovable** | **Deployed but DISABLED** now |
| `SCRAPE_CRON_SECRET` in Vault **and** in the deployed app's runtime env | **Lovable** (you own app hosting on `*.lovable.app`) | Set now |

### 2b. The caller contract (so both sides agree)

- The scheduler authenticates to the hook route with header:
  `Authorization: Bearer ${SCRAPE_CRON_SECRET}`.
- Claude's hook route validates that bearer against `SCRAPE_CRON_SECRET` from the
  app env, and on match runs as service_role — **this is the "service-role entry
  path so the cron caller doesn't trip `requireAdmin`."** (Manual "Refresh now"
  in the UI keeps its existing authenticated-admin path; the bearer path is only
  for the machine caller.)
- Body: empty → refresh **all active, due** sources. Optional `{ "sourceId": "…" }`
  → refresh one. Returns a per-source summary.
- **Due-ness lives in the app route** (Claude's lane) so all scrape logic stays in
  one place — the scheduler is a dumb timer. Reference cadence rules the route
  will apply: `manual` never auto-runs; `daily` = `last_scraped_at` older than
  ~20h; `weekly` = older than ~6.5d; `friday_night` = it's Fri ≥ 22:00 ET and not
  scraped since the prior Fri 22:00.

### 2c. What to build (Lovable) — pick whichever fits the stack, leave it OFF

**Option A (preferred, fewest moving parts):** `pg_cron` + `pg_net`.
```sql
-- Requires pg_cron + pg_net. DO NOT run cron.schedule() yet — ship the function
-- and the secret, but leave the job UNSCHEDULED. Claude schedules it post-rewrite.
--
-- Reference job (keep COMMENTED OUT / do not execute in this migration):
--   SELECT cron.schedule(
--     'vendor-watch-refresh', '0 * * * *',  -- hourly; the app route decides which sources are due
--     $$ SELECT net.http_post(
--          url    := <APP_BASE_URL> || '/api/hooks/refresh-scrape-sources',
--          headers:= jsonb_build_object(
--            'Content-Type','application/json',
--            'Authorization','Bearer ' || <SCRAPE_CRON_SECRET from Vault>),
--          body   := '{}'::jsonb
--        ); $$
--   );
```

**Option B:** an edge function `scrape-scheduler` (Deno) that does the same
`http_post` to the hook route, with pg_cron invoking the function. Same rule:
deploy it, **do not schedule it.** Either way the function/job must **not** scrape
directly — it only calls the app hook route.

### 2d. Secret + URL

- Generate `SCRAPE_CRON_SECRET` once. Store it in **Vault** (for the cron/edge
  caller) **and** set it as a runtime env var on the deployed app
  (`the-fish-tank.lovable.app`) so Claude's hook route can validate it. The app
  reads it server-side only (never shipped to the client).
- Confirm the app base URL the scheduler should hit (prod:
  `https://the-fish-tank.lovable.app`).

---

## Safe enablement checklist (the contract between us)

- [ ] **Lovable:** Part 1 migration merged (snapshots table + item columns + grant).
- [ ] **Lovable:** Part 2 scheduler deployed **OFF** + `SCRAPE_CRON_SECRET` in Vault
      and in app env + app URL confirmed.
- [ ] **Claude:** append-only `refreshScrapeSource` rewrite merged (snapshot
      inserts, `compare_at_price` captured, signals as diffs) + hook route built.
- [ ] **Claude:** flip the cron ON (or hand you a one-line "schedule it now").
- [ ] ❌ **Never** enable the schedule before the rewrite is merged.

## Please confirm / decide (your call)

1. **(Confirm)** You can set `SCRAPE_CRON_SECRET` in **both** Vault and the
   deployed app's runtime env (you own `*.lovable.app` hosting). If the app env is
   managed elsewhere, flag it — that's the one thing that blocks the bearer path.
2. **(Confirm)** `pg_net` is available for Option A; if not, we go Option B (edge
   function). Either is fine.
3. **(Confirm)** Hourly cron tick is acceptable (the app route throttles by
   cadence, so most ticks are cheap no-ops). Friday-night Furnace drops will be
   caught within the hour.

## Planned fast-follow (not this pass — noted so we don't paint into a corner)

Tagging / "to-order" shortlist: we're **notify-only** now but designing toward it.
When we get there Claude will spec a small `vendor_scrape_item_flags`
(item_id, flag, created_by) table rather than overloading `status`. **Not in this
migration.**

## Not in scope (per standing rules)

No retail/×3 logic in Vendor Watch (scraped price = our wholesale cost). No
batch/inventory/pricing creation. No Firecrawl spend on Shopify sources. No live
stock counts — only the signals (just-appeared, available→gone, price-dropped,
on-sale).
