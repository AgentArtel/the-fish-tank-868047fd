# Handoff → Claude Code: Content & Local routes

Implements the remaining routes from the references in this folder, wired to the live data layer,
then push to Lovable. Builds on the PDP + Catalog handoffs (same setup, DS components, icon swap,
`@/lib/tft-data` import). Do those first.

Covers: **Visit Us**, **Blog/Guides** (list + detail), **Events**, **FAQ**.

---

## Shared adjustments (all files)
- Rename `.tsx.txt` → `.tsx`; fix imports (`@/lib/tft-data`, `@/components/ds`).
- Replace `<i data-lucide="…" />` with `lucide-react` icon components.
- Markdown routes (`ArticleDetail`, `Faq`) need a renderer: `npm i react-markdown` (shown as
  `<Markdown>`). Sanitize if bodies can contain raw HTML.
- All routes are public + indexable → must be prerendered/SSG (`data/FIX_BEFORE_LAUNCH.md` #13).

## Routes & files

| Route | File | Data fn | JSON-LD |
|-------|------|---------|---------|
| `/visit` | `VisitUs.tsx` | `getStoreLocation("sandy")`, `openStatus()` | `PetStore` (NAP, geo, hours) |
| `/blog` | `ArticleList.tsx` `kind="post"` | `listArticles({kind:"post"})` | — (list) |
| `/guides` | `ArticleList.tsx` `kind="guide"` | `listArticles({kind:"guide"})` | — (list) |
| `/blog/:slug` | `ArticleDetail.tsx` `kind="post"` | `getArticleBySlug` | `Article` + `Person` |
| `/guides/:slug` | `ArticleDetail.tsx` `kind="guide"` | `getArticleBySlug` | `HowTo` + `Person` + `FAQPage` |
| `/events` | `Events.tsx` | `listEvents({upcomingOnly:true})` | `Event` per item |
| `/faq` | `Faq.tsx` | `listFaqs()` | `FAQPage` |

```tsx
<Route path="/visit"        element={<VisitUs />} />
<Route path="/blog"         element={<ArticleList kind="post" />} />
<Route path="/blog/:slug"   element={<ArticleDetail kind="post" />} />
<Route path="/guides"       element={<ArticleList kind="guide" />} />
<Route path="/guides/:slug" element={<ArticleDetail kind="guide" />} />
<Route path="/events"       element={<Events />} />
<Route path="/faq"          element={<Faq />} />
```

## Route notes
- **Visit Us** is the local-SEO cornerstone: NAP/hours come ONLY from `getStoreLocation` (never
  hard-code), Google Map embed, `openStatus()` live label, service areas, `PetStore` JSON-LD.
  ⚠️ The location row is currently **Phoenix-seeded** — verify it shows Sandy before launch
  (`data/FIX_BEFORE_LAUNCH.md` #1).
- **ArticleList / ArticleDetail** — one component each, `kind` prop switches blog vs guides.
  Guides emit `HowTo`; both emit `Person` author (E-E-A-T). Inline FAQs → `FAQPage`. Related
  products cross-link to PDPs by slug.
  ⚠️ Author avatars + article hero images need `*_media_path` projected on the views
  (`data/FIX_BEFORE_LAUNCH.md` #2) — until then avatars are null and hero falls back to OG image.
- **Events** — date chip + `Event` JSON-LD (location defaults to the Sandy showroom).
- **FAQ** — accordion grouped by category; one `FAQPage` block for the whole page.

## Acceptance criteria (per route)
- [ ] Renders live data; empty states show when no rows (blog/guides/events/faq start empty).
- [ ] `/visit` shows **Sandy** NAP + correct hours + working map + `PetStore` JSON-LD validates.
- [ ] Article detail: body renders Markdown, byline + date + reading time, inline FAQ accordion,
      related products link to PDPs; `Article`/`HowTo` + `Person` JSON-LD validate.
- [ ] `/faq` emits a single valid `FAQPage`; `/events` emits valid `Event` items.
- [ ] Canonical + OG per route; no console errors; Lighthouse SEO ≥ 95.

## Content dependency
Blog, guides, events, and FAQ are **empty until staff author content** in the workspace app
(`data/FIX_BEFORE_LAUNCH.md` #5). Ship the routes now; they populate as content is published
(`status='published' AND publish_at <= now()`). Guides are the SEO priority — write those first.
