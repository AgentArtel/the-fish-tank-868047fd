# Plan — PO → CMS → Facebook ("new arrivals")

Companion to `.lovable/scope-cms-po-to-facebook.md` (research/scoping). This is the **phased build
plan** with each step classified by what unblocks it:

- **(A) Buildable now** — app-lane only, no schema, no external network, no secrets.
- **(B) Needs Lovable DB** — new tables/columns/RLS/storage (Lovable's lane, versioned migration).
- **(C) Needs external** — outbound network to a third-party source (image lookup, downloads).
- **(D) Needs Meta** — Facebook Page token + Meta App Review.

---

## Phase 1A — PO → draft "new arrivals" CMS post (no images, no FB) — **(A) — DONE**

App-lane starter slice. Zero schema, zero network, zero secrets. Draft-only, human-in-the-loop.

- **Server fn `buildArrivalPostFromBatch`** in `src/lib/cms.functions.ts`. Input `{ batchId }`
  (zod uuid). Auth: `requireSupabaseAuth` + the module's inline `profiles.is_active` check (matches
  `updateContentStatus`/`getSignedUrl`; no new gate introduced). Reads the batch's
  `vendor_line_items` where `kind='sellable'` and `item_type ∈ {fish, coral, invert, live_rock}`.
  Builds a plain-text/markdown caption (intro line + one line per species: name, italic
  `*scientific_name*` if present, qty) and inserts a `content_items` row at the **initial draft
  status `idea`** with `content_type='announcement'`, `title = "New arrivals — <invoice # or date>"`,
  the caption in `caption`, and the batch link recorded in `notes`
  (`Source vendor batch: <invoice_number | batchId>`). Returns `{ contentItemId }`. Never sets
  published/scheduled.
- **UI** on `src/routes/_app/batches.$id.tsx`: additive **"Build new-arrivals post"** button in the
  batch header actions (next to Convert). Confirm dialog → server fn → toast → navigate to
  `/content/$id`. No existing receive/convert/pricing logic touched.

**Caveat (no FK):** `content_items` has no batch FK column, so the batch→post linkage lives in
`content_items.notes`. Replacing this with a real FK is a (B) item below.

## Phase 1B — link hardening + multi-select — **(B) needs Lovable DB**

- **(B)** Add a `content_items ↔ vendor_batches` FK column (e.g. `source_vendor_batch_id`) so the
  link is queryable instead of free-text in `notes`. App reads/writes it once it exists.
- **(A, after B)** Optional line-level selection UI (pick which livestock lines go in the post)
  before building; today it includes all livestock lines on the batch.

## Phase 2 — image sourcing (vendor-first → Wikimedia/iNaturalist) + AI verify + confirm

- **(B)** `species_image_candidates` table (crawler output, human-gated): `species_key`, `source`,
  `source_url`, `image_url`, `storage_path`, `license`, `attribution`, `commercial_ok`,
  `ai_match_confidence`, `approved`, `approved_by`, timestamps.
- **(B)** Media provenance columns on `media_assets` (source + attribution carried from the
  candidate; `source_type`/`usage_rights` already exist — extend, don't duplicate).
- **(B)** A workspace **"vendor photos OK"** attestation setting (single flag, no per-vendor matrix).
- **(C)** Wikimedia Commons + iNaturalist lookups keyed on `scientific_name` (commercial-OK CC
  only); `downloadImage`-style materialize into the bucket on approve.
- **(A)** AI vision verify per candidate via existing `callAIChat`; confirm UI (top-N approve/reject)
  modeled on design-coral-stock-tracking §C. AI proposes, human approves.

## Phase 3A — manual FB publish — **(A) reuse existing publishing**

- **(A)** "Export post" = approved caption + downloadable image set; owner posts manually and pastes
  the live URL back (existing `content_platforms.post_url` flow). Ships the full outcome, no Meta dep.

## Phase 3B — direct Graph API publish — **(D) needs Meta**

- **(D)** Meta App Review for `pages_manage_posts`, Page access token.
- **(B/D)** Token + app-secret storage (secret/env) and the Graph multi-photo publish edge fn
  (Lovable lane). "Publish to Facebook" behind the human-approval gate; record returned `post_url`.
  Nothing auto-publishes.

---

### Next (B) items to hand to Lovable

1. `species_image_candidates` table (Phase 2).
2. `content_items ↔ vendor_batches` FK column (Phase 1B — replaces the `notes` text link).
3. Media provenance columns on `media_assets` (source/attribution) (Phase 2).
4. Workspace "vendor photos OK" attestation setting (Phase 2).
