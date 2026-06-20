# Handoff → Lovable: Top Shelf species-image scrape via Firecrawl (you can live-test)

The new-arrivals feature needs a real fish photo per species by **searching Top Shelf Aquatics (a Shopify
store) and scraping the product image**. The whole app side is built and working — what's NOT working is the
actual **Firecrawl scrape of Top Shelf**, and Claude can't debug it because it runs server-side in the
deployed app (Claude can't execute/log prod). **You own + can live-test the Firecrawl integration, so this
part is yours.**

## What already works (app-lane, done — don't rebuild)
- Table `species_image_candidates` (Lovable shipped it): `vendor_line_item_id`, `species_key`, `source`,
  `source_url`, `image_url`, `license`, `attribution`, `commercial_ok`, `ai_match_confidence`, `storage_path`,
  `approved`, `approved_at`, `approved_by`, `created_by`.
- `gatherSpeciesImages` (`cms.functions.ts`): resolves each livestock line → a clean **common name** + a
  **scientific name** (via `callAIChat`), clears stale unapproved candidates, AI-vision-scores each
  candidate, and inserts rows. The "Find images" button, the per-species approve/reject UI on the post page,
  and approve→`media_assets`/`content_media` all work.
- The only failing call is `fromTopShelf(commonName)` → `fetchViaFirecrawl(...)` against Top Shelf's
  `search/suggest.json`. It returns nothing useful in prod.

## What we need from you
1. **Confirm the Firecrawl entrypoint in the deployed app.** Is `fetchViaFirecrawl()` in
   `scrape.functions.ts` (POSTs to `api.firecrawl.dev/v2/scrape` with `process.env.FIRECRAWL_API_KEY`) the
   correct way to call Firecrawl in prod — i.e. **is `FIRECRAWL_API_KEY` actually set in the deployed
   environment**? Or is there a Lovable-managed Firecrawl edge function / RPC we should call instead? Tell us
   the right entrypoint.
2. **Build (or fix) a reliable "search Top Shelf for a species → product image" using Firecrawl**, since you
   can test the real response. Given a common name (e.g. `Royal Gramma`):
   - Scrape Top Shelf — either `https://topshelfaquatics.com/search?q=Royal+Gramma&type=product` (HTML) or
     `https://topshelfaquatics.com/search/suggest.json?q=Royal+Gramma&resources[type]=product` (JSON) —
     whichever Firecrawl returns cleanly. Use Firecrawl's structured-extract if that's more reliable.
   - Return the first matching product's **image URL + product URL + title**.

## How to expose it (your call)
Either is fine — Claude will wire to whatever you build:
- **(A)** A function/RPC/edge-function `searchTopShelfImages(commonName)` → `[{ image_url, product_url, title }]`
  that `gatherSpeciesImages` calls in place of the current `fromTopShelf`, **or**
- **(B)** Write rows directly into `species_image_candidates`
  (`source='topshelf'`, `commercial_ok=false`, `approved=false`, plus `vendor_line_item_id`, `species_key`,
  `source_url`, `image_url`, `attribution`, `created_by`) given a batch/line + common name.

## Test species
`Royal Gramma` (Gramma loreto) · `Chalk Basslet` (Serranus tortugarum) · `Helfrich's Firefish`
(Nemateleotris helfrichi).

## Note on licensing (already acknowledged by the owner)
Top Shelf product photos are the retailer's copyright (not royalty-free) — flagged `commercial_ok=false`,
surfaced for manual human selection only, never auto-published. Owner-directed.
