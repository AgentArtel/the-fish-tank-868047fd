# Scope — Move external integrations off the app Worker into Supabase Edge Functions

> **Status:** audit / scoping only. **Nothing changed.** Read-only pass over `src/lib/*` and
> `src/routes/api/public/hooks/*`. No app code edited, no migration written, no commit.
> **Trigger:** the CMS species-image sourcing (`gatherSpeciesImages`) does Firecrawl scraping +
> Wikipedia/iNaturalist fetches + `callAIChat` AI calls *inside an app server function*. This audit
> checks whether that's a one-off or a pattern.
> **Lanes:** `[Edge=Lovable]` builds/deploys each Supabase Edge Function (Deno, secrets in Supabase,
> the DB writes) · `[App=Claude]` wires the thin app side (invoke the edge fn or, better, just read
> the table the edge fn populated). **No app behavior change is in scope here — this is the plan.**

---

## TL;DR — the honest current-state verdict

**The "everything I build follows the edge-function guideline" assumption does not hold.** There are
**zero** Supabase Edge Functions in this repo — `supabase/` contains only `config.toml` and
`migrations/` (43 migrations), and there is no `supabase/functions/` directory, no `deno.json`, no
import map. **Every external integration runs app-side**, inside TanStack Start `createServerFn`
handlers (`src/lib/*.functions.ts`) and their helper modules (`*.server.ts`, `*.api.ts`).

And those server functions run **in a Cloudflare Worker** — `wrangler.jsonc` (`main: src/server.ts`,
`nodejs_compat`) + `@cloudflare/vite-plugin`. That is the smoking gun: the codebase is **littered
with chunking/back-fill workarounds whose only purpose is to fit third-party I/O inside the Worker
subrequest + CPU budget** — exactly the symptom that an edge function would remove:

- `scrape.functions.ts:237` — *"Cloudflare Workers cap subrequests per invocation (~1000)… only
  download a bounded number of images per scrape run"* (`MAX_IMAGE_DOWNLOADS_PER_RUN = 80`).
- `clover.functions.ts:159-162` — *"creating ~1258 items in one request blows the Worker time limit
  and the runtime kills it with no catchable error"* → STEP 2 is browser-driven chunks.
- `clover.functions.ts:111` / `clover.ingest.server.ts:240` — sales sync chunked by order offset
  *"to keep each request inside the Cloudflare Worker budget."*
- `ops.functions.ts:936` — manual byte-chunking to base64 a 15 MB PDF for the AI call.
- `reports.functions.ts:9` — read-only insight bounded *"for the Cloudflare Worker budget."*

So the real state is the opposite of the assumption: **integration/heavy work is ~entirely app-side
today, and the team is already paying the Worker-budget tax to keep it alive there.** The
`gatherSpeciesImages` violation is not an exception; it is the newest instance of the dominant
pattern.

**Count:** 5 violation groups spanning **3 modules + 1 shared AI helper + 2 cron hook routes**, with
**~12 entry server functions** doing external I/O. Everything else in `src/lib/*.functions.ts` is
legitimately FINE (auth-gated DB CRUD).

---

## Where integrations actually run today (factual map)

| Module | Kind | Runs in | Integration? |
|---|---|---|---|
| `src/lib/ai-call.server.ts` | shared helper | app Worker | **YES** — `fetch` to OpenAI / Gemini / Lovable AI Gateway; `process.env.LOVABLE_API_KEY` |
| `src/lib/scrape.functions.ts` | server fns + helpers | app Worker | **YES** — Firecrawl + direct Shopify scrape + image download/upload; `process.env.FIRECRAWL_API_KEY` |
| `src/lib/cms.functions.ts` | server fns + helpers | app Worker | **YES** — Wikipedia, iNaturalist, Firecrawl (via scrape), `callAIChat` (resolve + vision verify), image materialize |
| `src/lib/clover.api.ts` | API client | app Worker | **YES** — Clover REST `fetch` |
| `src/lib/clover.functions.ts` | server fns | app Worker | **YES** — orchestrates Clover catalog/sales pulls (chunked) |
| `src/lib/clover.ingest.server.ts` | server helper | app Worker | **YES** — Clover order ingest → `inventory_sale_events` |
| `src/routes/api/public/hooks/clover-poll.ts` | cron route | app Worker | **YES** — service-role Clover poll |
| `src/routes/api/public/hooks/refresh-scrape-sources.ts` | cron route | app Worker | **YES** — service-role scrape refresh |
| `ops.functions.ts` (`extractBatchWithAI`, `parseTagPhoto`, `parseInventoryMarkdown`) | server fns | app Worker | **YES** — `callAIChat` for invoice/tag/markdown parsing |
| `catalog / customers / feedback / loyalty / reports / workload / ai-settings . functions.ts` | server fns | app Worker | **NO** — auth-gated DB CRUD (FINE) |

