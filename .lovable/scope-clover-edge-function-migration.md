# Scope — Migrate Clover (POS) off the app Worker into Supabase Edge Functions

> Status: **scoping / handoff — nothing implemented.** The detailed plan for **Group E** of
> `.lovable/scope-edge-function-migration.md`. Do this **while Clover is dormant** (no token entered) — it's
> the lowest-risk window, and POS comes alive already on the correct (decoupled, data-driven) architecture
> instead of lighting up a money-touching flow on the Worker and migrating it later.

## Why now
- Clover is **code-complete but dormant** (the `clover_credentials` seed row has no token). Migrating before
  it's switched on disrupts no live flow.
- It's the **largest Rule-7 violation**: every Clover third-party fetch, the heavy chunked catalog import,
  and the sales cron run on the Cloudflare Worker. The chunking hacks (browser-looped item creation,
  order-offset paging) exist *only* to fit the Worker budget — edge functions remove them.

## Current app-side surface (on the Worker today)
**External / heavy → move to edge:**
- `testCloverConnection` (`clover.functions.ts:142`) — hits Clover.
- `importCloverCatalog` (`:164`) — `cloverListItems` → upsert `clover_item_links`.
- `createWorkspaceItemsFromClover` (`:239`) — **browser-looped chunked** creation of inventory drafts from
  unlinked links (heavy DB, chunked for the Worker budget).
- `syncCloverSalesChunk` (`:117`) + `ingestCloverSales` / `ingestCloverSalesPage`
  (`clover.ingest.server.ts:241/286`) — fetch orders → `inventory_sale_events` → `decrement_inventory_stock`.
- `clover.api.ts` — the Clover HTTP client (`cloverGet`, `cloverListItems`, `cloverListRecentOrders`,
  `cloverTestConnection`, `requireCloverCreds`).
- Cron route `src/routes/api/public/hooks/clover-poll.ts` — the Worker route pg_cron hits every 10 min.

**Stays app-side (DB-only, allowed):**
- `getCloverOverview` (`:13`), `getCloverSettings` (`:59`) — table reads.
- `saveCloverSettings` (`:79`) — writes the creds row (no external I/O).

## Target architecture — 3 edge functions + thin app + cron→edge
**Edge functions (Lovable builds/deploys). They read the Clover token from the `clover_credentials` table
via the service role — no new env secret; the token stays admin-entered at runtime.**

1. **`clover-test-connection`** → verify creds against Clover; return `{ ok, merchant }`.
2. **`clover-import-catalog`** → fetch the full Clover catalog → upsert `clover_item_links` → create workspace
   inventory drafts for unlinked items, **in one server-side pass** (self-chunk internally if needed; no
   browser loop). Keep the `attrs.clover_item_id` orphan-recovery key.
3. **`clover-sync-sales`** → fetch recent orders (overlap window) → write `inventory_sale_events`; for linked,
   non-refund lines apply the sale (decrement + loyalty); refunds/unmatched → `needs_review`. Idempotent via
   `UNIQUE(clover_order_id, clover_line_item_id)` + dedupe. **Invoked by pg_cron directly** (replaces the
   Worker `clover-poll` route) AND by the manual "Sync sales now" button.

**App becomes thin (Claude wires):**
- `settings.clover.tsx`: Test / Import / Sync buttons → `supabase.functions.invoke('clover-test-connection' |
  'clover-import-catalog' | 'clover-sync-sales')`. **Remove the browser chunk loop.** Overview/settings →
  table reads. Saving creds stays a DB write.
- Delete the external code from the app: `clover.api.ts`, `clover.ingest.server.ts`, `clover-poll.ts` (their
  logic moves into the edge functions' Deno code).
- UI reacts to table state (data-driven): import progress = `clover_item_links` counts; sales =
  `inventory_sale_events` + the `needs_review` queue.

## Key design decision — share the sale-application logic via a DB RPC
`applyInventorySale` (`ops.functions.ts`) is shared by **manual sales (app)** and **Clover sales**. A Deno
edge function can't import the app's TS, so don't duplicate money logic. **Recommend extracting
`applyInventorySale` into a `SECURITY DEFINER` RPC `apply_inventory_sale(...)`** that atomically does:
insert `inventory_sale_events` + `decrement_inventory_stock` + loyalty award. Both the app (manual sales) and
the `clover-sync-sales` edge function call the **same** RPC → single source of truth, no drift. (DB-lane:
Lovable writes the RPC; App-lane: Claude points manual-sale callers at it.) *Alternative if you'd rather not:*
the edge function replicates the three steps in Deno — accept some duplication of the sale logic.

## Cron migration
Retire the Worker `clover-poll` route: point the existing pg_cron at the **`clover-sync-sales`** edge function
(Supabase scheduled function, or `net.http_post` to the function URL with the service key). Keep the 10-min
cadence + the 1-hour overlap window. Drop `clover-poll.ts` + the `SCRAPE_CRON_SECRET` for this path.

## Risks / notes
- **Money-touching:** the decrement is the only stock write; the `apply_inventory_sale` RPC keeps it atomic +
  idempotent. After pointing manual sales at the RPC, verify the manual sale path still works.
- **Do it while dormant:** no live flow to break; full end-to-end verification happens *after* creds are
  entered (the step right after this migration).
- **Idempotency preserved:** the `UNIQUE` constraint + dedupe move with the logic into `clover-sync-sales`.
- **Creds:** stay in `clover_credentials` (admin-entered); edge functions read via service role. No token in
  env or repo.

## Lanes & sequence
1. **[DB=Lovable]** `apply_inventory_sale` RPC (extract from `applyInventorySale`).
2. **[App=Claude]** point manual-sale callers at the RPC; verify the manual/coral sale paths.
3. **[Edge=Lovable]** build + deploy `clover-test-connection`, `clover-import-catalog`, `clover-sync-sales`;
   move pg_cron to `clover-sync-sales`.
4. **[App=Claude]** thin `settings.clover.tsx` (invoke + table-read); delete `clover.api.ts` /
   `clover.ingest.server.ts` / `clover-poll.ts` external code.
5. **[Ops]** enter the real Clover token → live smoke-test (now on the correct architecture).
6. **[App]** (separate follow-up) build the `needs_review` reconciliation / manual-link UI.
