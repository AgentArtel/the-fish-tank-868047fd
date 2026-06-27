# Handoff → Claude Code: The Fish Tank — public website build

**Project: The Fish Tank — public website (Vite + React + TS + Tailwind + shadcn/ui → Lovable)**

You're receiving a complete design system + data contract + route references for **The Fish
Tank**, a saltwater fish & coral retailer in **Sandy, UT**. The design/data planning is done.
Your job is to build the public storefront in our Vite/React app and push to Lovable, which hosts
it and owns the Supabase backend (already migrated). The site is **decoupled and data-driven** —
it reads published data from Supabase and auto-updates as staff manage inventory.

## What we did (context)
- Built the **design system** — blue-tang brand palette (electric blue `#0078ff`, cyan, yellow
  tail, navy; cool neutrals), tokens in `styles.css` + `tokens/`, and components
  (`Button, Badge, Card, Input, Select, ProductCard`). The home page already exists as a full
  interactive UI kit at `ui_kits/website/`.
- Defined the **backend→frontend JSON contract** (`data/schemas/*.json`) and built a
  **data-access layer** (`data/client/tft-data.js`) that maps the shipped Supabase `v_public_*`
  views (snake_case) into those camelCase shapes and derives unbacked fields. **Components read
  the schema shape; never re-map or hit Supabase directly.**
- The Supabase migrations shipped (catalog + content/SEO): products, collections, store location,
  site settings, articles/guides, authors, FAQs, events, redirects — all anon-readable
  `v_public_*` views, gated to published rows only.
- Wrote **route references** (`reference/*.tsx.txt`) and **handoff briefs** for every page.

## What you need to do
1. Read first, in order: `data/DATA_MODEL.md` (architecture + curation gate),
   `data/INTEGRATION.md` (Lovable wiring — providers, `initTftData`, TanStack Query + Realtime,
   SPA SEO/prerender), then `reference/README.md`.
2. Copy `data/client/tft-data.js` → `src/lib/tft-data.js` and do the one-time app setup in
   `data/INTEGRATION.md §0` (Supabase client injection, QueryClientProvider, HelmetProvider).
3. Build routes from the references — **rename each `reference/*.tsx.txt` → `.tsx`** — following
   the handoffs in this order:
   - `reference/HANDOFF_ProductDetail.md` → PDP (build first; establishes the pattern)
   - `reference/HANDOFF_Catalog.md` → `/shop` + `/collections/:slug`
   - `reference/HANDOFF_Content.md` → Visit Us, Blog, Guides, Events, FAQ
   - Home: port `ui_kits/website/` markup, swapping its mock `TFT_DATA` for the same
     `tft-data.js` fetchers.
4. Per-file adjustments are in each handoff: fix import paths (`@/lib/tft-data`,
   `@/components/ds`), swap `<i data-lucide>` for `lucide-react` components, add `react-markdown`
   for article/FAQ bodies, expose this design system's components via `@/components/ds`.
5. Honor `getRedirects()` (301s), generate `sitemap.xml`/`robots.txt`, emit the per-route JSON-LD
   shown in the references, and **prerender/SSG all indexable routes** (a bare SPA won't rank —
   this matters for local SEO).

## Hard rules
- NAP (name/address/phone) is sourced only from `getStoreLocation()`/`getSiteSettings()` — never
  hard-code it.
- Vendor/cost data is admin-only and is not in the views — don't surface it.
- Do **not** add `Review`/`AggregateRating` JSON-LD (Google penalizes self-serving markup);
  testimonials are display-only.

## Verify during the first build (PDP)
The data layer made reasonable assumptions about a few column names (`retail_price`,
`availability_status`, `primary_media_path`, and the `attrs` keys `category`/`care_level`/etc.).
**Diff the live `v_public_inventory` + `v_public_articles` columns against the mappers in
`tft-data.js` on the PDP** and flag mismatches — that's the one place reality could differ from
our map. Everything else (fetchers ↔ references ↔ schemas) is verified consistent.

## Known issues to resolve before launch — read `data/FIX_BEFORE_LAUNCH.md`
- 🔴 The Supabase **store-location row is seeded with Phoenix, AZ data** — Visit Us + JSON-LD will
  show the wrong city until Lovable reseeds it to Sandy / Salt Lake Valley.
- 🔴 Article hero + author avatar images won't resolve until the views project `hero_media_path` /
  `avatar_media_path` (we fall back to OG image / null meanwhile).
- 🔴 Product photos are placeholders until the "approve for website" flow populates `public-media`.
- 🟡 Blog/guides/events/FAQ/collections are **empty until staff author content** — the routes
  render empty states and populate automatically (`status='published' AND publish_at <= now()`).
  Build them anyway. Guides are the SEO priority.
- Fonts are substitutes (Bricolage Grotesque / Plus Jakarta Sans / JetBrains Mono) — confirm.

## Where everything is
- `styles.css` + `tokens/` — design tokens · `components/` — DS components · `ui_kits/website/` —
  home reference (interactive, mock data)
- `data/DATA_MODEL.md`, `data/INTEGRATION.md`, `data/schemas/`, `data/samples/`, `data/sql/` —
  the contract + read models + shipped migrations
- `data/client/tft-data.js` — the data layer you wire to
- `reference/` — every route's `.tsx.txt` + `HANDOFF_*.md` + `README.md`
- `data/FIX_BEFORE_LAUNCH.md`, `data/OPEN_ITEMS.md` — launch blockers + backend follow-ups
- `data/LOCAL_SEO_CHECKLIST.md` — off-site SEO (owner task, FYI)
- `data/BACKEND_BRIEF.md`, `data/WEBSITE_BUILD_SPEC.md` — full backend brief + page-by-page spec

Start with `data/DATA_MODEL.md` and `reference/README.md`, then build the PDP. Flag anything in
the references that doesn't match the live `v_public_*` columns and we'll reconcile.