`clover.api.ts` reads creds from the `clover_credentials` table (not env), which is good practice —
but it still performs the third-party `fetch` in the Worker, so the *egress* still belongs on the
edge even though the *secret handling* is already table-driven.

---

## Violations table (file:line · integration · current layer · target edge fn)

| # | Entry server fn / helper | file:line | Integration | Current layer | Target |
|---|---|---|---|---|---|
| 1 | `gatherSpeciesImages` | `cms.functions.ts:514` | orchestrates 4–7 below | app Worker | `gather-species-images` |
| 1a | `resolveSpecies` (AI) | `cms.functions.ts:408,412` | `callAIChat` (flash) | app Worker | (folded into `gather-species-images`) |
| 1b | `aiMatchConfidence` (AI vision) | `cms.functions.ts:486,488` | `callAIChat` (flash, image) | app Worker | (folded in) |
| 1c | `fromWikipedia` | `cms.functions.ts:356,359` | `fetch en.wikipedia.org` | app Worker | (folded in) |
| 1d | `fromINaturalist` | `cms.functions.ts:378,380` | `fetch api.inaturalist.org` | app Worker | (folded in) |
| 1e | `fromTopShelf` | `cms.functions.ts:447,450` | `fetchViaFirecrawl` (Firecrawl) | app Worker | (folded in) |
| 1f | `materializeIntoMediaBucket` | `cms.functions.ts:322,326` | image `fetch` → storage upload | app Worker | `materialize-image` (shared) |
| 2 | `callAIChat` (shared) | `ai-call.server.ts:115,132` | OpenAI / Gemini / Lovable Gateway `fetch`; `LOVABLE_API_KEY` | app Worker | `ai-call` (shared edge fn) |
| 2a | `extractBatchWithAI` | `ops.functions.ts:863,949` | invoice-PDF AI extract (`callAIChat`, `LOVABLE_API_KEY:944`) | app Worker | `parse-invoice` |
| 2b | `parseTagPhoto` | `ops.functions.ts:1475,1543` | tag-photo AI parse | app Worker | `parse-tag-photo` |
| 2c | `parseInventoryMarkdown` | `ops.functions.ts:1604,1664` | markdown AI parse | app Worker | `parse-inventory-markdown` |
| 3 | `fetchViaFirecrawl` | `scrape.functions.ts:186,189` | Firecrawl `api.firecrawl.dev`; `FIRECRAWL_API_KEY:187` | app Worker | `scrape-source` (shared egress) |
| 3a | `fetchWithRetry` / `fetchProductsPage` | `scrape.functions.ts:170,173,225` | direct Shopify scrape | app Worker | (folded into `scrape-source`) |
| 3b | `downloadImage` | `scrape.functions.ts:250,251` | image `fetch` → storage upload | app Worker | `materialize-image` (shared) |
| 3c | `refreshScrapeSource` | `scrape.functions.ts:551` | full scrape pass (chunked, 80-img cap) | app Worker | `scrape-source` |
| 3d | `backfillScrapeImages` | `scrape.functions.ts:624,659` | bounded image back-fill loop | app Worker | `scrape-source` (image phase) |
| 3e | `createScrapeSource` | `scrape.functions.ts:685` | first scrape on create | app Worker | `scrape-source` |
| 3f | `getVendorFeed` | `scrape.functions.ts:781` | (verify: live fetch vs table read) | app Worker | read-only if table-backed |
| 4 | `cloverListItems` / `cloverListRecentOrders*` / `cloverTestConnection` | `clover.api.ts:73,90,142,161` | Clover REST `fetch` | app Worker | `clover-sync` |
| 4a | `importCloverCatalog` | `clover.functions.ts:164` | Clover catalog pull → `clover_item_links` | app Worker | `clover-sync` (catalog) |
| 4b | `syncCloverSalesChunk` | `clover.functions.ts:117` | Clover orders pull (chunked) → ingest | app Worker | `clover-sync` (sales) |
| 4c | `ingestCloverSalesPage` | `clover.ingest.server.ts` | order→`inventory_sale_events` ingest | app Worker | `clover-sync` (sales) |
| 4d | `testCloverConnection` | `clover.functions.ts:142` | Clover `fetch` test | app Worker | `clover-sync` (test action) |
| 5 | `clover-poll` cron | `routes/api/public/hooks/clover-poll.ts` | scheduled Clover ingest (service-role) | app Worker | Supabase cron → `clover-sync` |
| 5b | `refresh-scrape-sources` cron | `routes/api/public/hooks/refresh-scrape-sources.ts` | scheduled scrape (service-role) | app Worker | Supabase cron → `scrape-source` |

