# Audit — Clover catalog import: items never appear / "0 linked / 1258 unlinked"

**Date:** 2026-06-14 · **Author:** Claude Code (read-only audit) · **Scope:** why an admin's
Clover catalog import doesn't create/visible-link `inventory_items`, and a KISS hardening plan.

**Status of the bug per the running log:** `.lovable/devlog.md` (2026-06-14 entry) already records
this exact symptom on prod: *"Boss re-ran import on prod → still 0 linked, 'last import 30m ago'
(timestamp never advanced) = the handler timed out before finishing."* The bulk rewrite (commit
`5815fcb`) was the attempted fix. This audit confirms the timeout is the dominant root cause,
identifies why the *current* bulk code can still die or appear to do nothing, and finds two
secondary failure/visibility traps.

---

## TL;DR

- **Deployment target is Cloudflare Workers** (`wrangler.jsonc` → `main: src/server.ts`;
  `@cloudflare/vite-plugin` in `package.json`). Server functions run under a **Worker request
  time/CPU budget**, not a generous Node serverless budget. A single import that pulls 1258 items
  *and* bulk-inserts them (each insert firing the `log_inventory_activity` AFTER trigger →
  ~1258 extra `inventory_activity_logs` inserts in-txn) is the long pole.
- The import is **all-or-nothing for observability**: `last_import_at` is written **only at the
  very end** (`clover.functions.ts:278-281`). If the Worker is killed mid-run, the timestamp never
  advances and the toast never resolves — exactly the reported "last import 30m ago / 0 linked".
- The **toast only fires on full success** and only surfaces a thrown error; a Worker that is
  *terminated* (CPU/time cap, not a JS throw) yields **no toast at all** and a swallowed/aborted
  request — so the admin "sees nothing."
- Items can be **created but invisible-by-link**: created `inventory_items` rows DO show on the
  Stock page (no filter excludes `not_for_sale`), but if the run dies *after* an insert batch and
  *before* its link upsert, you get orphan items with `0 linked` still showing on the settings page
  even though rows exist. Conversely if it dies before any insert, you get the reported pure "0
  linked / 1258 unlinked."

---

## How the pieces actually fit (verified)

- **Server fn client is user-scoped (RLS applies).** `requireSupabaseAuth`
  (`src/integrations/supabase/auth-middleware.ts:46-61`) builds a client with the **publishable
  (anon) key** + the caller's Bearer token. So every insert/upsert in `importCloverCatalog` runs as
  the admin **through RLS**, not service-role. (`importCloverCatalog` uses `context.supabase`,
  `clover.functions.ts:149`.)
- **The admin passes every relevant RLS/trigger gate** (see "Ruled out").
- **Stock page query** (`src/routes/_app/inventory.index.tsx:95-110`): `select('*', …)`,
  `.order('updated_at', desc)`, `.limit(500)`, default `statusFilter='all'` (no availability
  filter), no location filter unless a `?location=` search param is set. RLS SELECT is
  `is_active_user(auth.uid())` (`…15d2…sql:258`).

---

## Most likely root cause(s) — ranked, with evidence

### 1. (PRIMARY) Cloudflare Worker time/CPU termination before the run finishes
**Evidence:**
- Deploy = Cloudflare Workers: `wrangler.jsonc:6` (`"main": "src/server.ts"`), `vite.config.ts`
  cloudflare plugin note, `@cloudflare/vite-plugin` in `package.json`.
- `devlog.md` 2026-06-14: prod re-run "timed out before finishing… timestamp never advanced."
- Work performed in one request: Clover pagination (`cloverListItems`, `clover.api.ts:89-111`,
  ~13 sequential `fetch` round-trips for 1258 @ limit 100) **plus** the DB write storm below.
- **Hidden multiplier — the activity-log trigger.** Every `inventory_items` INSERT fires
  `log_inventory_activity` AFTER INSERT (`…15d2…sql:348-352, 398-399`), which runs `to_jsonb(NEW)`
  and inserts a row into `inventory_activity_logs` **per created item**. A 1258-item first import =
  1258 extra in-transaction inserts on top of the 3 bulk inserts, all inside the Worker request.
  `guard_inventory_gates` (`…15d2…sql:270-293`) also runs per row.
