## What changes

### 1. Real CRUD on draft posts
Replace the browser `confirm()` with the shadcn `AlertDialog` (matches the rest of the app), surface server errors inline, and remove the row optimistically with rollback on failure. Applies to both the content list (`/content`) and the content detail page (`/content/$id`).

### 2. Cut the image scraper
- Delete edge function `supabase/functions/gather-species-images/` and its entry in `supabase/config.toml`.
- Drop `species_image_candidates` table (migration).
- Remove server fns `listSpeciesImageCandidates`, `approveSpeciesImage`, `rejectSpeciesImage`, and the now-orphaned `materializeIntoMediaBucket` helper from `src/lib/cms.functions.ts`.
- Remove the `SpeciesImagesSection` / `CandidateTile` components from `src/routes/_app/content.$id.tsx`.

### 3. Upload-once species image library
The existing `media_assets` table already holds uploaded images. We tag each one with the species it represents, then look it up by species on every future post.

**Schema:** add `species_key TEXT` (nullable) + index to `media_assets`. The key is `lower(trim(scientific_name))` when present, otherwise `lower(trim(clean_item_name))`.

**New section on the post detail page — "Species images":** lists each livestock line from the linked batch. For each line:
- If a `media_asset` already exists for that `species_key`: show the thumbnail with an "Attach to post" / "Attached" button (no re-upload needed — this is the reuse path).
- If none exists: an inline "Upload image" file picker that uploads to the `media` bucket, inserts a `media_asset` with `species_key` set, and auto-attaches it to the post via `content_media`.

**Auto-attach on post build:** `buildArrivalPostFromBatch` already creates the draft `content_item` from the batch's livestock lines. After insert, it now looks up `media_assets` by each line's `species_key` and inserts the matches into `content_media`. So the second time a species shows up in any PO, the post comes back pre-illustrated — zero clicks needed.

**Button preserved:** the existing "Build new-arrivals post" button on the batch page is unchanged.

## Technical notes

- `media_assets` rows are global (no per-post FK), so adding `species_key` makes them naturally reusable across every post.
- The species lookup is case/whitespace-insensitive; the same column populated client-side at upload time and server-side at post-build time so it stays consistent.
- Cascade deletes already handle `content_media` and `content_platforms` when a `content_item` is deleted — no extra cleanup needed for the delete hardening.
- Drop migration for `species_image_candidates` includes `DROP POLICY` and `REVOKE`/`DROP TABLE CASCADE` so RLS objects are cleaned up.
- Edge function deletion uses `supabase--delete_edge_functions` to remove the deployed function, plus removing the local source + config entry.

## Files touched

- `supabase/migrations/<new>.sql` — add `media_assets.species_key`, index; drop `species_image_candidates`.
- `supabase/functions/gather-species-images/` — deleted.
- `supabase/config.toml` — remove function entry.
- `src/lib/cms.functions.ts` — remove scraper fns; extend `buildArrivalPostFromBatch` with the species-image auto-attach; add `uploadSpeciesImage` + `listSpeciesMediaForBatch` server fns (or use direct client calls — to be picked at build time).
- `src/routes/_app/content.index.tsx` — AlertDialog + optimistic delete.
- `src/routes/_app/content.$id.tsx` — AlertDialog + optimistic delete; replace `SpeciesImagesSection` with new upload/reuse `SpeciesMediaSection`.

## Out of scope

- No changes to the "Build new-arrivals post" button itself or to any other batch UI.
- No bulk import of historical media — only future uploads get tagged.
