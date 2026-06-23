# Handoff → Lovable: Clover data audit (what can we actually pull?)

> **Goal:** the Clover-imported items came in as bare stubs (name + price only) — no category, no
> quantity, no location, mostly no type. Before we fix the import, we need to see **exactly what this
> merchant's Clover account exposes**, because some of the "missing data" (especially **stock counts**)
> may already live in Clover and could seed the baseline automatically instead of hand-counting.
>
> You have the creds + the edge-function lane; we don't. **Please run the reads below against the live
> merchant and paste the raw JSON back** (redact nothing structural — we need to see which fields are
> populated for THIS merchant).

## What we pull today (and discard)
`_shared/clover.ts → cloverListItems()` calls `/v3/merchants/{mId}/items?limit=100&offset=N` with **no
`expand`**, and keeps only:
```
id, name, price (cents), priceType   // everything else on the item is dropped
```
So categories, stock, cost, SKU/UPC, units — all available on the wire, none captured.

## Please paste back these three raw responses

1. **Items with the high-value expansions** (5–10 real items is plenty):
   ```
   GET /v3/merchants/{mId}/items?expand=categories,itemStock,tags,options&limit=10
   ```
2. **The category list:**
   ```
   GET /v3/merchants/{mId}/categories?limit=100
   ```
3. **One single item fully expanded** (pick a livestock item if possible):
   ```
   GET /v3/merchants/{mId}/items/{itemId}?expand=categories,itemStock,tags,modifierGroups
   ```

## The specific fields we're hoping to find (confirm present/populated for this merchant)

| Field (Clover) | Why we want it | Maps to |
|---|---|---|
| **`itemStock.quantity` / `stockCount`** | **THE BIG ONE** — if Clover inventory tracking is on, this is the current count and can seed our baseline directly | `inventory_items.quantity_available` |
| `categories.elements[].name` (+ id) | Organize the count decks the way you see them in Clover; seed `item_type` | new `clover_category` col + grouping |
| `code` (UPC/barcode) and/or `sku` | Barcode-scan matching during counts + receiving; stronger dedupe than name | new `clover_code`/`clover_sku` col |
| `cost` | Wholesale cost basis (we only have retail today) | `inventory_items.wholesale_cost` |
| `priceType` (`FIXED`/`VARIABLE`/`PER_UNIT`) + `unitName` | Livestock is often variable / per-unit priced — affects how we show price | display + pricing logic |
| `hidden`, `available` | Skip hidden; know what's POS-active | import filter |
| `modifiedTime` | Incremental re-sync instead of full re-pull | sync watermark |

## The one question that decides our whole approach
**Is Clover inventory tracking enabled for this merchant — i.e., does `itemStock.quantity` come back as
real numbers, or null/absent?**
- **If yes:** we can pull Clover's quantities as the baseline (the count deck becomes a *verify/correct*
  pass, not a from-zero count). Huge time saver.
- **If no:** quantities must be established by hand in the count deck (the plan we're already building),
  and we just pull categories/cost/code to organize and enrich it.

## After you paste the samples
We'll decide together which fields to import, then spec the concrete changes:
- columns to add (`clover_category`, `clover_code`/`sku`, maybe `clover_stock` snapshot) on
  `clover_item_links` and/or `inventory_items`,
- the `cloverListItems()` change to request `expand=categories,itemStock,...` and map the new fields,
- a re-import to backfill existing rows,
- and whether the baseline seeds from Clover stock or stays a manual count.

Nothing changes on the import until we see the real shape. **Just the three raw payloads + the
tracking-on/off answer, please.**