- The bulk rewrite (`5815fcb`) cut the *link* round-trips (no more 1258 one-by-one updates) but did
  **not** reduce the per-row trigger cost of creating 1258 items, and still does everything in **one
  Worker invocation** with **no time budget / no resume checkpoint**.

**Why it presents as "0 linked / 1258 unlinked":** the 1258 `clover_item_links` rows already exist
as `link_status='unlinked', inventory_item_id=NULL` from the earlier read-only import (devlog
2026-06-13). On re-run those links have `inventory_item_id=NULL`, so
`linkByClover.get(ci.id)?.inventory_item_id` is null (`clover.functions.ts:193`) and all 1258 fall
into `toCreate`. If the Worker dies during/after the first `inventory_items` insert batch but before
committing enough link upserts, the settings counts (`getCloverOverview`,
`clover.functions.ts:41-44`) still read 1258 total / 0 `linked`.

### 2. (PRIMARY, same failure, observability angle) No progress checkpoint + success-only toast
**Evidence:**
- `last_import_at` is updated **only after the entire loop** (`clover.functions.ts:278-281`). A
  killed run never advances it → "Last import 30m ago" is stale, matching the report.
- The settings UI toast is success-only on resolve and error-only on a JS throw
  (`settings.clover.tsx:71-84`). A Worker that is **terminated by the runtime** (exceeded
  time/CPU) does not produce a catchable `Error` in the client `try/catch` — the fetch
  aborts/errs generically, so the admin may see nothing or a generic network error, never the
  per-step counts. **The import is effectively unobservable on partial failure.**
- Per-batch link upserts (`clover.functions.ts:264-267`) DO commit incrementally, which is good for
  idempotency, but nothing tells the user "I created 500 of 1258, re-run me."

### 3. (SECONDARY) Created-but-unlinked orphans look like "nothing imported" on the settings page
**Evidence:**
- The create loop inserts items first (`clover.functions.ts:241-244`), then upserts that batch's
  links (`:264-267`). Between those two awaits the run can die. Result: real `inventory_items` rows
  exist (and **do** appear on `/inventory` — they pass the SELECT policy and no filter hides
  `not_for_sale`), but `clover_item_links` still shows them unlinked, so settings reads "0 linked".
