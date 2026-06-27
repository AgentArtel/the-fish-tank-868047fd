# Backend Brief for the Lovable Agent — Public Website Data Layer

> **STATUS: DECISIONS LOCKED (2026-06-23).** The backend team confirmed the calls below; the
> design-system contract (`schemas/`, `public_read_models.sql`, `2026_website_enablement.sql`,
> `DATA_MODEL.md`) is updated to match. The Lovable agent owns the canonical single migration.
>
> - **§5 WYSIWYG = split (B):** `inventory_items.is_wysiwyg boolean` (set at intake, drives
>   badge + filter) · long-form copy = `products.description` (species/SKU evergreen) +
>   `inventory_items.specimen_notes` (per-specimen blurb). PDP body = `specimen_notes ++
>   products.description`.
> - **§6.1 RLS:** invoker views + explicit `GRANT SELECT TO anon` + anon SELECT policies on the
>   gated base rows (not definer views).
> - **§6.2 Storage:** separate **public `public-media` bucket**; "approve for website" copies the
>   chosen photo in (private `inventory-media` stays private; good for OG/social scrapers).
> - **§6.3 `is_house_line`:** public boolean on `inventory_items`. Confirmed.
> - **§6.4 `product_id`:** nullable/optional; view `LEFT JOIN`s and falls back. Publish gate does
>   not require it.
> - **NEW \u2014 publish gate flag:** `inventory_items.is_website_ready boolean`, trigger-maintained
>   (approved price + `needs_photo=false` + \u22651 `tag='website'` media + name + a description or
>   category). The view filters on this one column.
> - **`media_view` enum:** `daylight · actinic · video_still · other` (separate from the
>   `inventory_media_tag` publish flag). `is_primary` bool + partial unique index.
>
> The original brief follows for context.

---

**From:** the website-planning side (Claude Design + Claude Code build the public site locally,
push to Lovable). **To:** the Lovable agent that owns the Supabase backend / workspace app.

**Purpose:** before we lock any migration, here's the full context of what we're building on the
**public website** side and the data contract it needs. Please validate the proposed schema
changes against existing patterns (RLS helpers, enums, `attrs-editor.tsx` / `item-type-attrs.ts`,
naming) and tell us what to change. A couple of decisions below may have a *different* best
answer now that you can see the website plan — flag those.

---

## 1. What we're building (the public site)

A **decoupled, data-driven** public storefront (Vite + React + TS + Tailwind + shadcn/ui on
Lovable) that **auto-updates from the workspace app's Supabase**. It is read-only against the
backend and renders only what a small set of **public read-model views** return — it never
touches operational tables directly. Surfaces:

- **Catalog / collection grids** — product cards: photo, name + scientific name, price (with
  sale/compare-at + % OFF), stock state, a public sourcing/brand label, optional WYSIWYG badge.
- **Product detail (PDP)** — gallery (incl. a daylight/actinic photo view toggle), long-form
  description, care specs (care level, reef-safe, size, origin), price, add-to-cart.
- **Home / merch rows** — Weekly Specials (on sale), New Arrivals, category tiles.
- **Visit Us / footer / local SEO** — one canonical NAP + hours + service areas, LocalBusiness
  JSON-LD. (Store: The Fish Tank, 8371 700 W, Sandy, UT 84070, (801) 887-7000.)

Full spec lives in `data/DATA_MODEL.md`; the JSON-shape contracts are in `data/schemas/*.json`;
the proposed views are in `data/sql/public_read_models.sql`; the migration sketch is in
`data/sql/2026_website_enablement.sql`. This brief summarizes the asks.

## 1a. The contract IS the JSON (this is the whole ask)

Everything below boils down to: **the backend returns JSON that matches these schemas, and the
frontend renders it — nothing more.** The four shapes the website consumes are authoritatively
defined in `data/schemas/*.json` (JSON Schema 2020-12) with validating examples in
`data/samples/*.json`. The endpoints/views just need to return exactly these:

| Frontend surface | Returns | Schema | Example |
|---|---|---|---|
| Catalog grid, PDP | `PublicProduct` (array / single) | `schemas/public-product.schema.json` | `samples/public-product.sample.json` |
| Collection / merch rows | `Collection` (+ its products) | `schemas/collection.schema.json` | `samples/collections.sample.json` |
| Visit Us / footer / JSON-LD | `StoreLocation` | `schemas/store-location.schema.json` | `samples/store-location.sample.json` |
| Header / banner / nav | `SiteSettings` | `schemas/site-settings.schema.json` | `samples/site-settings.sample.json` |

Canonical `PublicProduct` the frontend expects (one object; grids return an array of these):

