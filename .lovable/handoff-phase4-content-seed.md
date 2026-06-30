# Handoff → Lovable: seed content + project media paths for Phase 4 (blog/guides/events/FAQ)

Phase 4 is merged (#116): public `/blog`, `/guides`, `/events`, `/faq` routes (under the storefront "Learn"
menu) read the `v_public_*` content views, render markdown bodies + author bylines, and show clean empty
states. They're **empty until content is seeded** and two image paths are projected. App reads these exact
fields — no app change needed.

## 1. Project hero + author-avatar paths onto the views  `[DB=Lovable]`
The article/author views expose `hero_media_id` / `avatar_media_id` (UUIDs) but **no resolvable Storage path**
(`v_public_media` is inventory-keyed only). So the app currently falls back to `og_image_path` for the hero
and renders **author initials** instead of an avatar. Please add:
- `hero_media_path` to `v_public_articles` (the article's hero image Storage path, public bucket).
- `avatar_media_path` to `v_public_authors` (the author avatar Storage path).
Once present I'll wire them (one-line each); until then the fallbacks render fine.

## 2. Seed published content so the pages render  `[DB=Lovable]`
Minimum to make each page look real (the views already gate to published rows):
- **Authors:** 1–2 active `content_authors` (name, bio, avatar) for bylines.
- **Articles:** a few published `articles` with `kind`, `author_id`, `body_md` (markdown), `excerpt`,
  `og_image_path`, `publish_at`. Include at least one **guide-surface** kind (`care_guide` or `how_to`) and
  one **blog-surface** kind (`news`, `species_spotlight`, or `event_recap`) — see the mapping note below.
- **FAQs:** a handful of published `faqs` (question + markdown answer).
- **Events:** 1–2 published `events` (title, date/time, description; a Place/address powers the Event JSON-LD).

## 3. Confirm the blog-vs-guide mapping (or tell us to change it)  `[decision]`
There's no `blog`/`guide` flag — the `article_kind` enum is
`care_guide | event_recap | news | species_spotlight | how_to | other`. The app currently maps:
- **`/guides`** ← `care_guide`, `how_to`
- **`/blog`** ← `event_recap`, `news`, `species_spotlight`, `other`
If that split is wrong, either tell us the desired kind→surface mapping, or add a dedicated `surface`
(`blog`/`guide`) column to `articles` and we'll key off that instead. (No visible effect until articles exist,
so this isn't urgent — just confirm when you seed.)

## Reply with
The two view projections added (`hero_media_path`, `avatar_media_path`), the seeded content (a couple article
slugs, that FAQs/events exist), and the mapping confirmation. Then `/blog`, `/guides`, `/events`, `/faq` show
real content and we can fold them into the standing smoke spec.
