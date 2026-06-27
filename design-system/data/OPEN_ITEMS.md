# Open Items — backend (Lovable) coordination

The frontend data layer (`data/client/tft-data.js`) maps the shipped snake_case `v_public_*`
views into the camelCase schema shapes and derives unbacked fields. Reconciled against the final
confirmed column lists. Frontend can build now.

## Confirmed & wired (final column names)
- `v_public_inventory`: `id, slug, item_name, scientific_name, item_type, availability_status,
  retail_price, compare_at_price, is_wysiwyg, is_house_line, specimen_notes, product_id,
  location_id, attrs, updated_at, primary_media_id, primary_media_path, primary_media_view`.
  → `category/subcategory/size/care_level/reef_safe/origin_region` read from `attrs`. `slug` is a
  real generated STORED column now, so `getProductBySlug` works (PDP can route by slug). ✅
- `v_public_articles`: author is `author_id` (FK) → we cache `v_public_authors`
  (`display_name, slug, credentials, …`) and resolve in the mapper. `topics` not stored → mapped
  from `tags`. SEO from `seo_title/seo_description/og_image_path`. ✅
- `storage_base` seeded; image URLs build from `v_public_site_settings`. ✅

## Needs a backend touch
1. **Service areas are seeded for the WRONG metro.** They were seeded as Phoenix
   (Phoenix/Scottsdale/Mesa/Tempe/…). The Fish Tank is **Sandy, UT** — please reseed
   `site_settings.data.serviceAreas` to the **Salt Lake Valley**:
   `["Sandy","Salt Lake City","Draper","South Jordan","West Jordan","Midvale","Lehi","Murray","Cottonwood Heights"]`.
   (Also sanity-check `v_public_locations` address/geo are the Sandy store, not AZ.)
2. **Media-id → path for articles/authors.** `v_public_articles.hero_media_id` and
   `v_public_authors.avatar_media_id` are FKs, but no path is projected — so article hero images
   and author avatars can't resolve to URLs. Today we fall back to `og_image_path` for the hero
   and leave avatars null. Please project the resolved storage paths (e.g.
   `hero_media_path`, `avatar_media_path`) on those views, mirroring `primary_media_path` on
   inventory. Then we drop the fallbacks.

## Still pending (non-blocking)
- Anon SELECT policies cover the gated base rows (invoker views).
- `is_website_ready` recompute trigger on `inventory_media` insert/delete of `tag='website'`.
- Deferred app PRs: "approve for website" photo copy (private→public-media), admin CRUD, seed rows.
- Final `v_public_*` DDL diff vs `data/sql/public_read_models.sql` to certify full parity.

## Backend FYI (no frontend action)
- Clover re-import complete: 1262 unique items; type distribution dry_good 486 · fish 361 ·
  null 259 · coral 97 · invert 59. The 259 nulls are uncategorized in Clover → render as
  `type: "supply"` via our mapper fallback. VARIABLE-price livestock now stays `not_priced`
  (won't pass the publish gate until priced) — correct.

---
_Status: build proceeds; items 1–2 are quick backend fixes that improve correctness (region) and
images (article/author media)._
