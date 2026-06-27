# Handoff → Claude Code: Product Detail Page (`/products/:slug`)

**Goal:** implement the PDP in the Lovable app from the reference in
`reference/ProductDetail.tsx.txt`, wired to the live Supabase data layer, then push to Lovable.

This is the **first route** and establishes the pattern (fetch → map → render + JSON-LD) every
other route reuses. Build it exactly; subsequent routes are variations on it.

---

## 1. One-time app setup (do this before the route)
Per `data/INTEGRATION.md §0`:
```bash
npm i @supabase/supabase-js @tanstack/react-query react-helmet-async react-router-dom lucide-react
```
```ts
// src/main.tsx — wrap the app once
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { createClient } from "@supabase/supabase-js";
import { initTftData } from "@/lib/tft-data"; // copied from data/client/tft-data.js

initTftData(createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
));
// <HelmetProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{staleTime:60_000}}})}> … </></>
```

## 2. Files to copy in
- `data/client/tft-data.js` → `src/lib/tft-data.js` (the data layer; no edits needed).
- `reference/ProductDetail.tsx.txt` → `src/pages/ProductDetail.tsx` (rename `.txt`→`.tsx`).
- Design tokens: link this design system's `styles.css` globally (or import the compiled bundle).

## 3. Adjustments required (won't compile as-is — placeholders by design)
- **Import paths:** `@/data/client/tft-data` → `@/lib/tft-data`; `@/components/ds` → your
  DS-component wrapper (see §4).
- **Icons:** replace every `<i data-lucide="x" />` with `lucide-react` components
  (`import { ShoppingCart, Heart, ShieldCheck, ChevronRight, MapPin, Ruler, HeartPulse, SearchX } from "lucide-react"`)
  and pass into `leftIcon={<ShoppingCart size={16} />}` etc.
- **Route:** add `<Route path="/products/:slug" element={<ProductDetail />} />`.

## 4. Design-system components (`@/components/ds`)
Expose `Button`, `Badge`, `ProductCard` from this system. Two options:
- If consuming the compiled bundle: load `_ds_bundle.js` and re-export
  `window.TheFishTankDesignSystem_*` members from a thin `src/components/ds.ts`.
- If porting: copy the component source and keep the prop APIs identical
  (`Button{variant,size,fullWidth,leftIcon}`, `Badge{tone,variant}`,
  `ProductCard{image,vendor,name,scientificName,price,compareAt,stock}`).

## 5. Data contract (already handled by the data layer — do not re-map)
`getProductBySlug(slug)` returns the `PublicProduct` shape
(`data/schemas/public-product.schema.json`): `slug, name, scientificName, type, category,
price, compareAtPrice, currency, availability ('available'|'on_hold'|'sold'|'coming_soon'),
isWysiwyg, isHouseLine, careLevel, reefSafe, originRegion, size, description, tankLocation,
images[{url,alt,isPrimary,view}], badges[], updatedAt`. Render straight from these keys.

## 6. SEO / structured data (required)
- `<Helmet>`: title `"<name> | The Fish Tank — Sandy, UT"`, meta description (≤155), canonical
  `https://thefishtank.com/products/<slug>`, OG type/title/description/image.
- **`Product` + `Offer` JSON-LD** (in the reference): `price`, `availability` →
  `InStock`/`SoldOut`, `image[]`, `sku=id`. Do NOT add Review/AggregateRating.

## 7. Acceptance criteria
- [ ] `/products/<real-slug>` renders name, scientific name, price (+ struck compare-at & % OFF when on sale), availability, specs, gallery with daylight/actinic toggle, related grid.
- [ ] Loading shows the skeleton; unknown slug shows the not-found state; `availability:'sold'` disables Add to Cart + greys imagery.
- [ ] View source: one `Product` JSON-LD block with correct price + availability; canonical + OG present.
- [ ] No console errors; NAP/identity never hard-coded; images load from `public-media` URLs.
- [ ] Lighthouse SEO ≥ 95 on a published product.

## 8. Known data caveats (see `data/FIX_BEFORE_LAUNCH.md`)
- Product photos may be missing until the "approve for website" flow copies them to
  `public-media` — the gallery handles empty `images` gracefully.
- Slug routing depends on the generated `inventory_items.slug` (shipped). If a product 404s,
  confirm it passes the publish gate (`is_website_ready`).
