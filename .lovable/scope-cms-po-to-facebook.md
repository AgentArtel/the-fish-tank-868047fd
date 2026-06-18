# Scope — PO → CMS → "New Arrivals" Facebook post (RESEARCH + SCOPING)

> **Status:** RESEARCH / SCOPING ONLY — direction, nothing implemented. No schema applied, no SQL
> run, no features built, no PR. Claude Code, 2026-06-18. Branch: isolated worktree (do **not**
> touch `main`).
> **DB changes are Lovable's lane** — every table/column/bucket/secret below is a **spec**, never
> dashboard SQL (WORKFLOW.md Golden Rule 1).
> **Scope note (CLAUDE.md):** current focus is the coral inventory catalog → review → go-live path.
> This feature lives in the **Marketing layer**, which `REALITY_MAP.md:25` lists as *"Usable in
> testing… not the current focus."* Everything here is **direction pending owner sign-off**, not
> committed scope. Building past Phase 1 is gated on the owner explicitly un-parking marketing work.

---

## TL;DR — verdict

**Feasible and a strong reuse story for the *intake → CMS* half. The two genuinely hard parts are
(a) the legal "royalty-free" question and (b) Facebook publishing — both are decisions, not code.**

- **PO → line items → CMS draft: ~90% reuse.** The vendor batch → `vendor_line_items` pipeline,
  the AI invoice parser, the content/media model, and the existing media library all exist and fit.
- **The image crawler is the net-new core — and the honest finding is that the existing scraper does
  NOT solve it.** `vendor-watch` scrapes **Shopify product JSON from a fixed vendor catalog**
  (`scrape.functions.ts:314` hard-rejects anything but `kind="shopify_public"`). It is *not* a
  general web/image search and is *not* a royalty-free image source. What IS directly reusable is
  the **mechanism**: `downloadImage()` (`scrape.functions.ts:250`) materializes a remote image into
  the `inventory-media` bucket, and the **"image-borrow matcher + confirm UI"** pattern is already
  designed in `.lovable/design-coral-stock-tracking.md` §C — that confirm-before-use flow is the
  template for this feature's human-approval step.
- **"Royalty-free" via scraping Google/the open web is NOT royalty-free** and is a real legal/brand
  risk. Use **licensed image APIs + CC sources keyed on scientific name**, store license+source+
  attribution per image, and keep a human in the loop. This is **Decision #1.**