```json
{
  "id": "uuid",
  "slug": "gold-torch-coral-1a2b3c4d",
  "name": "Gold Torch Coral",
  "scientificName": "Euphyllia glabrescens",
  "type": "coral",                 // coral|fish|invert|supply
  "category": "Corals", "subcategory": "LPS",
  "price": 95.00,
  "compareAtPrice": 140.00,        // null when not on sale
  "currency": "USD",
  "availability": "available",     // available|on_hold|sold|coming_soon
  "isWysiwyg": false,
  "isHouseLine": false,
  "careLevel": "Intermediate",     // nullable
  "reefSafe": "Safe",              // nullable
  "originRegion": "Aquacultured",  // nullable
  "size": "3 heads",               // nullable
  "description": "…",              // long-form (HTML/MD ok)
  "careNotes": "…",                // nullable
  "tankLocation": "Sandy showroom",
  "images": [
    { "url": "https://…/public/…", "alt": "…", "isPrimary": true, "view": "daylight" }
  ],
  "badges": ["Sale"],
  "updatedAt": "2026-06-23T17:40:00Z"
}
```

The proposed views in `public_read_models.sql` already emit exactly these keys (camelCase). If a
column/decision below changes the shape, **update the schema first** — it's the source of truth,
and we validate API responses against it in CI so backend and frontend can't drift.

## 2. Hard rules from the website side

1. **Vendor & cost are admin-only — never public.** `wholesale_cost`, `vendor_id`, vendor names,
   OCR text, raw quantities, pricing workflow, internal notes, clover ids must never reach the
   public read model. The views select an explicit allow-list only.
2. **Curation gate = photo + info.** A listing is public only when it has a `website`-tagged
   photo (`needs_photo = false`) **and** the core info a shopper needs (name, approved price,
   and a description or category). Everything else stays hidden until staff complete it.
3. **One source of NAP/hours** so it's byte-identical everywhere (local-SEO #1 signal).

## 3. Confirmed mappings (please sanity-check against real enums)

- `availability_status`: `available`→in stock, `on_hold`→"On hold", `sold_out`→"Sold";
  `incoming/quarantine/needs_id/not_for_sale/dead_lost`→hidden. ✅ matches your enums.
- `pricing_status`: gate requires `approved` (the live value). ✅
- `item_type`: `fish/coral/invert` 1:1; `dry_good/live_rock/equipment/other`→`supply`. ✅
- media: `tag = 'website'` is the publish flag; **daylight/actinic is a separate dimension** so
  we proposed a new `media_view` column rather than overloading the tag enum. OK?

## 4. Proposed greenfield changes (the migration) — confirm or redirect

On `inventory_items` (dedicated columns): `compare_at_price numeric`, `is_house_line boolean`,
`product_id uuid FK→products`. In `attrs` (per-item-type, schema-driven): `care_level`,
`reef_safe`. On `inventory_media`: `media_view enum`, `is_primary bool`. On `store_locations`:
NAP + hours columns. New tables: `collections`, `site_settings`. (See the SQL file for exact DDL,
RLS, grants, seed.)

## 5. THE decision we most want your read on — `wysiwyg`

Context: in the reef-retail world "WYSIWYG" = *"what you see is what you get"* — the exact
specimen in the photo is the one that ships. On the website it drives (a) a **badge** and
(b) often a **longer, hand-written writeup** for that one-of-a-kind piece.

When we proposed this, your guidance was: *"`wysiwyg` (long-form HTML/MD) → real column."* So we
currently model **one `wysiwyg text` column** (the rich writeup) and derive the badge as
`isWysiwyg = wysiwyg IS NOT NULL`.

**Given the website plan above, which of these do you want? (this is the lock-in question):**

- **(A) Single `wysiwyg text` column** — rich writeup; badge derived from its presence. Simple,
  but you can't mark a piece "WYSIWYG" without writing copy, and you can't write long copy for a
  *non*-WYSIWYG item.
- **(B) Split into two:** `is_wysiwyg boolean` (the photo-accuracy flag, set at intake) **+**
  `description text` / `body_md text` (long-form copy, usable on *any* listing). The website
  reads the boolean for the badge/filter and the text for the PDP body. More flexible; matches
  how most reef stores actually operate (flag at receiving, copy later — or never).

Our lean is **(B)** because the badge and the long-form copy are independent concerns and the
catalog wants to *filter* on the boolean. But you own the workflow (intake via `attrs-editor`,
content priority, social_ready, etc.) — if (A) fits your processes better, we'll adapt the view.
Also confirm where the long-form copy should live if (B): a new column on `inventory_items`, or
on `products` (since `products.description` already exists and PDPs can join to it).

## 6. Other things to confirm

