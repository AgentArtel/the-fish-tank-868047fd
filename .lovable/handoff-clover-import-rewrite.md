# Handoff → Lovable: Clover import rewrite (what to pull + how to store it)

> Greenlight + decisions, building on your audit (`handoff-clover-data-audit.md` + your report).
> **Verdict from the audit:** Clover stock is all-zero → **no baseline seed; the manual count deck
> stays the source of the baseline.** This rewrite is about *enriching* the imports (category, type,
> UPC) so the count decks organize correctly and matching gets stronger — not about quantities.

## Lane
This is **yours**: the migration (new columns) + the edge-fn rewrite + the re-import (you can test
against live Clover; I can't). I'm building the app-side count deck in parallel to consume it.

## 1. Fetch — iterate categories (your wrinkle finding is the spec)
Flat `/items` silently drops `expand` for this merchant; the per-category endpoint honors it. So:
- For each category in `/v3/merchants/{mId}/categories`: page
  `/v3/merchants/{mId}/categories/{catId}/items?expand=itemStock,tags&limit=100` and capture the
  per-item category + fields below.
- Then a **final flat pass** over `/v3/merchants/{mId}/items` for items in **no** category (dry goods are
  mostly uncategorized) — id/name/price/`code` only; no expand needed there.
- Dedup by `clover_item_id` across both passes (an item could appear in a category *and* the flat pass).

## 2. Store — new columns on `clover_item_links`
Keep Clover-source metadata with the link (it's Clover's data), not on `inventory_items`:
- `clover_category_id text`
- `clover_category_name text`
- `clover_code text`        — UPC (present on dry goods; empty on livestock — fine)
- `clover_price_type text`  — `FIXED` | `VARIABLE`
- `clover_modified_time bigint` — ms epoch, sync watermark

**Skip** `sku`, `cost`, `unitName` (empty/unmaintained per your audit). **Do NOT** store
`itemStock.quantity` — all zero, and a `clover_stock_snapshot` of zeros has no value; drop it.

## 3. Seed `item_type` on `inventory_items` — but only when NULL
Map from Clover category, and **never clobber an existing type** (the coral-name heuristic + any
hand-set type win):
```
Coral → coral · Fish → fish · Inverts → invert · Dry Goods → dry_good · Food → dry_good · Water → dry_good
```
Uncategorized → leave `item_type` null; the count deck lets staff set it. Apply this on both new
inserts and existing linked rows during the re-import (UPDATE where item_type IS NULL).

## 4. Don't touch quantities or pricing status
- `quantity_*` untouched (Clover's zeros are meaningless; the deck sets real counts).
- Leave the existing price/`pricing_status` logic as-is. Note livestock is `priceType=VARIABLE` with
  `price=0` (priced at POS) — so `retail_price` stays null/unapproved for them, which is correct; the
  deck/pricing flow sets it.

## 5. Re-import to backfill
After deploy, run the import once so existing linked rows get `clover_category_*`, `clover_code`,
`clover_price_type`, and the null→type seeding. Report counts (items, categories iterated, types seeded).

## 6. Watermark (nice-to-have, not blocking)
Store max `clover_modified_time`; future syncs *can* filter, but a full re-pull at this catalog size is
fine — don't over-build it.

## 7. Audit endpoint
Keep `supabase/functions/clover-audit/` until this rewrite is verified end-to-end (handy to re-run),
then delete it. Your call on timing.

## App-side (me, in parallel)
- The **count deck** reads `inventory_items` joined to `clover_item_links`, **groups by
  `clover_category_name`** (falls back to `item_type`, then "Uncategorized"), and per card sets
  **type · quantity · price · location · photo** → marks counted → next. It works before the re-import
  (one big "Uncategorized" deck) and snaps into Clover-category decks the moment your backfill lands.
- I'll also surface `clover_code` (UPC) for barcode-scan-to-find inside the deck once the column exists.

## Reply with
Migration applied + columns live, edge-fn rewritten, re-import run (with the counts), and confirm the
`item_type` seeding mapping. Then the decks organize by your real Clover categories.