**Explicitly FINE (do NOT migrate):** all of `catalog/customers/feedback/loyalty/reports/workload/
ai-settings.functions.ts`, plus the non-integration handlers in `ops.functions.ts` (pricing approval,
convert-to-inventory, availability, reconciliation, duplicates, sales logging) and the read/CRUD
handlers in `cms.functions.ts`/`clover.functions.ts` (`listSpeciesImageCandidates`,
`approveSpeciesImage`, `getCloverOverview`, settings reads). These are auth-gated DB reads/writes —
the correct home for an app server fn. `ai-settings.functions.ts` storing the BYO keys in
`workspace_ai_settings` stays app-side; only the *consumption* (`callAIChat`) moves to the edge.

---

## Migration plans by group (with data-driven contracts)

### Group A — Shared AI inference: `ai-call` edge function `[Edge=Lovable]` + `[App=Claude]`
The single most-leveraged move: `callAIChat` is the shared chokepoint behind **5 entry points**
(CMS resolve/vision, `extractBatchWithAI`, `parseTagPhoto`, `parseInventoryMarkdown`). Today it lives
in the Worker, holds `LOVABLE_API_KEY` in `process.env`, reads `workspace_ai_settings` for BYO
keys, and does the upstream `fetch` + fallback.

- `[Edge=Lovable]` Build `ai-call` (Deno). Move provider resolution + BYO-key read +
  OpenAI/Gemini/Lovable `fetch` + fallback + `recordUsage` into it. Secrets (`LOVABLE_API_KEY`,
  and ideally the BYO keys) live in Supabase. This is the Deno port of `ai-call.server.ts` —
  same OpenAI-compatible request shape.
- **Contract:** input `{ tier, lovableModel, messages, tools?, tool_choice? }` → output
  `{ json, provider, fellBack }` (identical to `CallAIResult`). Side effect: updates
  `workspace_ai_settings.last_used_*`.
- `[App=Claude]` Replace the `ai-call.server.ts` body with a thin `supabase.functions.invoke("ai-call", …)`
  wrapper (same signature) so the three AI parse server fns are untouched — OR, preferred for the
  parse fns, see Group B.

### Group B — AI document/photo parsing `[Edge=Lovable]` + `[App=Claude]`
`extractBatchWithAI` (invoice PDF), `parseTagPhoto`, `parseInventoryMarkdown`. These download a file
from storage, base64-chunk it (`ops.functions.ts:936` is a pure Worker-budget hack), call AI, and
write rows. **Make these table-driven**, not request/response:

- `[Edge=Lovable]` `parse-invoice` / `parse-tag-photo` / `parse-inventory-markdown` (Deno).
  - **Contract (invoice):** input `{ batchId }`. Reads `vendor_batches.pdf_storage_path` from
    storage, calls AI (via the `ai-call` edge fn or inline), **writes** `vendor_line_items` +
    `vendor_batch_charges`, updates `vendor_batches.extraction_status`
    (`ai_pending`→`extracted`/`failed`) and `notes`. No base64-chunk hack needed off the Worker.
  - **Contract (tag/markdown):** input the photo/markdown ref → writes the same draft rows /
    extraction result the current handlers write.
