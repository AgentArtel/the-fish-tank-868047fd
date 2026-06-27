# The Fish Tank — Website Build Spec

The page-by-page build plan for the public site (Vite + React + Tailwind + shadcn/ui on Lovable),
wired to the data layer in `data/client/tft-data.js` and this design system's components.

> **Convention:** _italic text marks SEEDED / PLACEHOLDER / ASSUMED data_ — wrong or sample
> values that must be replaced with live data before launch. See `FIX_BEFORE_LAUNCH.md` for the
> consolidated register. Anything not italic is confirmed/structural.

> **Identity (confirmed):** The Fish Tank · _8371 700 W, Sandy, UT 84070_ · _(801) 887-7000_ ·
> hours _Mon–Fri 11:30a–8p, Sat 11a–6p, Sun 11a–4p_. (Address/phone/hours are confirmed by the
> owner but the **DB row is currently seeded with Phoenix, AZ data** — italicized until reseeded.)

---

## Global

- **Design tokens / components:** `styles.css` + `window.TheFishTankDesignSystem_*` (Button,
  Badge, Card, Input, Select, ProductCard). Brand = electric-blue tang palette.
- **Chrome:** announcement bar + mega-menu header + cart + rich footer (see `ui_kits/website/`).
- **Data:** every surface fetches via `tft-data.js` (TanStack Query); Realtime invalidates stock.
- **NAP:** always from `getStoreLocation()` / `getSiteSettings()` — never hard-coded.
- **SEO per route:** `react-helmet-async` title/description/canonical/OG + JSON-LD (below).
- **Fonts:** _Bricolage Grotesque / Plus Jakarta Sans / JetBrains Mono — SUBSTITUTES; confirm or
  replace with brand fonts._

---

## Routes

### `/` — Home
- **Data:** `getSiteSettings()`, `listProducts({hasCompareAt:true})` (Weekly Specials),
  `listProducts({sort:"newest"})` (New Arrivals), `listProducts({type:"fish"})`,
  `getStoreLocation("sandy")`.
- **Sections:** hero, trust bar, category tiles, Weekly Specials row, New Arrivals row, Reef
  Rewards band, Fresh Fish row, Visit-Us block.
- **Seeded now:** _all product cards (placeholder reef-gradient images + sample names/prices)_,
  _stat numbers (700+ items, 100% aquacultured, 5-day guarantee)_, _hero copy_.
- **JSON-LD:** `LocalBusiness`/`PetStore` (from location). Sitewide.

### `/shop` and `/collections/:slug` — Catalog / collection
- **Data:** `getCollectionProducts(slug)` or `listProducts(filter)`; `listCollections()` for the
  filter rail + mega-menu.
- **UI:** filter sidebar (category, care level, on-sale), sort, responsive ProductCard grid,
  empty state.
- **Seeded now:** _collection definitions (Weekly Specials, New Arrivals, SPS) until staff create
  real ones_; _all products_.
- **JSON-LD:** `BreadcrumbList` + `ItemList`.

### `/products/:slug` — Product detail (PDP)
- **Data:** `getProductBySlug(slug)` (slug column now live) → name, scientific name, price +
  compare-at, availability, `attrs` care specs, `specimen_notes`, gallery (daylight/actinic),
  `tankLocation`; related = `listProducts({category})`.
- **UI:** gallery + view toggle, price/sale, care spec rows, add-to-cart, guarantee line,
  related grid.
- **Seeded now:** _placeholder photos_, _care/reef/size values_, _review stars (4.9 · 128) — the
  reviews block is mock; wire to real source or remove before launch_.
- **JSON-LD:** `Product` + `Offer` (price, availability InStock/SoldOut), `BreadcrumbList`.

### `/visit` — Visit Us / Contact
- **Data:** `getStoreLocation("sandy")` → address, phone (click-to-call), hours table w/ today
  highlighted, `openStatus()`, service areas; embedded Google Map.
- **Seeded now:** _address/geo/phone/serviceAreas are Phoenix-seeded in the DB — must reseed to
  Sandy / Salt Lake Valley_; _map embed coordinates_.
- **JSON-LD:** `LocalBusiness` with hours + geo.

### `/blog` and `/blog/:slug` — News / posts
- **Data:** `listArticles({kind:"post"})`; `getArticleBySlug(slug)` (author, body, related
  products, inline FAQs).
- **Seeded now:** _no posts exist yet — empty until staff author them_; _author avatars null until
  media paths projected_.
- **JSON-LD:** `Article` + `Person` (author), `BreadcrumbList`.

### `/guides` and `/guides/:slug` — Care / help guides
- **Data:** `listArticles({kind:"guide"})`; `getArticleBySlug`. Cross-link `relatedProductSlugs`.
- **Seeded now:** _no guides yet — the topical-authority engine; prioritize writing these_.
- **JSON-LD:** `Article` + `Person`, `FAQPage` (from inline `faqs`), `BreadcrumbList`.

### `/events` — In-store events
- **Data:** `listEvents({upcomingOnly:true})`.
- **Seeded now:** _none yet_.
- **JSON-LD:** `Event` per item (location defaults to the Sandy showroom).

### `/faq` — FAQ
- **Data:** `listFaqs()` grouped by category.
- **Seeded now:** _none yet_.
- **JSON-LD:** `FAQPage`.

### Marketing (static-ish, `kind:"page"` articles or hardcoded)
- `/reef-rewards`, `/about`, `/shipping`, `/arrival-guarantee` — author as `kind:"page"`
  articles so staff can edit, or build as static pages reading copy from `articles`.
- **Seeded now:** _all marketing copy is placeholder_.

---

## Cross-cutting before launch
- Honor `getRedirects()` (301s) in the router.
- `sitemap.xml` from published slugs (products + articles + events + collections).
- `robots.txt`, canonical tags, OG/Twitter per route.
- Prerender/SSG the indexable routes (a bare SPA won't rank).
- Replace ALL italicized seeded/placeholder data — see `FIX_BEFORE_LAUNCH.md`.
