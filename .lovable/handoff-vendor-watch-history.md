# Hand-off — Vendor Watch: append-only price/availability history (for Lovable / DB owner)

Date: 2026-06-12 · **This is job #1 for Vendor Watch and it needs a migration.**
Author: Claude Code (frontend/server-fn lane). DB schema is your lane — this note is the spec.

## Why (the make-or-break problem)

Vendor Watch's whole point is a **data asset**: capture vendor listings as
**append-only snapshots** so we can see price/availability/on-sale **over time**
and alert before limited/seasonal items sell out. Locked decision: *"Never
overwrite — we can't backfill history we don't capture."*

The Phase-1 starting point **violates this**. `refreshScrapeSource`
(`src/lib/scrape.functions.ts`) does an `UPDATE` on the existing
`vendor_scrape_items` row each refresh (price, availability, raw payload), so
**every refresh destroys the prior price and availability**. There is no
snapshots table. `compare_at_price` (the on-sale signal) is never captured at
all. Once a refresh runs, that history is gone for good.

We cannot compute *any* of the reliable signals the product needs —
"price dropped vs history", "available→gone", "on sale" — without a history
table. Hence this migration.

## What I need you to build (the migration)

### 1. New table: `vendor_scrape_snapshots` (append-only, the data asset)

One row per item **per observed change** (see write policy below — that part is
my lane in `refreshScrapeSource`; the table just has to accept appends and never
be updated in place).

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

### 2. Add two columns to `vendor_scrape_items` (the "latest / current state" row)

We keep `vendor_scrape_items` as the fast current-state row for listing/filtering
(latest price, current availability). History lives in snapshots. Add:

```sql
ALTER TABLE public.vendor_scrape_items
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(12,2),   -- latest compare_at_price (drives "on sale" badge)
  ADD COLUMN IF NOT EXISTS last_price_change_at timestamptz; -- when wholesale_cost last changed (drives "price dropped" feed)
```

(We already have `available_at_source`, `last_available_at`, `first_seen_at`,
`last_seen_at` — keep all of them. `raw_payload` on the item can stay as the
"latest" blob; the historical blobs live in snapshots.)

### 3. Scope note on the `status` enum (no change needed, just FYI)

The boss has decided **Vendor Watch is a monitor, not an importer** — we're
ripping out the import-to-batch flow on the app side (`importScrapeItems`, the
Import buttons, the ×3 "Suggested" column). That means the `'imported'` value of
`vendor_scrape_items.status` will go unused going forward, and the
`imported_*` FK columns become dormant. **Leave them in place** for now — no
migration to drop them, no data loss, and we may repurpose toward the tagging /
"to-order" feature (next). Don't remove the `'scrape'` value added to
`vendor_batch_source_document_type` either.

## Please confirm / decide (your call)

1. **(Confirm) `can_edit_content` / `service_role` split.** The manual "Refresh
   now" button runs as the authenticated editor (RLS path above). The
   **scheduled** refresh (next phase) must run as `service_role` via an edge
   function / pg_cron — that's why snapshots get a `service_role` grant. Flag if
   your cron pattern differs.

2. **(Decide, next phase) Scheduled-refresh infra — the linchpin.** Designing for
   **10+ vendors** (boss's call), manual refresh won't cut it. Proposed shape, to
   spec in a follow-up hand-off once this table lands:
   - a Supabase **edge function** `refresh-scrape-sources` that selects active
     sources due by `cadence`, fetches Shopify `products.json`, and inserts
     snapshots + updates the latest row, all as `service_role`;
   - **pg_cron** invoking it (e.g. hourly; the function decides which sources are
     due — `friday_night`, `daily`, `weekly`, `manual`).
   I'll draft the exact edge-function spec separately. Calling it out now so the
   table + grants above are built with that caller in mind.

3. **(Decide, later) Tagging / "to-order" scaffold.** Boss wants notify-only now
   but to **build toward** tags ("add to order shortlist", "watch this type of
   item"). When we get there I'll spec a small `vendor_scrape_item_flags` table
   (item_id, flag, created_by) rather than overloading `status`. **Not in this
   migration** — noted so we don't paint ourselves into a corner.

## What I'm doing on the app side in parallel (my lane)

- Rewriting `refreshScrapeSource` to **insert a snapshot** (change-log policy:
  write a snapshot on first sight and whenever price / availability /
  compare_at_price differs from the most recent snapshot) **instead of**
  overwriting history; capture `compare_at_price` from the Shopify variant.
- **Ripping out** the importer path (`importScrapeItems`, Import UI, the ×3
  "Suggested" column) per the boss's decision — Vendor Watch never creates
  batches/inventory/pricing.
- Fixing the dead **"Unavailable at vendor"** filter (today it queries
  `status='unavailable'`, which nothing ever sets; it should filter
  `available_at_source=false`).
- These app-side changes that **write** snapshots are gated on this table
  existing — so this migration unblocks me.

## Not in scope (per standing rules)

No retail/×3 logic in Vendor Watch (scraped price = our wholesale cost). No
batch/inventory/pricing creation. No Firecrawl spend on Shopify sources. No live
stock counts — only the signals above.
