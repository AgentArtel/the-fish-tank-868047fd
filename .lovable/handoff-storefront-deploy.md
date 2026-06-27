# Handoff → Lovable: deploy `main` so the merged storefront routes go live

**TL;DR:** The public storefront routes are **written and merged to `main`** (app code — Claude's lane).
They don't show on the deployed app yet because the deployed build predates them. **Please pull/sync `main`
(≥ commit `23e1006`) and redeploy** (Cloudflare Workers via `wrangler`, `main: src/server.ts`). No route
authoring needed on your side — this is a build/deploy + sync, not new work.

## What's merged on `main` (and should appear after deploy)
These are real TanStack Start file routes under the pathless `(public)` group (no `/public` prefix — they
sit at the root path). Deployed origin: `the-fish-tank.lovable.app`.

| URL | Route file | What it is | PR |
| --- | --- | --- | --- |
| `(chrome)` | `src/routes/(public)/route.tsx` | Storefront header/nav/footer layout, **no auth guard** | #103 |
| `/products/$slug` | `src/routes/(public)/products.$slug.tsx` | Product detail page (PDP) + Product/Offer JSON-LD | #103 |
| `/shop` | `src/routes/(public)/shop.tsx` | Canonical catalog (grid, filters, sort, paging) + ItemList JSON-LD | #105 |
| `/collections/$slug` | `src/routes/(public)/collections.$slug.tsx` | Collection-scoped catalog (reads `v_public_collections`) | #105 |
| `/catalog` | `src/routes/catalog.tsx` | **301 → `/shop`** (old internal catalog superseded) | #105 |

**Live smoke-test URLs once deployed** (the 2 website-ready items you seeded):
- `https://the-fish-tank.lovable.app/shop`
- `https://the-fish-tank.lovable.app/products/red-sea-225-micron-filter-bag-29d2af53`
- `https://the-fish-tank.lovable.app/products/max-nano-thin-mesh-fine-polish-filter-bag-b130484e`
- `https://the-fish-tank.lovable.app/catalog` → should 301 to `/shop`

## Not yet on `main` (coming in the next PR — Phase 3)
- `/` is **still the internal redirect** (→ `/login`/`/dashboard`). The **`/`-flip** (making `/` the public
  home) ships in Phase 3 (Home + Visit Us), which Claude is building now. Until that merges + deploys, reach
  the storefront via `/shop` and `/products/...` directly — `/` intentionally still opens the workspace.
- PWA `start_url` stays `/dashboard` (no manifest change) so the iPad standalone app is unaffected.

## What we need from you
1. **Sync `main` into the Lovable project and redeploy** to `the-fish-tank.lovable.app` (≥ `23e1006`).
2. **Confirm the deploy model:** does merging to GitHub `main` **auto-deploy**, or is publish manual? If it's
   manual, that explains why nothing showed — and tells us we must ping you (or you auto-watch `main`) after
   each storefront PR merges. We'd like merges to `main` to go live without a per-PR ping if possible.
3. Reply when deployed so we can verify the 5 URLs above (image loads = the `public-media` bucket flip works,
   footer shows the Sandy NAP, `/catalog` 301s).

No DB/edge-function work in this one — purely deploy/sync. Thanks!