- `[App=Claude]` The app server fn becomes: auth-gate (`requireEditor`) → set
  `extraction_status='ai_pending'` (or just invoke) → `functions.invoke(...)`. The UI **reacts to
  `vendor_batches.extraction_status`** (already a column it watches), so the app stops blocking on
  the long AI call. *Domain invariant preserved:* AI stays draft-only; `extracted` is not
  `approved`; humans still approve pricing/convert.

### Group C — CMS species images: `gather-species-images` `[Edge=Lovable]` + `[App=Claude]` (the trigger)
`gatherSpeciesImages` (`cms.functions.ts:514`) fans out to Wikipedia, iNaturalist, Firecrawl
(TopShelf), and two AI calls — the densest external-I/O server fn in the repo, and the one that
prompted this audit.

- `[Edge=Lovable]` `gather-species-images` (Deno). Move `resolveSpecies`, `fromWikipedia`,
  `fromINaturalist`, `fromTopShelf`, `aiMatchConfidence` into it (the per-source try/skip resilience
  carries over unchanged).
  - **Contract:** input `{ contentItemId }`. Resolves the post's source vendor batch + species,
    fans out to the sources, scores with AI, and **writes candidate rows** (the table
    `listSpeciesImageCandidates` already reads — `species_image_candidates` or equivalent) with
    `source/source_url/image_url/license/attribution/commercial_ok`. **No publish, no Facebook.**
- `[App=Claude]` `gatherSpeciesImages` becomes auth-gate → `functions.invoke("gather-species-images")`;
  the candidate UI keeps reading via `listSpeciesImageCandidates`. *Invariant preserved:*
  human-in-the-loop — `approveSpeciesImage`/`rejectSpeciesImage` stay app-side DB writes (FINE).
- **Shared:** the approve-time `materializeIntoMediaBucket` (`cms.functions.ts:322`) and scrape's
  `downloadImage` (`scrape.functions.ts:250`) are the same fetch→upload shape into different
  buckets → one shared `materialize-image` edge fn (`{ url, bucket, path }` → returns stored path).

### Group D — Scraping / vendor-watch: `scrape-source` `[Edge=Lovable]` + `[App=Claude]`
The whole Firecrawl/Shopify scrape pipeline: `fetchViaFirecrawl`, `fetchWithRetry`,
`refreshScrapeSource`, `createScrapeSource`, `backfillScrapeImages`. The Worker-budget caps
(`MAX_IMAGE_DOWNLOADS_PER_RUN=80`, the back-fill loop, the ~1000-subrequest comment) **disappear** on
an edge fn that can do a full pass.

- `[Edge=Lovable]` `scrape-source` (Deno). Owns Firecrawl (`FIRECRAWL_API_KEY` as a Supabase
  secret), direct fetch + retry, products parse, and image materialize.
  - **Contract:** input `{ sourceId }` (+ optional phase). **Writes** the scrape items/snapshots
    table(s) and `photo_path`s; updates the source's progress/last-run columns the UI polls.
- `[App=Claude]` `refreshScrapeSource`/`createScrapeSource`/`backfillScrapeImages` collapse to
  invoke + the existing progress reads (`getScrapeProgress`). The browser-driven chunk loop can be
  dropped once the edge fn runs the full pass.
- **Verify:** `getVendorFeed` (`scrape.functions.ts:781`) — confirm whether it does a *live* fetch or
  reads the scraped table; if table-backed it's already FINE and stays app-side.

### Group E — Clover: `clover-sync` `[Edge=Lovable]` + `[App=Claude]`
All Clover egress: `clover.api.ts` (REST client), `importCloverCatalog`, `syncCloverSalesChunk`,
`testCloverConnection`, and `clover.ingest.server.ts`. The two-step chunked import and offset-chunked
sales sync exist *solely* for the Worker budget (`clover.functions.ts:159-162`).

- `[Edge=Lovable]` `clover-sync` (Deno) with actions `{ catalog | sales | test }`. Reads creds from
  `clover_credentials` (keep the table-driven creds — no env), pulls items/orders, and **writes**
  `clover_item_links` (catalog) / `inventory_sale_events` + customer upserts (sales), updating
  `clover_connection.last_import_at` / `last_sale_synced_at`. Idempotency (UNIQUE + dedupe) is DB-side
  and carries over.
