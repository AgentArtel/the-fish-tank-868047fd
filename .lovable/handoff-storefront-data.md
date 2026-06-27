# Handoff → Lovable: storefront data fixes (so the public site shows real content)

> Storefront Phase 0+1 is merged (public chrome + product page over the `v_public_*` views). The pages
> build and render, but they'll show **placeholder/empty** content until these DB-side items land. All
> `[DB=Lovable]`. The frontend already reads these exact fields — no app change needed once they're set.

## 1. Reseed the store location → **Sandy, UT** (currently Phoenix, AZ)
`v_public_locations` / `store_locations` is seeded with a Phoenix address. The footer + the
**LocalBusiness/PetStore JSON-LD** read it directly, so the whole site (and SEO) shows the wrong NAP.
Reseed the canonical record (and ensure `is_public = true`, `is_active = true`):
- **The Fish Tank · 8371 700 W, Sandy, UT 84070 · (801) 887-7000**
- Hours: Mon–Fri 11:30am–8pm · Sat 11am–6pm · Sun 11am–4pm (populate the structured hours the view exposes).
- Service areas: Salt Lake Valley (Sandy, Draper, South Jordan, West Jordan, Midvale, Murray, Cottonwood Heights, Riverton…). The storefront reads `getStoreLocation()` with slug `sandy` (falls back to the first row).

## 2. Project `site_settings.data` onto `v_public_site_settings`
The migration added `data jsonb` to the `site_settings` **table** but the **view exposes only flat columns**
(`site_title, tagline, default_og_image_path, social, announcement, storage_base, updated_at`). So
`serviceAreas`, structured `social`, etc. inside `data` aren't publicly readable. Please project the needed
`data` keys onto `v_public_site_settings` (or add explicit columns) so the storefront can read service
areas + socials. Confirm `social` + `announcement` shapes the frontend expects (object vs jsonb).

## 3. Confirm `storage_base` is set
Image URLs = `storage_base` + media path. The view exposes `storage_base`; just confirm it holds the
public bucket base (you seeded `…/public-media` earlier) so URLs resolve.

## 4. The "approve for website" pipeline (the big one — zero products show without it)
`v_public_inventory` only returns rows where `is_website_ready = true`, and product images come from
**`public-media`** (the public bucket), not the private `inventory-media`. Until items are published:
- `/products/$slug` 404s and cards use the placeholder.
- **Need at least one fully website-ready item to smoke-test the live PDP.**
Please confirm the `public-media` bucket exists + the trigger/flow that (a) flips `is_website_ready` and
(b) copies the primary photo into `public-media`. The **staff-facing "Publish to website" UI** is app-side
(Claude will build it as a follow-up) — but the bucket + any DB trigger/`is_website_ready` gate logic is
yours. For now: can you flag 1–2 items website-ready with a public photo so we can verify the PDP renders?

## 5. Optional projections (PDP completeness)
`v_public_inventory` doesn't project `products.care_notes` / `description` (the PDP care block is null).
Project them if you want the care/description content on product pages; otherwise the frontend derives what
it can from `attrs`.

## Reply with
The Sandy reseed done + which `data` keys are now on `v_public_site_settings`, `storage_base` confirmed, and
**1–2 website-ready test items** (slugs) so I can verify the live product page. Then I'll build the next
storefront phase (catalog) + the staff "Publish to website" flow.
