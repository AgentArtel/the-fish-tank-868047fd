
## Goal

`gather-species-images` currently returns one weak Top Shelf hit per species and often picks the wrong fish. Take ownership of the scrape + match logic inside the edge function and iterate against live Firecrawl responses until the three verification species each return their actual fish as a high-confidence candidate.

Data contract is unchanged: per livestock line, clear stale unapproved rows, then insert multiple `species_image_candidates` rows (top 3–5) with `ai_match_confidence` set per row and `approved=false`. The app/human picks the winner.

## Approach

### 1. Probe the real Top Shelf endpoints (before writing code)

Use a throwaway script (run via `code--exec` with `FIRECRAWL_API_KEY` from secrets) to hit each candidate endpoint for the three verification species and inspect the actual JSON/HTML shape Firecrawl returns. Candidates, in priority order:

- `/search/suggest.json?q=<q>&resources[type]=product&resources[limit]=10` — current path; verify what `image`, `featured_image`, `images[]`, `url`, `title`, `vendor`, `tags` actually contain.
- `/search?q=<q>&type=product&view=json` (Shopify search JSON view, if exposed).
- `/search?q=<q>&type=product` HTML — parse product cards from rendered markup as a fallback.
- `/collections/saltwater-fish/products.json` (and `/collections/all/products.json`) — full product feed; cache-friendly, lets us do our own fuzzy match across titles/tags/body_html.

Pick the endpoint(s) that come back cleanly via Firecrawl with images + titles + URLs + (ideally) tags or body text we can match against.

### 2. Multi-query strategy per species

For each line, build a small ordered list of queries and union the results (dedup by product handle):

1. Clean common name (e.g. `Royal Gramma`).
2. Scientific name (e.g. `Gramma loreto`).
3. Last word of common name (e.g. `Gramma`, `Basslet`, `Firefish`) as a wider net.
4. Strip noise tokens: `pack`, `WYSIWYG`, `sm/md/lg`, sizes, counts, parenthetical qualifiers, trailing punctuation.

### 3. Score every product (not just first hit)

For each product returned, compute a title-match score combining:

- Token-set overlap between resolved common name and product title (case-insensitive, ignore stopwords like `the`, `aquacultured`, `captive`, `bred`, size suffixes).
- Bonus if scientific name (or genus) appears in title / tags / body_html.
- Penalty for obvious mismatch tokens (different family names, e.g. "Wrasse" when we're looking for a Gramma).

Keep top N (~6) by title score for vision verification.

### 4. AI-vision verification (filter + final rank)

Score each surviving candidate with `aiMatchConfidence(imageUrl, scientific || common)`. Combine:

- `final = 0.6 * vision_confidence + 0.4 * title_score` (or similar).
- Drop candidates with `vision_confidence < 0.35` (filters wrong species even when title matched coincidentally).
- Keep top 3–5 and insert as candidate rows with the vision score stored in `ai_match_confidence`.

If Top Shelf returns nothing usable after filtering, fall back to Wikipedia + iNaturalist (already wired) so the human always has something to approve or reject.

### 5. Iterate against the three verification species

This is the key step the user asked for. Loop:

1. Deploy current edge function with `supabase--deploy_edge_functions`.
2. Either: invoke against a real content item via `supabase--curl_edge_functions`, OR run the scrape/match logic standalone in the sandbox (using the same Firecrawl key) against `Royal Gramma`, `Chalk Basslet`, `Helfrich's Firefish` to see ranked candidates.
3. Inspect: are the top candidates actually that fish? Are wrong-species products filtered out by vision? Are the title-score weights right?
4. Adjust query list, tokenization, weights, or endpoint choice; redeploy; repeat until each species reliably surfaces its real photo in the top candidates.
5. Check `supabase--edge_function_logs` for failures/timeouts along the way.

### 6. Keep the contract intact

- `verify_jwt = true`, editor gate via `can_edit_content` — unchanged.
- Clear stale unapproved rows for the batch's lines before inserting — unchanged.
- Per-row fields: `vendor_line_item_id`, `species_key`, `source='topshelf'|'wikipedia'|'inaturalist'`, `source_url`, `image_url`, `license`, `attribution`, `commercial_ok=false` for Top Shelf, `ai_match_confidence`, `approved=false`, `created_by` — unchanged.
- Return shape `{ created, perSpecies: [{ lineId, speciesKey, added, note? }] }` — unchanged. (May add a `topScore` per species in `note` for easier debugging.)

## Files

- `supabase/functions/gather-species-images/index.ts` — rewrite `fromTopShelf` + add scoring helpers + adjust orchestration in the per-line loop. No other files change.

## Out of scope

- App-side changes (PR #69 stays as-is).
- Schema changes.
- Auto-approval — still human-gated.
- Storage upload on approve (separate task).

## Done when

Invoking the function for a batch containing Royal Gramma (Gramma loreto), Chalk Basslet (Serranus tortugarum), and Helfrich's Firefish (Nemateleotris helfrichi) inserts 3+ candidates per line, and for each line the correct species appears as one of the top candidates by `ai_match_confidence`, with obvious wrong-species hits filtered out.