- The orphan-safe re-link (`invByCloverId`, `clover.functions.ts:166-171, 199-204`) is designed to
  heal this on the *next* run — but only if the next run also completes, which (root cause #1) it
  may not. So the user can be stuck in a loop of partial runs that never converges.

---

## Ruled out (confirmed NOT the problem), with evidence

- **RLS blocking the admin's `inventory_items` INSERT.** Policy `"inv insert editor"` =
  `can_edit_content(auth.uid())` (`…15d2…sql:259`), which is true for admins
  (`…b667…sql:55-64`). Not the cause. *(Note: failed-RLS inserts would surface as a thrown
  error via `if (error) throw` at `clover.functions.ts:245` — they're loud, not silent.)*
- **`guard_inventory_pricing_approval` rejecting `pricing_status:'approved'` on insert.** That
  trigger is **`BEFORE UPDATE OF pricing_status` only** (`…1a1f…sql:24-27`) and explicitly exempts
  INSERTs ("INSERTs (Quick Add / bulk import) remain unaffected", `…1a1f…sql:1-2`). Inserting
  `approved` is allowed. Not the cause.
- **`guard_inventory_gates` blocking the insert.** It only raises when
  `availability_status='available'` or `live_sale_status IN ('staged','live')`
  (`…15d2…sql:274-288`). The import inserts `not_for_sale` / `not_eligible`
  (`clover.functions.ts:233-234`). Passes. Not the cause.
- **`inventory_qty_balance` CHECK violation.** Insert sets received/available/hold/sold/lost all 0
  (`clover.functions.ts:228-229` style: `quantity_received:0, quantity_available:0`); `0 >= 0` holds
  (`…15d2…sql:245-247`). Not the cause.
- **`attrs` not-null violation.** Import always sends a non-null object
  `attrs:{source:'clover', clover_item_id: ci.id}` (`clover.functions.ts:237`); column is
  `NOT NULL DEFAULT '{}'` (`…87e4…sql`). Not the cause. *(This was the historical quick-add bug;
  the import does it correctly.)*
- **Enum/column mismatch vs schema/types.** All inserted fields exist with matching types in
  `types.ts` `inventory_items.Insert` (`types.ts:404-439`): `item_type` enum (nullable),
  `availability_status`, `pricing_status`, `live_sale_status`, `attrs: Json`, `retail_price`,
  `needs_photo`, `created_by`. `clover_item_links` columns (`clover_item_id` UNIQUE,
  `inventory_item_id` nullable FK, `clover_name`, `clover_price_cents int`, `link_status` CHECK
  `('linked','unlinked')`, `last_synced_at`) all match the upsert payload
  (`clover.functions.ts:182-190, 253-261`; schema `…cc69…sql:3-13`). Not the cause.
- **`clover_item_links` upsert failing RLS or onConflict.** INSERT and UPDATE policies both exist
  and resolve to `can_edit_content` (`…cc69…sql:24-31`); admins pass. `onConflict:'clover_item_id'`
  matches the `UNIQUE` constraint (`…cc69…sql:6`). FK `inventory_item_id → inventory_items(id)` is
  satisfiable (or NULL). Not the cause. *(Again, a real failure would `throw`,
  `clover.functions.ts:267, 275` — loud.)*
- **`clover_connection` UPDATE failing for admin.** `"admins_update_clover_connection"` =
  `has_role('admin')` (`…cc69…sql:68-71`); the final update (`clover.functions.ts:278-281`) is
  admin-scoped. Fine — but note it only runs if the loop completes.
- **Stock page filtering the items out.** Default `statusFilter='all'`, no `type`/`location`
  filter unless URL search params set them (`inventory.index.tsx:51-53, 95-110`). Created items
  (`not_for_sale`) are **not** excluded. The only structural hide is **`.limit(500)` with
  `order(updated_at desc)`** — see the caveat below; this is a *display cap*, not the reason for "0
  imported," but it WILL hide most of 1258 rows once they exist.
- **Creds/auth to Clover.** `requireCloverCreds` loads via service-role admin client
  (`clover.api.ts:14-28`); if missing it throws a clear message that the toast would show. Since the
  boss pulled 1258 items, creds work. Not the cause.

---

## Caveat worth flagging (not the root cause, but a real visibility gap)

**The Stock page can only ever show 500 of 1258 items.** `inventory.index.tsx:102` hard-caps
`.limit(500)` ordered by `updated_at desc` with **no pagination UI**. Even after a *successful*
import, an admin scrolling `/inventory` will see only the 500 most-recently-touched rows and may
reasonably conclude "the import didn't work." Search/type/location filters narrow the set, so it's
usable, but a flat browse is misleading at 1258+. (Migration not required to fix — frontend lane.)

---

## Hardening plan (KISS)

Goal: make the import **(a) resumable/idempotent across Worker terminations, (b) observable
(per-step counts + clear errors), (c) guaranteed-visible once created** — with the smallest change,
reusing existing patterns. **Frontend/server-fn changes are Claude's lane; the two DB items are
flagged for Lovable.**

### A. Resumable / idempotent across timeouts — *server-fn lane (Claude), no migration*
1. **Cap the work per invocation and report "more to do."** Add an optional input
   `{ maxCreates?: number }` (default ~300) to `importCloverCatalog`. Process at most that many
   `toCreate` items per call; return `{ done: boolean, remaining: number, ... }`. The bulk
   structure already commits links per batch (`clover.functions.ts:264-267`) and re-links via
   `attrs.clover_item_id` on re-run (`:199-204`), so capping is safe and self-healing — this just
   bounds each Worker request under its time budget. *(Reuses the existing chunk loop + orphan-safe
   index; no new architecture.)*
2. **Drive it to completion from the client.** In `settings.clover.tsx runImport`
   (`:71-84`), loop the server fn while `!done`, updating the toast with cumulative counts
   (`sonner` `toast.loading`→`toast.success`, already imported). KISS: a `while` loop with an
   iteration cap (e.g. ≤10 calls) so the browser, not the Worker, owns the long-running orchestration.
3. **Checkpoint progress every call.** Update `clover_connection.last_import_at` (or a new
   `import_cursor`) at the **end of each capped call**, not only the final one
   (move/duplicate the `:278-281` write inside the loop), so a stale timestamp can't masquerade as
   "never ran."

### B. Observable — *server-fn + UI lane (Claude), no migration*
4. **Return structured per-step counts on every call** (the fn already returns
   `{fetched, created, relinked, autoLinked, updated, linkedNow, stillUnlinked}`,
   `clover.functions.ts:284-292`) and **render them**, not just a one-line toast. Add `done`/
   `remaining` and show "Created X / linked Y / remaining Z" so partial progress is visible.
5. **Surface partial/terminated runs.** Because a Worker time-kill won't throw a catchable error,
   detect non-completion client-side (loop didn't reach `done`) and show a persistent
   `toast.warning("Imported N of M — click Import again to continue")`. Pairs with the
   client-driven loop in A2 so "the admin sees nothing" can't recur.

### C. Guaranteed-visible once created — *frontend lane (Claude), no migration*
6. **Invalidate the inventory cache after import.** `runImport` currently invalidates only
   `["clover-overview"]` (`settings.clover.tsx:78`). Also
   `qc.invalidateQueries({ queryKey: ["inventory"] })` so a newly-populated Stock page reflects the
   import without a manual refresh. (Reuse key from `inventory.index.tsx:96, 112`.)
7. **Make the 1258 actually browsable.** Either add simple pagination / "load more" to
   `inventory.index.tsx` (lift the hard `.limit(500)`, `:102`) or add a quick "Source: Clover"
   filter (`attrs->>source = 'clover'`) so an admin can confirm the import landed. Smallest viable:
   raise the cap + add a visible "showing first N" note. Frontend only.

### Flagged for Lovable (DB lane — spec, do NOT implement here)
- **(Optional, perf) Skip the heavy activity-log on bulk Clover creates.** The
  `log_inventory_activity` AFTER-INSERT trigger writing one `inventory_activity_logs` row + full
  `to_jsonb(NEW)` per item (`…15d2…sql:343-399`) is the main in-DB cost of a 1258-row import. A
  migration could make the trigger skip rows where `attrs->>'source' = 'clover'` on INSERT, or batch
  the log. **This reduces but does not remove the need for A** (chunking is the real fix). Spec it
  only if chunking alone still grazes the time budget.
- **(Optional, observability) Add `clover_connection.import_cursor`/`import_state`** if we want
  server-side resume state instead of client-driven looping. Not required for the KISS path above
  (A uses the existing `last_import_at` + client loop).

---

## What we need from the owner to confirm

1. **The exact text shown when the import "finishes" on prod.** Did a red error toast appear
   (`"Import failed: …"`), a green success toast with counts, or **nothing at all / a spinner that
   never resolved**? "Nothing/never resolved" confirms a Worker time-kill (root cause #1/#2); a red
   toast gives us the real DB/Clover error string.
2. **Is the deployed build current?** Confirm prod is running commit `5815fcb` (the bulk rewrite),
   not the earlier per-row version (`f0ca3dc`/`#32`) — Lovable publishes to `main`; verify the live
   deploy matches. If prod predates the bulk fix, that alone explains the timeout.
3. **Does `/inventory` show *any* Clover items right now?** (Search a known Clover product name.)
   - Some show but settings says "0 linked" → root cause #3 (created-but-unlinked orphans);
     re-running the hardened import will re-link them.
   - None show at all → the run is dying before/at the first insert batch (pure #1).
4. **Worker plan / limits.** Is this on Cloudflare Workers Free or Paid? (Affects the CPU-time
   ceiling and how aggressive the per-call `maxCreates` cap must be.)
5. **Approx. how long the import button spins before it gives up** (~30s strongly implies the
   Worker request cap).