- **No Facebook publishing exists today.** `meta_publish_ready`, `settings.meta.tsx`, and
  `content_platforms.post_url` are explicit **placeholders** ("Posting via Meta Graph API is not
  enabled yet"). Real publishing needs a FB Page, a Page token, and Meta **App Review** for
  `pages_manage_posts`. Phase the FB side: **Phase A = draft + downloadable image set the owner posts
  by hand** (works day one, zero API review); **Phase B = direct Graph API publish** after app review.

**Bottom line:** ship the intake→CMS→draft-post loop on reuse; treat the image source and the FB
integration as the two owner decisions that gate everything net-new.

---

## Decisions needed first (owner — 4 of them)

1. **Image-source strategy & licensing posture (BLOCKING).** Scraping arbitrary web/Google images
   is not royalty-free. Pick the compliant default (recommendation below): **licensed API
   (Unsplash/Pexels) + CC sources (Wikimedia Commons, iNaturalist) keyed on scientific name**, with
   license/source/attribution stored per image. Decide whether vendor-supplied product photos (some
   wholesalers license these; some are already captured by vendor-watch) are allowed and under what
   terms. *Without this decision the crawler should not be built.*
2. **Facebook integration depth.** Phase A only (generate a draft caption + a downloadable
   collage/image set, owner posts manually) vs. committing to Phase B (Meta App Review +
   `pages_manage_posts` + Page token + direct multi-photo publish). Phase B is real integration work
   and external-review friction; Phase A delivers most of the value now.
3. **Auto vs. manual post assembly.** Does the agent auto-pick the "best" image per species and
   auto-draft the caption (human approves), or does it only *propose* candidates and the human
   assembles? Project invariant "AI is draft-only" means **AI proposes, human approves** either way —
   this decision is only about how much the draft is pre-filled.
4. **Un-park marketing for this work.** Marketing is "not the current focus" (`REALITY_MAP.md:25`)
   and the North Star is coral catalog → go-live (`CLAUDE.md`). The owner must confirm this jumps
   the queue (or is parked behind the coral loop) before any lane work starts.

---

## Reuse map — what exists vs. what's net-new

| Capability needed | Reuse? | Where it lives | Notes |
|---|---|---|---|
| PO/invoice upload + storage | ✅ Reuse | `batches.$id.tsx:195` (`uploadPdf` → `vendor-invoices` bucket) | Already the intake surface. |
| AI parse PO → structured line items | ✅ Reuse | `extractBatchWithAI` `ops.functions.ts:863` (vision, tool-call) | Yields `clean_item_name`, `scientific_name`, `item_type`, qty, etc. |
| **Species keys per line** | ✅ Reuse | `vendor_line_items.{scientific_name, clean_item_name, item_type, raw_description}` (`2026..235115_*.sql`) | `scientific_name` is the primary image-lookup key; `clean_item_name`/`item_type` are fallbacks. |
| Line-items → inventory mapping | ✅ Reuse (read) | `convertLineItemsToInventory` `ops.functions.ts:168` | We don't need to convert; we just read the same `scientific_name`/`item_type`. AI-is-draft-only invariant already enforced here. |
| Coarse type classifier | ✅ Reuse | `classifyCoralType()` `coral-type.ts:33` (deterministic regex) | Pre-filter / disambiguate candidate images by coral type. |
| **AI vision verification** ("does this image show *Acropora millepora*?") | ✅ Reuse | `callAIChat()` `ai-call.server.ts` — multimodal, BYO-key + Lovable Gateway fallback (`workspace_ai_settings`) | Already sends `image_url` content to Gemini/GPT for invoice & tag parsing. Same call shape verifies a candidate image → `{is_match, confidence}`. |
| **Materialize remote image → our bucket** | ✅ Reuse | `downloadImage()` `scrape.functions.ts:250` (fetch → `inventory-media` upload) | The exact precedent for pulling a chosen royalty-free image into storage. |
| **"Candidate images → human confirm" UX pattern** | ✅ Reuse (pattern) | `.lovable/design-coral-stock-tracking.md` §C ("image-borrow matcher + confirm UI", *designed, not built*) | Top-N candidates, staff taps to confirm, never silent auto-borrow, record provenance in `attrs`. Mirror this for royalty-free candidates. |
| Content/post model + draft→publish state machine | ✅ Reuse | `content_items` (status: idea→…→approved→scheduled→posted), `workflow.ts`, `content.$id.tsx`, `cms.functions.ts:updateContentStatus` | A "new arrivals" post = a `content_items` row (`content_type='carousel'/'announcement'`). |
| Media library + content↔media linking | ✅ Reuse | `media_assets`, `content_media` junction, `media.tsx`, `media` bucket; signed URLs via `getSignedUrl` | Approved species images land here with `source_type`, `usage_rights` already modeled. |
| Per-platform targeting + manual publish | ✅ Reuse | `content_platforms` (platform enum incl. `facebook`, `post_url`), `publishing.tsx` checklist | Phase A "export caption + save the live URL" is *already the existing manual flow*. |
| **General web / royalty-free image crawler** | ❌ Net-new | — | vendor-watch is Shopify-catalog-only (`scrape.functions.ts:314`). Needs new image-source connectors. |
| **Image candidate + license/attribution model** | ❌ Net-new (DB) | — | New table(s) — see Data model. |
| **"New-arrivals post draft" linking batch→lines→images** | ❌ Net-new (DB) | — | New table — see Data model. |
| **Facebook Graph API publish** | ❌ Net-new | `settings.meta.tsx`, `meta_publish_ready` are placeholders only | Page token + App Review + multi-photo upload. Phase B. |

**Honest reuse verdict:** intake→CMS is mostly wiring existing parts together. The crawler and the
candidate/license model are the real new build; FB publish is a separate integration decision.

---

## Net-new pieces

### 1. Royalty-free image sourcing (Decision #1) — compliant sources compared

> **Why not "just crawl Google images":** Google/open-web image results are overwhelmingly
> **copyrighted**. "Royalty-free" ≠ "found on the web." Reposting them to a commercial store's FB
> page is copyright infringement and a brand risk. The fix is to pull only from sources whose license
> permits commercial reuse, and to **store the license + source URL + attribution with every image**.

| Source | License | Keyed on | Pros | Cons |
|---|---|---|---|---|
| **Unsplash API** | Unsplash License (free commercial, attribution requested, no API key abuse) | free-text (common name) | High visual quality; easy API | Few *specific-species* shots; generic "reef/coral" risk → wrong species |
| **Pexels API** | Pexels License (free commercial) | free-text | Quality; simple API | Same species-specificity gap as Unsplash |
| **Wikimedia Commons** | CC-BY / CC-BY-SA / PD (per file — must read each) | **scientific name** | Strong species coverage; binomial-indexed | Mixed licenses → must capture per-file license + attribution; quality varies |
| **iNaturalist** | per-observation (many CC-BY/CC-BY-NC — **NC excludes commercial use**) | **scientific name** (taxon API) | Excellent species accuracy; huge volume | Must filter to commercially-usable licenses (exclude NC); attribution required |
| **FishBase / reef species DBs** | varies, often restrictive | scientific name | Authoritative IDs | Licensing often *not* open commercial — treat as ID reference, not image source |
| **Vendor-supplied product photos** | per vendor agreement | vendor SKU / catalog | Already the actual animal; some captured by vendor-watch | License must be confirmed per vendor; not "royalty-free", it's "vendor-licensed" |

**Recommended default:** **scientific-name-keyed lookup against Wikimedia Commons + iNaturalist
(commercial-OK CC licenses only), with Unsplash/Pexels as a generic-fallback**, and **vendor photos
as an opt-in source if the owner confirms the vendor license**. Always: **scientific name is the
primary key** (it's binomial and unambiguous; `vendor_line_items.scientific_name`), AI vision
verifies the candidate actually depicts the species, and a human confirms before it's used.

**Mandatory per-image metadata (store on every candidate):** `source` (api/site), `source_url`,
`license` (e.g. CC-BY-4.0, Unsplash, vendor), `attribution` (author/credit string),
`commercial_ok` (bool), `ai_match_confidence`, `approved` (human gate). The existing `media_assets`
table already has `source_type` and `usage_rights` enums — extend, don't reinvent.

### 2. Species identification & matching

- **Primary key:** `vendor_line_items.scientific_name`. Fallback chain: `scientific_name` →
  `clean_item_name` (+ `classifyCoralType()` to constrain type) → `raw_description` tokens.
- **Lookup:** query each compliant source by scientific name (Wikimedia/iNaturalist taxon search),
  pull top candidates.
- **Verify (AI, draft-only):** for each candidate, `callAIChat()` with the image + prompt
  "does this depict *{scientific_name}*? return `{is_match, confidence, notes}`" — reusing the exact
  multimodal call shape already used in `extractBatchWithAI`/`parseTagPhoto`.
- **Confirm (human):** present top 1–3 verified candidates per species; staff taps to approve
  (mirrors design-coral-stock-tracking §C). **Never auto-select silently** — respects "AI is
  draft-only."
- **Ambiguity guard:** many PO names are common names or vendor codes with no scientific name. When
  `scientific_name` is null, mark the species "needs manual image" rather than guessing.

### 3. Facebook publishing (Decision #2) — what Graph API actually requires

- A **Facebook Page** (not a personal profile) and a **Page access token**.
- **Meta App Review** to obtain `pages_manage_posts` (+ `pages_read_engagement`) for publishing on
  behalf of the Page — this is the friction: a real review process, not just a key.
- Multi-photo post = upload each image (`POST /{page-id}/photos` with `published=false`) to get
  media IDs, then create the feed post referencing those `attached_media` IDs.
- **Phased recommendation:**
  - **Phase A (no app review):** generate the draft caption + a **downloadable image set / collage**;
    owner posts manually and pastes the live URL back — *this is literally the existing
    `publishing.tsx` flow*. Ships immediately, zero external dependency.
  - **Phase B (after app review):** add a Graph API publish path behind the same human-approval gate.
    Page token + secrets are **Lovable's lane** (env/secret + edge fn). Nothing auto-publishes
    without explicit owner sign-off per the draft-only invariant.

### 4. Human-in-the-loop / draft-only (project invariant)

Every AI step **proposes**; a human **approves**: candidate images (approve/reject per species), the
assembled image set, and the post caption. The post sits in `content_items.status` and only a
reviewer/admin can move it toward `approved`/`scheduled` (already enforced by
`updateContentStatus` role gating). FB publish (Phase B) requires an explicit human action.

---

## Data model (DB-lane — Lovable spec, not applied)

Proposal — to be drafted as a versioned migration by Lovable if the owner greenlights:

- **`arrival_post_drafts`** — one per PO/batch "new arrivals" announcement.
  `id`, `vendor_batch_id` (FK), `content_item_id` (FK → the CMS post once created), `status`
  (`gathering` → `images_ready` → `caption_ready` → `handed_to_cms`), `caption_draft`,
  `created_by`, timestamps.
- **`arrival_post_lines`** — which line items are included.
  `id`, `arrival_post_draft_id` (FK), `vendor_line_item_id` (FK), `species_key` (scientific_name
  snapshot), `selected` (bool).
- **`species_image_candidates`** — the crawler's output, human-gated.
  `id`, `arrival_post_line_id` (FK) *or* `species_key`, `source` (unsplash/pexels/wikimedia/
  inaturalist/vendor), `source_url`, `image_url`, `storage_path` (set on approve via `downloadImage`
  precedent), `license`, `attribution`, `commercial_ok` (bool), `ai_match_confidence` (numeric),
  `approved` (bool), `approved_by`, timestamps.
- **Reuse, don't duplicate:** approved images become `media_assets` rows (with `source_type` +
  `usage_rights` set from the candidate's license) linked to the post via `content_media`. The post
  itself is a `content_items` row — no parallel post table.

> All RLS/GRANTs follow existing patterns; mutating server fns must check `is_active` + role
> (`requireEditor`/admin) per CLAUDE.md invariants.

---

## Phased plan (direction — pending sign-off)

### Phase 0 — Decisions (owner) — **[Decision]**
Resolve the 4 decisions above. Until #1 (image source/licensing) and #4 (un-park marketing) are
settled, no build starts.

### Phase 1 — PO → "New Arrivals" CMS draft (no images yet, no FB) — mostly reuse
- **[App]** From a vendor batch, add "Build new-arrivals post" → collect selected livestock lines
  (`vendor_line_items` where `item_type` in fish/coral/invert) into an `arrival_post_draft`, create a
  linked `content_items` row (`content_type='announcement'/'carousel'`, status `idea/drafting`) with
  a pre-filled caption listing species. Reuse `content.$id.tsx` editor for the rest.
- **[DB]** `arrival_post_drafts` + `arrival_post_lines` tables (Lovable).
- **[Decision]** Confirm caption auto-draft vs. blank (Decision #3).

### Phase 2 — Royalty-free image crawler + verify + confirm — net-new core
- **[Decision]** Image source set + licensing posture locked (Decision #1).
- **[DB]** `species_image_candidates` table + any `media_assets` license-field additions (Lovable);
  any new API-key secrets (Lovable's lane).
- **[App]** Per-species lookup against the chosen compliant sources (keyed on `scientific_name`),
  `callAIChat` vision verification, and a **confirm UI** (top-N candidates, approve/reject) modeled on
  design-coral-stock-tracking §C. On approve: `downloadImage`-style materialize → `media_assets` +
  `content_media`, carrying license/attribution.

### Phase 3A — Manual FB publish (no app review) — reuse existing publishing
- **[App]** "Export post" = approved caption + downloadable image set/collage; owner posts manually,
  pastes the live URL back (existing `publishing.tsx` / `content_platforms.post_url` flow). Ships the
  whole user-visible outcome with zero Meta dependency.

### Phase 3B — Direct Graph API publish (gated on Meta App Review) — net-new integration
- **[Decision]** Owner commits to FB integration depth (Decision #2); completes App Review for
  `pages_manage_posts`.
- **[DB/Lovable]** Page token + app secret storage (secret/env), edge fn for the Graph multi-photo
  publish; CORS/JWT/caller-auth per Definition of Done.
- **[App]** "Publish to Facebook" behind the human-approval gate; record returned `post_url`. Nothing
  auto-publishes.

---

## Risks & open questions

- **Licensing (highest).** "Royalty-free from the web" is a trap. Mitigation: compliant sources only,
  exclude NC/unknown licenses, store license+attribution per image, human confirm. Open: are
  vendor-supplied photos contractually OK to repost?
- **Species-name ambiguity.** PO lines often have common names / vendor codes and **null
  `scientific_name`**; image lookup degrades badly without a binomial. Mitigation: require
  scientific name or fall back to "needs manual image."
- **Image-quality / wrong-species false positives.** Generic "coral/reef" stock photos can pass a
  loose match. Mitigation: AI vision verify against scientific name + human confirm + confidence
  threshold.
- **Meta App Review friction.** `pages_manage_posts` review can be slow/iterative; tokens expire.
  Mitigation: Phase A (manual) decouples value from review; do Phase B only on explicit commit.
- **Image-API rate limits / cost.** Unsplash/Pexels/iNaturalist have quotas; per-species fan-out
  across a big PO multiplies calls. Mitigation: cache by `species_key`, cap candidates per species,
  dedupe across batches.
- **Scope creep vs. North Star.** This is marketing, not the coral-catalog focus. Open: does the owner
  un-park it now or after the coral loop ships?

---

## Recommended sequence

1. **Decision #1 (image source/licensing) + #4 (un-park).** Nothing else is safe to start.
2. **Phase 1** (PO → CMS draft) — pure reuse, low risk, immediately useful even with images added by
   hand.
3. **Phase 2** (compliant crawler + AI verify + confirm UI) — the real new build; gated on Decision #1.
4. **Phase 3A** (manual FB export) — ships the full outcome with zero Meta dependency.
5. **Phase 3B** (Graph API publish) — only if/when the owner commits to App Review (Decision #2).

> Cited files: `src/lib/scrape.functions.ts` (`downloadImage:250`, shopify-only `:314`),
> `src/lib/ops.functions.ts` (`extractBatchWithAI:863`, `convertLineItemsToInventory:168`,
> `parseTagPhoto`, `parseInventoryMarkdown`), `src/lib/ai-call.server.ts` (`callAIChat`, multimodal),
> `src/lib/coral-type.ts` (`classifyCoralType:33`), `src/routes/_app/batches.$id.tsx` (`uploadPdf:195`),
> `src/routes/_app/content.$id.tsx`, `content.index.tsx`, `media.tsx`, `publishing.tsx`,
> `settings.meta.tsx`, `src/lib/workflow.ts`, `src/lib/cms.functions.ts`,
> `.lovable/design-coral-stock-tracking.md` §C (image-borrow matcher + confirm UI),
> tables `vendor_line_items`, `content_items`, `content_platforms`, `content_media`, `media_assets`,
> `vendor_scrape_items`, `workspace_ai_settings`.
