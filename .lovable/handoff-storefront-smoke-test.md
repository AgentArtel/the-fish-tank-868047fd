# Handoff → Lovable: Playwright smoke-test the live storefront

The public storefront (Phases 0–3) is deployed and rendering at `the-fish-tank.lovable.app`. Please run a
**Playwright smoke-test against the live deploy** (your integration-testing lane) so we catch route/render
regressions before each phase moves on. This is now a **standing gate** (added to WORKFLOW.md → Definition of
Done): every future phase with a visitor-facing surface ships with one of these checklists.

## Scope: the deployed routes (Phases 0–3, on `main`)
Run headless Chromium against production. For each, assert the listed checks; report **pass/fail per check**
with the failing selector/console error if any.

| # | URL | Expect (200 + these) |
|---|-----|----------------------|
| 1 | `/` | Home renders: hero "The reef, delivered.", trust bar (4 items), header shows store status ("Closed · opens …" / "Open"). No console errors. |
| 2 | `/shop` | Catalog renders: product grid OR a clean empty state; filter/sort controls present; no console errors. |
| 3 | `/products/red-sea-225-micron-filter-bag-29d2af53` | PDP renders: product name, price, **image loads (HTTP 200, not broken/placeholder)**, Add-to-cart, breadcrumb. |
| 4 | `/products/max-nano-thin-mesh-fine-polish-filter-bag-b130484e` | Same PDP checks; image loads; Daylight/Actinic toggle present. |
| 5 | `/collections/<a-published-slug>` | If a published collection exists: renders grid + title. Unknown slug → not-found UI (not a crash). |
| 6 | `/visit` | Visit Us renders: Sandy address, structured hours table, directions link. |
| 7 | `/catalog` | **301 → `/shop`** (assert the redirect, then the landing page renders). |
| 8 | Footer "Staff sign in" link | Present on the storefront; navigates to `/login`. |
| 9 | `/dashboard` (unauthenticated) | Still gated → redirects to `/login` (confirm the `/`-flip didn't expose the workspace). |

## Cross-cutting assertions (every page)
- HTTP status 200 (or the intended 301 for #7).
- No uncaught console errors / no failed network requests for first-party assets (images, fonts, JS).
- `<title>` and a `<meta name="description">` are present (SEO sanity).
- At least one JSON-LD `<script type="application/ld+json">` parses as valid JSON (Home/PDP/Visit emit it).

## Image-load check (the bucket-flip canary)
For the two seeded items (#3, #4): assert the `<img>` `naturalWidth > 0` (i.e. the `public-media` URL actually
resolved). A broken image here means the public bucket regressed.

## Going forward
For each future phase (4 = content/blog/FAQ, 5 = SEO/launch), Claude will drop a `handoff-<phase>-smoke-test.md`
with the new routes' checklist. Ideally land these as a committed Playwright spec in the repo so they're
re-runnable in CI later — but a one-off live run + pass/fail report per check is the minimum each phase.

## Reply with
Pass/fail per numbered check (+ any console errors/broken images), and whether you committed a reusable spec
or ran it ad-hoc. Anything red, paste the error and I'll fix it on the app side.
