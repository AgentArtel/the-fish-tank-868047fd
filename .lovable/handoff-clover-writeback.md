# Handoff → Lovable: OUTBOUND write-back to Clover (app → POS)

> Realizes the parked "Phase 2" decision (`handoff-clover-phase1.md`): **workspace = source of truth;
> app edits push to Clover; workspace wins on conflict.** Today the integration is 100% read-only
> (`_shared/clover.ts` has only `cloverGet`). This adds a one-way *push* so app-created items + price
> changes reach the register. Built as an **outbox/queue** (Engineering Rule 7: third-party I/O lives in
> an edge fn, never an app server fn).

## ⛔ HARD PREREQUISITE — a write-scoped Clover token (owner action)
The token in `clover_credentials` has only ever been used for **reads** (the audit confirmed read-only
behavior). Pushing needs a token with **`INVENTORY_W`** (write) scope. **Nothing can be tested until the
owner obtains/swaps in a write-scoped token** (ideally test against a Clover **sandbox** merchant first).
The queue can be built meanwhile, but the drain will 401 until the token is upgraded.

## Recommended scope: **Scope 1 — new items + price** (defer stock)
Push app-created items (`create_item`) and price/name changes (`update_item`). **No stock push** — Clover's
inventory tracking is installed but unused (all `itemStock.quantity` = 0), so pushing counts is meaningless
until tracking is turned on, and it would collide with the inbound sales-decrement loop. Stock = a later
Scope 3 decision.

## Architecture — outbox/queue

### 1. `clover_push_queue` table (Lovable migration)
| col | type | purpose |
|---|---|---|
| `id` | uuid pk | |
| `inventory_item_id` | uuid → inventory_items ON DELETE CASCADE | target |
| `op` | text CHECK (`create_item`,`update_item`) | (`set_stock` reserved for Scope 3) |
| `payload` | jsonb | snapshot: name, price_cents, price_type, code, category_name |
| `content_hash` | text | dirty-detection / skip-if-unchanged |
| `status` | text CHECK (`pending`,`in_progress`,`done`,`failed`) default `pending` | |
| `attempts` | int default 0 · `last_error` text | retry |
| `origin` | text default `app` | **loop guard: only app-authored rows ever exist** |
| `created_by` uuid · `created_at`/`updated_at` timestamptz | |

Indexes: `(status, created_at)`; partial unique `(inventory_item_id, op) WHERE status IN ('pending','in_progress')`
to coalesce rapid edits (latest payload wins). RLS: editor insert, admin/service update (mirror
`inventory_sale_events`). Add `last_pushed_hash` + `last_pushed_at` to `clover_item_links`.

### 2. `cloverWrite` helper (Lovable, in `_shared/clover.ts`)
Mirror `cloverGet` (same baseUrl + 429 backoff), but `method:"POST"`, `Content-Type: application/json`,
`body: JSON.stringify(...)`. Money in **cents**. Covers both create + update (Clover uses POST for both).

### 3. `clover-push` edge function (Lovable) — the drain
Mirror `clover-sync-sales` structure (`requireAdminCaller` → accepts service-role cron *and* an admin
"Push now"). Loop:
1. Status-flip-as-lock: `UPDATE … SET status='in_progress' … WHERE status='pending' RETURNING` (small batch),
   same pattern as `resolveReviewSaleEvent`.
2. Skip-if-unchanged: if `content_hash == clover_item_links.last_pushed_hash` → mark `done`, no API call.
3. `create_item` (no `clover_item_id`): `cloverWrite('POST','/items',{name,price,priceType,code})` → take
   returned `id`, upsert `clover_item_links` (`clover_item_id`,`inventory_item_id`,`link_status='linked'`),
   mirror into `inventory_items.attrs.clover_item_id`. Then optional category assignment
   (`GET /categories` to resolve name→id, then `POST /category_items`). **Create-guard inside the lock**
   (only when no link) so a double-enqueue can't double-create.
4. `update_item` (link exists): `cloverWrite('POST','/items/{cloverId}',{name,price,priceType})`.
5. Success → `done` + write `last_pushed_hash`/`last_pushed_at`. Failure → `attempts++`, back to `pending`
   until cap (5) → `failed`.

Invoke via `pg_cron` every ~3 min (same Vault/service-key pattern as the sales cron) + an admin
"Push now" button.

### 4. Enqueue points (Claude, app server fns — after Lovable's table exists)
Explicit enqueue from the **gate-passing** fns (NOT a DB trigger — a trigger also fires on the sales-sync
writes and couldn't tell app- from Clover-authored changes → echo loop). Chokepoint = the **go-live /
price-approve transition**:
- `reviewInventoryItem` (`ops.functions.ts`) — on price-approve / take-live: enqueue `update_item` (or
  `create_item` if the item has no Clover link).
- `recordItemCount` (`count.functions.ts`) — on count-&-publish: same.
- `recordTradeIn` / `createInventoryFromCloverLink` — **do NOT enqueue** (drafts aren't sellable yet;
  reconcile-created items already exist in Clover). They reach Clover only once taken live.

## Loop-avoidance (critical)
- The inbound `clover-sync-sales` decrements stock from Clover sales and **must never enqueue**.
- Only **app-authored, gate-passed catalog/price** changes push out. Realized sales/stock stay
  Clover-authored and are never pushed back. (Matches the locked "workspace wins for catalog/pricing,
  Clover wins for realized sales" rule.)

## Sequence to ship
1. **Owner:** obtain a write-scoped Clover token (sandbox first). ← blocker
2. **Lovable:** `clover_push_queue` migration + `cloverWrite` + `clover-push` edge fn + cron.
3. **Claude:** enqueue calls in the go-live fns + a "push failures" surface in Settings → Clover.
4. **Lovable:** integration-test against sandbox (create + price update land in Clover; unchanged skipped;
   sale doesn't echo back out).

## Open decisions for the owner
1. **Write-scoped token** — obtain/confirm (hard blocker). Sandbox merchant for testing?
2. **Scope 1 vs 2 vs 3** — recommend 1 (new items + price). Stock (3) deferred until tracking is enabled.
3. **VARIABLE livestock** — push `priceType=VARIABLE, price=0` (rung at register), don't force a fixed price?
4. **Category on create** — assign the Clover category, or leave uncategorized?
5. **Trade-in items** — keep out of the push until taken live (recommended)?
6. **Drain cadence** — ~3 min cron + "Push now"? Retry cap 5 before `failed`?
