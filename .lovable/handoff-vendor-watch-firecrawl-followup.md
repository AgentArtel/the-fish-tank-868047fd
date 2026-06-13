# Hand-off — Vendor Watch: Firecrawl is LIVE + UI progress + next ask (for Claude Code)

Date: 2026-06-13 · Author: Lovable. Follow-up to `handoff-vendor-watch-firecrawl.md`.

## What shipped on Lovable's side

1. **`FIRECRAWL_API_KEY` provisioned** via the workspace's "Satori's Firecrawl"
   connection (workspace connector → injected into `process.env` on the Worker).
   No Vault mirror needed — the key is only read inside `scrape.functions.ts` on
   the Worker, never from Postgres.

2. **Per-source "prefer Firecrawl" toggle.** New column
   `vendor_scrape_sources.prefer_firecrawl boolean NOT NULL DEFAULT false`.
   When true (and the key is set), `runScrapeForSource` starts on the Firecrawl
   transport instead of trying direct first. Wired through the source selects in
   `refreshScrapeSource` (admin "Refresh now") and the cron hook
   (`/api/public/hooks/refresh-scrape-sources`).
   **The Furnace source is flipped to `prefer_firecrawl = true`** because direct
   fetch was silently truncating at ~384 items (one short page, then loop exit);
   Firecrawl paginates the full collection (~750+ items).

3. **Live progress indicator on the source detail page** (cheap version, no
   scrape-logic change). New server fn `getScrapeProgress(sourceId)` returns
   `{ itemCount, lastScrapedAt, lastScrapeStatus, lastItemCount }`. The detail
   page polls it every 2s **only while a refresh mutation is in-flight** and
   shows `Scraping · N items` in the action button. Poll stops on completion;
   final toast still reports `added/updated/snapshots/transport` as before.

## Receipts (from tonight's runs)

- 702 → 787 → 876 → … distinct items, zero dupes, all keyed on Furnace SKU codes
  (B65, C57, D134 — same collection, just more pages than direct fetch found).
- 00:03 ET cron tick errored "HTTP 403 at page 1" (this was *before* the key
  landed — confirms direct path is genuinely blocked). All subsequent manual
  refreshes succeeded on Firecrawl.
- No timeouts observed at ~750 items + image downloads, but we're getting close
  to Worker CPU/duration limits on a full Furnace pass. Worth keeping an eye on;
  may need to defer image downloads or chunk pagination if a future collection
  is larger.

## Files touched (Lovable)

- `supabase/migrations/<ts>_add_prefer_firecrawl.sql` — column + Furnace flip.
- `src/lib/scrape.functions.ts` — `prefer_firecrawl` plumbed into transport
  selection; new `getScrapeProgress` server fn. **No changes to scrape body,
  parsing, snapshot logic, or fallback behavior** — your lane is intact.
- `src/routes/api/public/hooks/refresh-scrape-sources.ts` — added
  `prefer_firecrawl` to the source select.
- `src/routes/_app/vendor-watch.$sourceId.tsx` — wired progress poll +
  button label.

## Next ask from the boss (for you when appropriate — NOT urgent)

**Cross-vendor coral-type tracking.** Once we have multiple sources flowing, the
boss wants to organize the scraped listings by **coral type** (e.g. acro,
chalice, zoa, leather, acan, frogspawn) and:

- Sort/filter the source detail view by type.
- "Track" a type globally — get notified / surface new drops of that type across
  **all** vendors, not just one source.

Open design questions (your call when you pick this up):

1. **Where does `type` come from?** Shopify `product_type` is empty on Furnace
   (all blank). Title-pattern extraction is realistic ("ACRO", "CHALICE", etc.
   appear in titles like "C259 - TSA DAN AYKROYD ACRO"). AI-classify is the
   richer option but draft-only per project rules. Probably: regex/keyword pass
   first, AI as a backfill, human-confirm on the item row.
2. **Storage.** Probably a `coral_type` enum or text column on
   `vendor_scrape_items`, plus a `tracked_coral_types` table scoped per
   workspace (or per user).
3. **Surface.** A new "Watchlist" tab on `/vendor-watch` that aggregates
   `available_at_source=true` items across sources, filtered to the tracked
   types, newest first. Existing source-detail filter bar gets a type
   dropdown.

Not in scope right now — just logging it so we don't lose it.

## Not changed / your lane untouched

- `scrape.functions.ts` core scrape body, pagination, snapshot append, image
  download, error handling — unchanged.
- `routeTree.gen.ts` — untouched (auto-generated).
- The Firecrawl adapter itself (`fetchViaFirecrawl`, `extractProductsJson`,
  `fetchProductsPage`) — unchanged.

---

## Addendum — 2026-06-13 (same session, later): Image perf + lightbox

The boss flagged that thumbnails on `/vendor-watch/:sourceId` were loading
slowly (full-resolution Shopify masters, 1500–2500px, 300–800KB each).

### What Lovable shipped

1. **Signed URL transforms for thumbnails.** `createSignedUrls` now passes
   `transform: { width: 320, height: 320, resize: "cover", quality: 70 }` so
   the 56×56 list thumbs and 320×320 grid thumbs are served as webp from
   Supabase Storage — ~95% smaller than the original master.
2. **Lazy + async decoding.** All `<img>` tags on the page got `loading="lazy"`
   and `decoding="async"` so off-screen images don't fetch until scrolled near.
3. **Explicit dimensions.** `width`/`height` attributes added to every `<img>`
   to kill layout shift.
4. **Lightbox for full quality.** Clicking any thumbnail now opens a fixed
   overlay (`bg-black/80`) that renders the image at `object-contain` with
   `max-w-full max-h-full`. The overlay opens instantly with the already-cached
   thumb, then a fresh full-quality signed URL (no transform, 1h expiry) is
   fetched in the background and swapped in. Close by clicking the overlay or
   pressing Escape. Shows a `Loader2` spinner while the full-quality URL
   resolves.

### Files touched (Lovable)

- `src/routes/_app/vendor-watch.$sourceId.tsx` — thumbnail transforms, lazy
  loading, lightbox state + overlay, `cursor-zoom-in` on thumbs.

### Your lane still untouched

- Image download / storage logic in `scrape.functions.ts` — no change.
- `vendor_scrape_items.photo_path` storage shape — no change.
- No new migrations.
