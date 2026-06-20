# Handoff → Lovable: `gather-species-images` Supabase Edge Function (Firecrawl + Top Shelf)

**Architecture correction (owner-directed):** the species-image sourcing must be a **Supabase Edge
Function**, not app-side TanStack server functions. External integrations (Firecrawl, AI) belong in an edge
function Lovable owns — decoupled, data-driven, independently deployable and **live-testable** (which is the
whole reason the app-side version couldn't be debugged). The app becomes a thin data consumer.

## The split
- **Lovable (edge function + integrations):** all the external work — Firecrawl scrape of Top Shelf, AI name
  resolution + vision verify — lives in a Supabase Edge Function that **writes `species_image_candidates`**.
- **Claude (app, thin/data-driven):** "Find images" just invokes the edge function; the UI reads the
  `species_image_candidates` table (RLS select) and approve/reject are plain data writes. Claude will **remove
  all external HTTP from the app server functions** (`gatherSpeciesImages`, `fromTopShelf`, `fromWikipedia`,
  `fromINaturalist`, `resolveSpecies`, `aiMatchConfidence`, the Firecrawl import).

## Edge Function to build: `gather-species-images`
- **Invoke:** `supabase.functions.invoke('gather-species-images', { body: { contentItemId } })`, called by an
  authenticated editor. Verify the caller is an active editor (JWT) before doing work.
- **Logic (per livestock line on the post's `source_vendor_batch_id` batch):**
  1. Resolve the line's messy name → a clean **common name** + **scientific name** (AI; the Firecrawl/AI keys
     live in Supabase secrets on your side).
  2. **Top Shelf (primary):** Firecrawl-scrape `https://topshelfaquatics.com/search?q=<common name>&type=product`
     (or `search/suggest.json`) and pull the first product's image URL + product URL + title. **You can test
     the real Firecrawl response and pick what parses cleanly.**
  3. Optional license-clean fallback: Wikipedia REST / iNaturalist by scientific name.
  4. AI-vision score each candidate (does it depict the species?) → `ai_match_confidence`.
  5. Clear stale **unapproved** candidates for those lines, then insert fresh rows.
- **Writes `species_image_candidates`** (cols): `vendor_line_item_id`, `species_key`, `source`
  (`topshelf`/`wikipedia`/`inaturalist`), `source_url`, `image_url`, `license`, `attribution`,
  `commercial_ok` (false for Top Shelf — retailer copyright, human-approve only), `ai_match_confidence`,
  `approved=false`, `created_by`.
- **Return** `{ created, perSpecies: [{ lineId, speciesKey, added }] }` (the app refetches the table after).

## Livestock lines query (reference)
`vendor_line_items` where `vendor_batch_id = <batch>`, `kind='sellable'`, and
`item_type IS NULL OR item_type IN (fish,coral,invert,live_rock)` (item_type is NULL after AI extraction).
Names: `scientific_name`, else `clean_item_name` / `raw_description`.

## Already done on the app side (don't rebuild)
`species_image_candidates` table, the "Find images" button + per-species approve/reject UI on the post page,
and approve→`media_assets`/`content_media` (materializes the chosen image into the `media` bucket).

## Test species
Royal Gramma (Gramma loreto) · Chalk Basslet (Serranus tortugarum) · Helfrich's Firefish (Nemateleotris helfrichi).

## Note
Top Shelf product photos are the retailer's copyright (not royalty-free) → `commercial_ok=false`, surfaced for
manual human selection only, never auto-published. Owner-directed.