- `[App=Claude]` `getCloverOverview`/settings reads stay app-side (FINE). The import/sync server fns
  become single invokes; the **browser chunk loops are deleted** because the edge fn can run the full
  window. *Caveat:* `applyInventorySale` is currently imported by the ingest from `ops.functions.ts`
  — that decrement logic must be ported/shared into the edge fn (a real coupling, see risks).

### Group F — Crons → Supabase scheduled functions `[Edge=Lovable]`
`clover-poll.ts` and `refresh-scrape-sources.ts` (service-role) currently run integrations on the
Worker. Once D and E exist, point Supabase scheduled triggers (`pg_cron` / scheduled edge invoke) at
`clover-sync` / `scrape-source` and retire the app hook routes (or leave them as thin forwarders).

---

## Prioritization & recommended sequence

1. **Group A — `ai-call` edge fn first.** Highest leverage, lowest blast radius: it's a clean port
   of one self-contained helper, and it unblocks B and C. Pure infra move, no UX change.
2. **Group B — AI parse fns.** Converts the worst Worker hack (`ops.functions.ts:936` PDF chunking)
   into a table-driven flow; reuses A. Medium effort, contained behind `extraction_status`.
3. **Group C — CMS species images.** The stated trigger. Reuses A + the shared `materialize-image`.
   Self-contained, already human-in-the-loop, candidate table already exists.
4. **Group D — Scraping.** Removes the `MAX_IMAGE_DOWNLOADS_PER_RUN`/back-fill complexity. Larger
   surface (multiple entry fns + a cron) but well-isolated from money/stock.
5. **Group E — Clover. Do last / most carefully** — see risk below.
6. **Group F — Crons.** Trivial once D and E land.

**Effort:** A = S · C = M · B = M · D = M/L · E = L · F = S.

---

## Most-coupled / riskiest: Group E (Clover)

Clover is the single most-coupled and highest-risk migration, for three reasons:

1. **It touches money + stock.** `ingestCloverSalesPage` decrements inventory and writes
   `inventory_sale_events`; a partial/incorrect port can double-decrement or skip sales. The
   idempotency (UNIQUE `(clover_order_id, clover_line_item_id)` + dedupe) must move with it exactly.
2. **Cross-lane code coupling.** `clover.ingest.server.ts:14` imports `applyInventorySale` **from
   `ops.functions.ts`** — shared decrement logic that also serves manual sales. Moving ingest to Deno
   means either porting `applyInventorySale` into the edge fn or extracting it into shared logic the
   edge fn calls — a non-trivial refactor that affects the app-side sale path too.
3. **It carries a live cron** (`clover-poll`) and a chunked browser loop simultaneously; both call
   the same ingest, so the cutover has to keep both paths consistent during migration.

By contrast, the AI groups (A/B/C) are append-only / draft-only and human-gated, so they're safe to
move first and build confidence.

---

## Open questions

- **Does the team want full edge migration, or just the trigger (`gatherSpeciesImages`)?** The audit
  shows the pattern is repo-wide; doing only C leaves the same Worker-budget tax everywhere else.
  Recommend A→B→C as a coherent first phase, defer D/E.
- **BYO AI keys location.** Keep BYO keys in `workspace_ai_settings` (table, admin-managed via
  `ai-settings.functions.ts`) and have the `ai-call` edge fn read them, or move them to Supabase
  secrets? Table keeps the admin UI working — recommend keeping the table, edge fn reads it.
- **`getVendorFeed` / `listScrapeSources` / progress reads** — confirm which are pure table reads
  (stay app-side, FINE) vs. live fetches before touching them.
- **`applyInventorySale` extraction** — agree the shared-logic boundary before starting Group E.
- **DB lane confirmation:** every new edge function + any cron schedule is Lovable's lane and must
  ship as part of the versioned migration/Supabase config, not dashboard edits (WORKFLOW Golden
  Rules). This doc is the App-side scope; the edge functions themselves are `[Edge=Lovable]`.
