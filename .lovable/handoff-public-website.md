# Plan: The Fish Tank public storefront

Adapts the `design-system/` handoff (written for a Vite SPA + react-router + react-helmet + a client
`tft-data.js` + Realtime) to **this repo**: TanStack Start (SSR, file routes, server fns, `head()`), with
the `v_public_*` views already live and `/catalog` already shipped.

> **⚠️ Update — brand unification.** The internal app is being re-skinned to the SAME design-system brand
> (electric-blue blue-tang). So the original "two brands / `.tft-public` token isolation" (Section 2) is
> **superseded**: the design-system tokens/fonts become the **app-wide** theme (via the re-skin), and the
> storefront simply uses them directly — no scoping wrapper, load fonts globally. Everything else stands.

## The reconciliation (handoff assumes → this repo → decision)
- react-router → **TanStack file routes** under a `(public)` group; `useParams`→`Route.useParams`, `<Link>`→TanStack.
- react-helmet → **`head()`** per route (titles, OG, canonical, JSON-LD via a `scripts` entry).
- client `tft-data.js` + anon supabase-js → **extend the server-fn pattern** (like `getPublicCatalog`); reuse `tft-data.js`'s snake→camel mappers as a server-side reference; **don't ship it**.
- Supabase Realtime → **drop it**; SSR + TanStack Query `staleTime`/refetch is enough.
- Prerender/SSG → SSR already gives crawlable HTML; optional static prerender for `/`, `/visit`, `/faq`.

## Routing — a `(public)` layout group (separate from `_app`)
`src/routes/(public)/route.tsx` = storefront chrome (header/nav/footer + `<Outlet/>`, **no auth guard**).
Pages (from the reference components): `index.tsx` (home ← `ui_kits/website/Home.jsx`), `shop.tsx` +
`collections.$slug.tsx` (← `Catalog.tsx.txt`), `products.$slug.tsx` (← `ProductDetail.tsx.txt`),
`visit.tsx`, `blog.*`/`guides.*` (← `ArticleList/Detail`), `events.tsx`, `faq.tsx`. Port rules per
component: react-router→TanStack imports, Helmet→`head()`, `data-lucide`→`lucide-react`, DS primitives→
reuse `@/components/ui/*` (port only `ProductCard` → `src/components/storefront/`). Confirm `react-markdown`
is available for article/FAQ bodies.

## Data — `src/lib/public-site.functions.ts` (server fns over the `v_public_*` views)
`getProductBySlug`, `listProducts`/`getCollectionProducts`, `getStoreLocation`/`getSiteSettings`,
`listArticles`/`getArticleBySlug`, `listFaqs`, `listEvents`, `getRedirects` — each shaped via the
`tft-data.js` mappers, server-side, using the existing `catalog.tsx` loader pattern (`ensureQueryData` +
`useSuspenseQuery`). **Image URLs** = `primary_media_path` + `site_settings.storage_base` (the public
`public-media` bucket), NOT the existing catalog's signed-URL-from-private-bucket approach.
**Reconcile `/catalog`:** the shipped `getPublicCatalog` queries raw `inventory_items` (no `is_website_ready`
gate) — the storefront must use the gated `v_public_inventory`. Recommend `/shop` as canonical + 301
`/catalog`→`/shop`.

## SEO — `head()` per route
Titles/description/canonical/OG/Twitter + **JSON-LD** (LocalBusiness from `getStoreLocation` — NAP never
hard-coded; Product+Offer on PDP; ItemList+Breadcrumb on shop; Article+Person on posts; FAQPage; Event).
No Review/AggregateRating (hard rule). Add `sitemap.xml` + `robots.txt` server routes from published slugs;
honor `getRedirects()` 301s in the `(public)` layer.

## The `/`-flip
**Delete `src/routes/index.tsx`** (the redirect-only route) so `(public)/index.tsx` owns `/` as the public
home. Internal app stays behind `/login`→`/dashboard` (`_app` unchanged). PWA `start_url` stays `/dashboard`
(no manifest change). Update `catalog.tsx`'s "Staff sign in" `<Link to="/">` → `/login`. Decide: do
logged-in staff see the storefront at `/` (recommended) or auto-bounce to `/dashboard`?

## Admin-side curation gaps (the site needs content; flag, don't block)
The `v_public_*` views only show gated rows. To produce them:
- **"Approve for website" flow** — copy photo private→`public-media`, set `is_website_ready` `[App]`+`[DB=Lovable]`. **Without this, zero products are public.** (Ties into the inventory work.)
- Staff editor for `compare_at_price` / `specimen_notes` / `is_wysiwyg` / `is_house_line` on the item page `[App]`.
- Articles / authors / FAQs / events / collections **admin UIs** — tables/views exist, no admin UI in-app yet `[App]` or author directly in Lovable `[DB]`.
- `[DB=Lovable]` projections: article hero / author avatar paths; `products.care_notes`/`description` onto `v_public_inventory`.

## Pre-launch blockers (from FIX_BEFORE_LAUNCH / OPEN_ITEMS)
1. **Store location is seeded Phoenix, AZ → must be Sandy, UT** (Visit Us + LocalBusiness JSON-LD). `[DB=Lovable]`
2. Article hero / author avatars null until view paths projected. `[DB=Lovable]`
3. Product photos placeholder until the "approve for website" flow populates `public-media`.
4. **Fonts** (Bricolage Grotesque / Plus Jakarta Sans / JetBrains Mono / Pacifico) are *substitutes* — confirm or supply real brand fonts.
5. Home stats/copy, PDP reviews block = mock — copy pass / remove.

## Assets → `public/storefront/`
`logo-fish.png` + `logo-fish-white.png`, the wave/coral dividers, `fish-on-black.png`; an OG default.
(Internal `public/brand/*` stays for the workspace/PWA.)

## Phased sequence (each = one buildable chunk)
0. **Foundation** — storefront chrome layout + `getSiteSettings`/`getStoreLocation` + `ProductCard` port + assets. (Tokens/fonts come from the app-wide re-skin.)
1. **PDP** (`/products/$slug`) — `getProductBySlug` (validate columns vs `v_public_inventory`), Product/Offer JSON-LD, gallery, sold-out/not-found. *Establishes the pattern.*
2. **Catalog** (`/shop`, `/collections/$slug`) — `listProducts`/`getCollectionProducts`; reconcile `/catalog`.
3. **Home + Visit Us** — port `Home.jsx` to server fns; do the `/`-flip.
4. **Content** — blog/guides/events/FAQ + author join; render empty states until authored.
5. **SEO/launch** — sitemap/robots/redirects; resolve the `[DB=Lovable]` blockers (reseed Sandy, project media, NAP); confirm fonts; finalize copy.

## Critical files
`src/lib/catalog.functions.ts` (pattern to extend) · `src/routes/catalog.tsx` (loader/`head()` + reconcile) ·
`src/routes/index.tsx` (delete for the flip) · `design-system/data/client/tft-data.js` (mappers to reimplement
server-side) · `supabase/migrations/20260623234737_*.sql` (live `v_public_inventory` columns + slug).
