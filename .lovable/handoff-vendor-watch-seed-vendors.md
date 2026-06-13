# Hand-off — Vendor Watch: seed 3 new vendor sources (for Lovable / DB owner)

Date: 2026-06-13 · Author: Claude Code. Ship the migration below to seed three
researched vendors. Designed to extend to authenticated scraping later without
re-seeding (we use the existing `auth_method` column, default `'none'`).

## Context / research

All three are datacenter-IP bot-blocked (same as Furnace), so each is seeded with
**`prefer_firecrawl = true`**. We try them **without login first** (`auth_method
= 'none'`); if a storefront turns out to be password/login-walled we extend that
one source to authenticated fetching (design at the bottom) — no re-seed needed.

| Vendor | Platform | Source URL | Notes |
|---|---|---|---|
| World Wide Corals | Shopify (confirmed) | `worldwidecorals.com/collections/wysiwyg/products.json` | Clean yes |
| SoFlo Rubio's Corals | Shopify (`…myshopify.com`), **wholesale** | `soflowrubioscorals.us/products.json` | May be password-walled |
| Top Shelf Aquatics | Shopify? (mixed signals) | `topshelfaquatics.com/collections/live-corals-for-sale/products.json` | Verify on first refresh |

## The migration to ship (idempotent)

```sql
-- Seed three vendor-watch sources (researched 2026-06-13).
-- All datacenter-blocked → prefer_firecrawl = true. auth_method defaults to
-- 'none'; try public first, extend to authenticated per-source if walled.

INSERT INTO public.vendors (slug, name, website, notes) VALUES
  ('world-wide-corals', 'World Wide Corals', 'https://worldwidecorals.com',
   'Shopify retailer (Orlando). WYSIWYG collection. Datacenter-blocked → Firecrawl.'),
  ('soflo-rubios-corals', 'SoFlo Rubio''s Corals', 'https://soflowrubioscorals.us',
   'Wholesale Shopify distributor (Miami). Weekly "album" drops. May be password-walled.'),
  ('top-shelf-aquatics', 'Top Shelf Aquatics', 'https://topshelfaquatics.com',
   'Coral retailer (Central FL). Platform unconfirmed (Shopify vs WooCommerce) — verify.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.vendor_scrape_sources
  (vendor_id, name, kind, source_url, cadence, prefer_firecrawl, auth_method, notes)
SELECT v.id, s.name, 'shopify_public', s.source_url, s.cadence, true, 'none', s.notes
FROM (VALUES
  ('world-wide-corals', 'WYSIWYG',
   'https://worldwidecorals.com/collections/wysiwyg/products.json', 'daily',
   'WYSIWYG drops; Firecrawl (datacenter-blocked).'),
  ('soflo-rubios-corals', 'Weekly album',
   'https://soflowrubioscorals.us/products.json', 'weekly',
   'Wholesale; weekly album. If products.json returns the password page, switch this source to authenticated.'),
  ('top-shelf-aquatics', 'Live corals',
   'https://topshelfaquatics.com/collections/live-corals-for-sale/products.json', 'daily',
   'Verify Shopify vs WooCommerce on first refresh.')
) AS s(vendor_slug, name, source_url, cadence, notes)
JOIN public.vendors v ON v.slug = s.vendor_slug
ON CONFLICT (vendor_id, source_url) DO NOTHING;
```

(Note: `prefer_firecrawl` and `auth_method` columns already exist — no schema
change, pure data seed. `''` in `SoFlo Rubio''s` is the escaped apostrophe.)

## After it ships
The boss will **Refresh** each new source (admin "Refresh now") and report:
- **WWC** — expect items via Firecrawl.
- **SoFlo** — if it errors/returns a tiny/locked payload, it's password-walled →
  we extend to authenticated (below).
- **Top Shelf** — if it errors with no/zero products, it's likely WooCommerce
  (no `products.json`) → needs a separate adapter.

## Designed-for-later: authenticated scraping (do NOT build now)

The path, so this seed doesn't need redoing:
1. **Credentials in Vault**, server-side only — e.g. a secret per source
   (`scrape_auth_<source_id>`) holding a cookie string / bearer / basic JSON.
2. Set the source's existing **`auth_method`** column to `cookie` / `bearer` /
   `basic`.
3. **Claude's lane:** `runScrapeForSource` reads the Vault secret when
   `auth_method != 'none'` and attaches it — as a `Cookie`/`Authorization` header
   on the direct fetch, and via Firecrawl's `headers` param on the Firecrawl path
   (Firecrawl supports custom request headers/cookies for authenticated scrapes).

No new columns needed for the seed; the auth extension is purely additive when a
specific vendor proves to require login.

## Not in scope
Quality Marine (`qualitymarine.com`) is **not** seeded — it's a login-walled B2B
distributor with no public `products.json`. Keep it on the invoice-parser path;
revisit only if authenticated scraping is worth building for it specifically.
