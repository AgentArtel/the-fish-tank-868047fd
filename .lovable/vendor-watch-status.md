# Vendor Watch — status & resume guide

Last updated: 2026-06-13 · Owner: Claude Code. Single source of truth for picking
this feature back up. Full history is in `.lovable/devlog.md`; specs are in the
`.lovable/handoff-vendor-watch-*.md` docs.

## ✅ Done & live on `main`
- **Append-only history** — `vendor_scrape_snapshots` (price/availability/on-sale
  over time) + `compare_at_price`; `runScrapeForSource` appends, never overwrites.
- **Scheduled refresh** — `pg_cron` → `/api/public/hooks/refresh-scrape-sources`
  (bearer `SCRAPE_CRON_SECRET`) → append-only scrape. Cadence throttle in the route.
- **Firecrawl tier** — auto-fallback on 403/429 + per-source `prefer_firecrawl`
  pin. `FIRECRAWL_API_KEY` provisioned (workspace connection).
- **Image data asset** — capped in-scrape downloads + resumable **Back-fill**
  button + "N/Total stored" indicator. Display uses the vendor CDN URL directly.
- **Self-serve Add-source** dialog (`createScrapeSource`).
- **Cross-vendor Feed** (`getVendorFeed`) — new / price-drop / on-sale / sold,
  filter chips, per-row coral-type badge.
- **Coral-type** classifier (`src/lib/coral-type.ts`) + feed type filter.
- **Watchlist** — shop-wide `tracked_coral_types`; ★ Track {type} + ★ Watchlist
  filter + tracked-row highlight.
- **Live vendors:** Furnace (SDC), World Wide Corals, Top Shelf Aquatics — all
  via Firecrawl (datacenter-blocked direct).

## ⏸ Parked / blocked — what unblocks each
1. **Rubio's (SoFlo) authenticated source** — *blocked on the boss.* It's
   customer-**account-login** gated (empty products.json anonymously).
   **Next step:** boss logs in, opens `soflowrubioscorals.us/products.json?limit=5`
   in the same browser.
   - Returns JSON → build **cookie-auth tier** (store session cookie + attach to
     direct fetch / Firecrawl `headers`; needs Lovable storage — column or Vault).
   - Empty/redirect → catalog is **HTML-behind-login** → **Firecrawl-with-login**
     (form-fill actions + HTML parse) — bigger; decide if worth one source.
2. **Loud alerts (SMS/push)** — *parked on a decision.* No notification infra
   exists. **Next step:** pick a channel (Resend email / Twilio SMS / web push) →
   create account+key → build delivery + a dedup state table. Detection is trivial
   (tracked-type feed events).
3. **Per-item "watch this / to-order" flags** — planned fast-follow (tagging
   scaffold; `vendor_scrape_item_flags` table).
4. **Email digest** of the feed — planned.
5. **Firecrawl Monitoring** — parked option (could replace `pg_cron`; ~1 credit/
   check). See devlog 2026-06-13.

## 🔧 Small follow-ups
- **Drop `as any` casts** in `listTrackedCoralTypes` / `setTrackedCoralType`
  (scrape.functions.ts) once Lovable regenerates `types.ts` with
  `tracked_coral_types`.
- **Confirm the app-shell flash fix** (PR #13) feels smooth on the deployed app.

## Hand-off docs (specs)
`.lovable/handoff-vendor-watch-history.md` (append-only + cron), `-firecrawl.md`,
`-seed-vendors.md`, `-watchlist.md`.

## How to resume
Read this doc + the latest `.lovable/devlog.md` entries, then act on whichever
parked item just got its missing input (almost always: the boss's Rubio's login
test, or an alert-channel choice). No live agent is needed in the meantime —
nothing is in flight; it's all on `main`.
