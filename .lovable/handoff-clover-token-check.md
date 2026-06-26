# Handoff → Lovable: Clover token-capability check (`clover-token-check`)

> **The first, gating step of write-back.** The token has only ever been used for reads; before building
> the outbox/queue we must *prove* it has `INVENTORY_W`. This is a self-cleaning probe + a capability
> report. If create/update come back denied → STOP and fix the token before building anything else.

## `cloverWrite` helper (Lovable, in `_shared/clover.ts`)
Mirror `cloverGet` (same baseUrl + `Bearer` + 429 backoff). Two forms:
- `cloverWrite(creds, method, path, body)` — throws on non-2xx (for the real push fn later).
- **`cloverWriteRaw(creds, method, path, body)` — returns `{ ok, status, body }`, does NOT throw on 4xx.**
  The token-check uses this so a 401/403 is recorded per-probe instead of aborting the run. `POST` sends
  `Content-Type: application/json` + `JSON.stringify(body)`; `DELETE` needs no body.

## `clover-token-check` edge function (Lovable)
New `supabase/functions/clover-token-check/index.ts`, same preamble as `clover-sync-sales`
(`Deno.serve`, CORS, POST-only, `requireAdminCaller` admin-only, `requireCloverCreds`). **Never throws on
the first failure** — each probe's HTTP status is captured. Returns:
```jsonc
{ "ok": true, "merchantId": "…", "ranAt": "ISO", "mode": "live|sandbox",
  "canRead": true, "canCreateItem": true, "canUpdateItem": true,
  "canSetStock": false, "canDelete": true,
  "cleanedUp": true, "leakedItemId": null, "permissionsEndpointUsed": false,
  "details": { "read": {"status":200}, "create": {"status":200,"itemId":"ABC"}, "update": {"status":200},
               "setStock": {"status":403}, "delete": {"status":200} },
  "errors": [ { "probe": "setStock", "status": 403, "message": "…200 chars…" } ] }
```
`canX`: `2xx → true`, `401/403 → false` (missing scope), other non-2xx → false + surfaced in `errors`
(so a transient 500/429 is distinguishable from a real denial). If create fails, mark update/stock/delete
`skipped` (not `false` — untested).

### Probe sequence (self-cleaning, runs in order)
1. **Read** — `GET /v3/merchants/{mId}/items?limit=1`.
2. **Create** — `POST /v3/merchants/{mId}/items` →
   `{ "name": "__ZZ_TOKEN_CHECK__ <ISO>", "price": 1, "priceType": "FIXED", "hidden": true }`. Capture `id`.
3. **Update** — `POST /v3/merchants/{mId}/items/{id}` → `{ "price": 2 }`.
4. **Set stock** (Scope-3 readiness, optional) — `POST /v3/merchants/{mId}/item_stocks/{id}` →
   `{ "quantity": 1 }`. Distinguish 403 (no scope) vs 400/404 (tracking off) in `details.setStock`.
5. **Cleanup** — `DELETE /v3/merchants/{mId}/items/{id}` in a `finally`. If delete is denied, keep
   `hidden:true` so it stays invisible and report `leakedItemId` for manual removal.

### Leak safety (probe item escaping to register)
- `hidden:true` on create is the primary guard (the import already skips `e.hidden`).
- The item lives **only in Clover** — it's never inserted into `inventory_items`, so it can't reach the
  app's website (`v_public_inventory`). The only surface is the Clover register, covered by `hidden`.
- Always attempt cleanup in `finally`; report `leakedItemId` loudly if it fails.

### Prefer a permissions endpoint if one exists (avoid creating a test item)
This merchant uses a **simple API token (not OAuth)**, so a clean scope-introspection endpoint may not be
available. **Try** a granted-scopes read first; if it yields scopes, report from that with
`permissionsEndpointUsed=true` and **skip the create/delete probe entirely**. The create/delete probe is
the dependable fallback.

## App side (Claude)
A **"Check token capabilities"** button in Settings → Clover (`invoke("clover-token-check")`), rendering a
per-capability check/X/skipped list, a verdict line ("write-capable — safe to build push" vs "cannot
create/update — fix scopes first"), and a loud warning card if `leakedItemId` is set. Pure invoke + render
(Rule 7 clean). I'll build this against the shape above.

## Sequence / gate
1. Lovable: `cloverWrite`/`cloverWriteRaw` + `clover-token-check`, deploy, run it (sandbox if available,
   else one guarded live run), paste the report.
2. **Gate:** `canCreateItem && canUpdateItem === true` → proceed to the queue build
   (`handoff-clover-writeback.md` Scope 1). Either false → fix the token, re-run, do **not** build the queue.
   `canSetStock` just informs whether Scope 3 is even possible.

## Confirm against the live merchant (Lovable)
1. Delete verb/path (`DELETE /items/{id}` vs soft-delete via `hidden:true`) + whether delete needs a
   separate scope.
2. `hidden:true` on create is honored and excludes the item from the **register** (not just website).
3. Whether a granted-scopes/permissions endpoint is reachable for this API-token app (and the `appId`).
4. `item_stocks` 403 (no scope) vs 400/404 (tracking off).
5. Does the owner have **sandbox** creds to run the create/delete probe against before touching live?
