# Reference page — live-data-wired PDP

A drop-in reference implementation of the **Product Detail Page** for the Lovable build,
demonstrating the full data path the rest of the site follows.

**START HERE:** `CLAUDE_CODE_HANDOFF.md` is the top-level brief for the whole build — read it first.

## Files
- `ProductDetail.tsx.txt` — PDP (`/products/:slug`). + `HANDOFF_ProductDetail.md`.
- `Catalog.tsx.txt` — catalog + collection (`/shop`, `/collections/:slug`). + `HANDOFF_Catalog.md`.
- `VisitUs.tsx.txt` — Visit Us / contact (`/visit`). [`HANDOFF_Content.md`]
- `ArticleList.tsx.txt` — blog & guides index (`/blog`, `/guides`; `kind` prop). [`HANDOFF_Content.md`]
- `ArticleDetail.tsx.txt` — post/guide detail (`/blog/:slug`, `/guides/:slug`). [`HANDOFF_Content.md`]
- `Events.tsx.txt` — events (`/events`). [`HANDOFF_Content.md`]
- `Faq.tsx.txt` — FAQ (`/faq`). [`HANDOFF_Content.md`]
- (`.txt` so the DS compiler ignores their npm imports; **rename to `.tsx`** on copy into the Vite repo.)
- `HANDOFF_*.md` are the Claude Code build briefs (setup, adjustments, acceptance criteria).

This covers every route in `data/WEBSITE_BUILD_SPEC.md` except the home page (already built as the
UI kit in `ui_kits/website/` — port that markup, swapping its mock `TFT_DATA` for the same
`tft-data.js` fetchers used here).

## What it demonstrates (copy this pattern for every route)
1. **Data fetch** via `@tanstack/react-query` + the `tft-data.js` functions
   (`getProductBySlug`, `listProducts`) — never raw Supabase calls in components.
2. **The camelCase contract** — the component reads `product.scientificName`,
   `compareAtPrice`, `isWysiwyg`, `tankLocation`, `images[].view`, etc., exactly as the JSON
   schemas define. The data layer absorbs the snake_case DB reality.
3. **SEO** — `react-helmet-async` for title/description/canonical/OG **plus `Product` + `Offer`
   JSON-LD** (price, `InStock`/`SoldOut`, images).
4. **Design system** — uses `Button`, `Badge`, `ProductCard` + the CSS tokens; no bespoke styling.
5. **States** — loading skeleton, not-found, and sold-out handled explicitly.
6. **Routing** — `react-router-dom` `useParams()` slug in, `<Link>` to related PDPs.

## Wiring it up in Lovable (one-time, see `data/INTEGRATION.md`)
```ts
// src/main.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { createClient } from "@supabase/supabase-js";
import { initTftData } from "@/data/client/tft-data";

initTftData(createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }
));

// wrap the app: <HelmetProvider><QueryClientProvider client={new QueryClient()}>…</></>
// route:        <Route path="/products/:slug" element={<ProductDetail />} />
```

## Adjust before it compiles in your repo
- **Import paths** — `@/data/client/tft-data` and `@/components/ds` are placeholders; point them
  at where you copy the data layer and how you expose this design system's bundle.
- **Lucide icons** — the reference uses `<i data-lucide>` to match the UI kit; in a real React
  app prefer `lucide-react` (`import { ShoppingCart } from "lucide-react"`) and pass as
  `leftIcon={<ShoppingCart size={16} />}`.
- **Design-system components** — `@/components/ds` should re-export `Button`/`Badge`/`ProductCard`
  from the compiled bundle (`window.TheFishTankDesignSystem_*`) or your packaged version.
- **Reviews** — intentionally omitted (the kit's stars were mock). Add only with a real source.

## Next routes to build on this pattern
Catalog (`/shop`, `/collections/:slug` → `getCollectionProducts`), Visit Us
(`getStoreLocation` + `openStatus`), Blog/Guides (`listArticles`/`getArticleBySlug`), Events,
FAQ. See `data/WEBSITE_BUILD_SPEC.md` for each route's data source + JSON-LD.