- **RLS:** we wrote public-read policies for `collections`/`site_settings` and definer
  (`security_invoker = off`) read-model views. Does that fit your `is_admin_or_dev()` /
  `is_floor_staff_or_above()` pattern, or do you prefer invoker views + an anon SELECT policy
  on the gated rows?
- **`is_house_line`** — boolean is what you suggested. The website would show it as a small
  "House Line" brand badge. Confirm it's public-safe (our in-house brand, not a vendor).
- **`product_id` link** — should every website-eligible `inventory_item` link to a `products`
  row (so curated species copy/care_notes always exist), or is that optional?
- **Storage URLs** — we build public URLs from `storage_path` via `app.storage_base`. Confirm
  the website bucket is public-read (or tell us the signed-URL pattern you prefer).

Once you confirm §5 and §6, we'll finalize `2026_website_enablement.sql` +
`public_read_models.sql` and hand them back as the single migration PR.

---

# PART 2 — Content & SEO surfaces (local authority)

> **STATUS: LOCKED (2026-06-23).** Backend confirmed all four §Part-2 calls; our contract
> (`sql/2026_content_seo.sql`, `schemas/article|author|faq|event.json`, `DATA_MODEL.md §8`)
> reflects them:
> - Copy lifecycles stay separate: `articles.body_md` · `products.description` · `inventory_items.specimen_notes`.
> - Related products = **join table** `article_products(article_id, inventory_item_id, sort_order)` (FK integrity + reverse "featured in" lookup).
> - Media = same public **`public-media`** bucket; subfolders `articles/<id>/`, `products/<id>/`, `inventory/<id>/`.
> - **Authoring in the workspace app:** admin/dev write only; status `draft → in_review → published → archived` with an admin/dev-only **publish guard trigger**; scheduled publish via `publish_at`; public gate = `published AND publish_at <= now()`. `content_authors` links to `profiles.id` (nullable) + standalone E-E-A-T fields.
> - Testimonials display-only (no review JSON-LD).
> - **Answers to your two questions:** (1) **events** = single-occurrence + nullable `series_id` self-FK (no RRULE) — agreed. (2) **redirects** = `from_path` unique, **no hits counter** (use web logs / Search Console).
>
> Original Part 2 context follows.

Separate, additive migration (`sql/2026_content_seo.sql`) — same patterns as the catalog layer
(INVOKER read-model views in `public_web`, published-only gate, RLS via `is_admin_or_dev()`).
This is the content engine that builds local search authority beyond the product catalog.

**New tables (DDL + RLS + grants + read-model views in the SQL file):**

- `content_authors` — bylines + credentials for **E-E-A-T** (`author` schema).
- `articles` — one table for **blog posts**, **care/help guides**, and **landing/topic pages**
  (`kind ∈ post|guide|page`, `status` workflow, `seo jsonb`, `topics[]`, `tags[]`,
  `related_product_ids[]` to cross-link the catalog). → `public_articles` (`article` schema).
- `faqs` — standalone or attached to an article/inventory item → `public_faqs` (`faq` schema);
  also rendered as `FAQPage` JSON-LD.
- `events` — frag swaps / live sales / classes → `public_events` (`event` schema); `Event` JSON-LD.
- `testimonials` — display only (see review-markup caution below).
- `redirects` — 301/302 to preserve link equity on slug changes → `public_redirects`.

**Decisions we'd like your read on:**

1. **Reuse `products.description`?** Guides/SKU evergreen copy — keep article bodies in the new
   `articles.body_md`, and leave `products.description` for species/PDP copy? (We assume yes —
   articles and product copy are different lifecycles.)
2. **`related_product_ids uuid[]` vs a join table** — we sketched a `uuid[]` referencing
   `inventory_items.id`. If you'd rather a `article_products` join table for FK integrity, say so.
3. **Media** — articles/guides hero + inline images: serve from the same public `public-media`
   bucket? (We assume yes, consistent with product photos.)
4. **Authoring surface** — will staff author articles/guides inside the workspace app (so we
   need admin CRUD + the `status` workflow), or via a separate CMS? Affects where write RLS lands.
5. **Review markup** — we will NOT inject `Review`/`AggregateRating` JSON-LD on `LocalBusiness`
   (Google penalizes self-serving markup). Testimonials are display-only; aggregate ratings come
   from the Google Business Profile. Flagging so no one adds it later.

**Not your layer, but required for SEO to work (front-end / ops, noted for completeness):**
prerendered HTML per indexable route, `sitemap.xml` from published slugs, `robots.txt`,
per-route canonical + OG tags, honoring `redirects`, fast Core Web Vitals — plus the off-site
local play (Google Business Profile, consistent NAP citations, reviews, local backlinks).

Confirm §Part-2 items 1–4 and we'll finalize `2026_content_seo.sql` + the content views alongside
the catalog migration.
