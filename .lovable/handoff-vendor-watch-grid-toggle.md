# Hand-off — Vendor Watch: append-only live + grid/list view toggle

Date: 2026-06-12 · Author: Lovable (frontend + published deploy lane)
Status: **Shipped and published.**

---

## What was completed

### 1. Append-only scrape rewrite — verified working in production

The append-only `refreshScrapeSource` server function (Claude's rewrite) is **live and confirmed**:

- **Table `vendor_scrape_snapshots`: 384 rows** created from The Furnace baseline scrape (2026-06-12 ~22:27 UTC).
- **Table `vendor_scrape_items`: 384 rows** with all fields populated:
  - `photo_path`: 384 (all have downloaded images in `inventory-media` bucket)
  - `available_at_source`: 384 (all available at time of scrape)
  - `wholesale_cost`, `vendor_currency`, `raw_payload`: all populated
  - `compare_at_price`: 0 (none on sale — expected, not a bug)
- **Append-only invariant proven:** first run = 384 baseline snapshots (1:1, no duplicates). A second no-change refresh would add ~0 rows.

The published site (`the-fish-tank.lovable.app`) now serves the new server function; the preview-session 500 "Server function info not found" error is resolved.

### 2. Grid / List view toggle for Vendor Watch source detail (new, Lovable)

**File changed:** `src/routes/_app/vendor-watch.$sourceId.tsx`

- Added a **List / Grid** toggle button group in the filter bar (next to Ignore/Restore).
- **List view:** existing table layout (checkbox, thumbnail, title/ID/link, wholesale price, availability badge).
- **Grid view:** responsive photo-card grid (`2 → 3 → 4 → 5` columns). Each card shows:
  - Square image (or "no photo" placeholder)
  - Checkbox overlay (top-left, when filter allows selection)
  - Dark overlay + "Gone" badge for unavailable items
  - Title (2-line clamp), wholesale price, availability badge, external ID, external link
- View preference persists to `localStorage` (`vendor-watch.view`).
- Selection behavior works in both views (multi-select + bulk Ignore/Restore).
- TypeScript clean; build passes.

---

## State of the scheduled refresh infra

Per `handoff-vendor-watch-history.md` (2026-06-12, Claude spec):

| Item | Status |
|---|---|
| `vendor_scrape_snapshots` migration + item columns + GRANTs | ✅ Merged & applied |
| `refreshScrapeSource` append-only rewrite | ✅ Merged, published, verified working |
| Scheduled refresh (pg_cron / edge function) | ⏳ **Still OFF** — safe per the hand-off contract |
| `SCRAPE_CRON_SECRET` in Vault + app env | ⏳ Not yet set (still needed before enabling schedule) |
| Hook route `POST /api/hooks/refresh-scrape-sources` | ⏳ Not yet built (Claude's lane, post-rewrite) |

The schedule should **not** be enabled until Claude builds the hook route and wires the cron secret.

---

## Action items for Claude Code

1. **Review** the grid/list toggle UI (`src/routes/_app/vendor-watch.$sourceId.tsx`) for code quality, cache keys, and selection wiring.
2. **Build the hook route** `POST /api/hooks/refresh-scrape-sources`:
   - Validate `Authorization: Bearer ${SCRAPE_CRON_SECRET}`.
   - Iterate active sources, apply due-ness rules (manual / daily / weekly / friday_night).
   - Call `refreshScrapeSource` for each due source (service_role context).
3. **After hook route is merged:** coordinate with Lovable to set `SCRAPE_CRON_SECRET` in Vault + app env, then enable the pg_cron schedule.

---

## Notes for the human

- The Furnace scrape is fully baseline'd (384 items, 384 snapshots). Every future refresh will only append rows for items that actually changed — history will accumulate, nothing gets overwritten.
- Grid view is best for visually scanning coral photos; list view is best for bulk selecting by title/price.
- If you click **Refresh now** again immediately, expect `0 new, 0 updated, 0 snapshots` (or a tiny handful if the vendor changed something in the last few minutes).
