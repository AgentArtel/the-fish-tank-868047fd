# Handoff → Claude Code: Catalog & Collection (`/shop`, `/collections/:slug`)

**Goal:** implement the catalog from `reference/Catalog.tsx.txt`, wired to the live data layer,
then push to Lovable. One component serves **both** routes — `/shop` (all live stock) and
`/collections/:slug` (a curated/dynamic collection). Builds on the PDP pattern
(`HANDOFF_ProductDetail.md`); do that one first.

---

## 1. Prereqs
App setup + data layer already in place from the PDP handoff (`initTftData`, QueryClient,
HelmetProvider, `@/components/ds`, `styles.css`). No new packages.

## 2. Files
- `reference/Catalog.tsx.txt` → `src/pages/Catalog.tsx` (rename `.txt`→`.tsx`).
- Routes:
  ```tsx
  <Route path="/shop" element={<Catalog />} />
  <Route path="/collections/:slug" element={<Catalog />} />
  ```

## 3. Adjustments (same as PDP)
- Import paths → `@/lib/tft-data`, `@/components/ds`.
- Replace `<i data-lucide="…" />` with `lucide-react` (`Check, ChevronRight, SearchX, AlertTriangle`).
- `Select` comes from the DS bundle (native styled select; pass `value`/`onChange`).

## 4. How it works (already in the reference — don't re-architect)
- **Routing:** `useParams().slug` present → `getCollectionProducts(slug, {limit,offset})`
  (the collection's own `query` is applied server-side); absent → `listProducts(filter, …)`.
- **Filters:** Category (single → maps to `filter.type`), Care Level (multi — single value goes
  to the query, multi refined client-side on the page), On-sale toggle (`hasCompareAt`), Sort.
  Every filter change resets `page` to 0.
- **Caching:** TanStack Query with `keepPreviousData` so the grid doesn't flash on
  filter/page changes; `staleTime` from the global client.
- **States:** loading skeletons, error, empty (with the brand empty copy), pagination when
  `total > PAGE`.

## 5. Data contract (handled by the data layer)
- `listProducts(filter, {limit, offset})` → `{ products: PublicProduct[], total }`.
- `getCollectionProducts(slug, opts)` → `{ collection: Collection, products, total }`.
- `listCollections()` → `Collection[]` (drives the mega-menu + any collection rail).
Render `PublicProduct` straight: `images[0].url, originRegion (eyebrow), name, scientificName,
price, compareAtPrice, availability`.

## 6. SEO / structured data (required)
- `<Helmet>`: title `"<collection|Live Stock Catalog> | The Fish Tank — Sandy, UT"`, description
  from the collection blurb, canonical (`/shop` or `/collections/<slug>`).
- **`ItemList`** (the product list) + **`BreadcrumbList`** JSON-LD — both in the reference.
- For indexability, this route must be prerendered/SSG (see `data/FIX_BEFORE_LAUNCH.md` #13).

## 7. Acceptance criteria
- [ ] `/shop` lists all published products; filters + sort + pagination work and reset correctly.
- [ ] `/collections/<slug>` shows the collection header (title/description) and its products.
- [ ] Cards link to `/products/<slug>`; sold items show the sold state.
- [ ] Empty filter combo shows the empty state; loading shows skeletons; no layout flash on change.
- [ ] View source: one `ItemList` + one `BreadcrumbList` JSON-LD; canonical correct per route.
- [ ] No console errors; product images resolve from `public-media`.

## 8. Notes / caveats
- **Category/care filtering** reads `attrs->>category` / `attrs->>care_level` inside the data
  layer — if filters return nothing, confirm those `attrs` keys are populated on inventory.
- Multi-select Care Level is refined client-side within the fetched page; if you need exact
  server-side multi-filter counts, add an `in.(…)` filter to `listProducts` later.
- Collections must exist + be published to appear; until staff create real ones they're seeded
  samples (`data/FIX_BEFORE_LAUNCH.md` #6).
