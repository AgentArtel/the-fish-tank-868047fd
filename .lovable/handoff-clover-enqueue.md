# Plan: Clover write-back enqueue (#6) — [App=Claude]

> The outbound push is fully built on Lovable's side (`clover_push_queue`, the `clover-push` drain edge
> fn, `cloverWriteRaw`, the cron). **The only missing piece is the app-side enqueue** — nothing inserts a
> `pending` row, so the drain always claims 0. This is that piece. **No further DB work** (types already
> carry `clover_push_queue` + `clover_item_links.last_pushed_hash/at`; RLS allows editor INSERT).

## ⚠️ One thing for Lovable to confirm (only possible blocker)
The drain's coalesce key is the **partial** unique `(inventory_item_id, op) WHERE status IN
('pending','in_progress')`. A PostgREST `upsert(onConflict:'inventory_item_id,op')` can only target that
index if a matching `WHERE` predicate is emitted — which PostgREST doesn't do. **Confirm one of:** (a) the
index is actually a *full* unique on `(inventory_item_id, op)`, or (b) there's also a plain unique
constraint. If neither, I'll do a manual "update existing pending row else insert" two-step instead.
Everything else is unblocked.

## The exact payload contract (do not drift — the drain reads these keys)
`clover-push/index.ts` maps `payload.{name, price_cents, price_type, code}` → Clover `{name, price,
priceType, code}`. Enqueue payload MUST be exactly `{ name, price_cents, price_type, code }`.

## `enqueueCloverPush(db, inventoryItemId, userId)` — new `src/lib/clover-push.functions.ts`
A plain internal async helper (not a server fn), called from inside the go-live handlers. **Best-effort —
wrapped in try/catch, never throws into the caller** (a push-enqueue failure must never break go-live).
1. Load item (`item_name, retail_price, item_type, availability_status, pricing_status, attrs`); bail if missing.
2. **Sellable gate (defense in depth):** only proceed if `availability_status='available' AND
   pricing_status='approved' AND retail_price>0`. (Callers also gate; this keeps the helper safe to call.)
3. Load `clover_item_links` (`clover_item_id, clover_code, clover_price_type`). `op = clover_item_id ?
   'update_item' : 'create_item'`; `code = clover_code ?? null`.
4. **price_type:** `attrs.clover_price_type` → `link.clover_price_type` → infer from `item_type`
   (`fish/coral/invert/live_rock → VARIABLE`, else `FIXED`).
5. **price_cents:** `VARIABLE → 0` (rung at register), else `round(retail_price*100)`.
6. payload `{ name, price_cents, price_type, code }`; **content_hash = sha256** of a canonical
   fixed-key string (`node:crypto`; server fns run in Node).
7. Upsert `{ inventory_item_id, op, payload, content_hash, status:'pending', attempts:0, last_error:null,
   origin:'app', created_by:userId }` on conflict `(inventory_item_id, op)` (latest payload wins, status
   reset to pending). The **drain owns linking** on create_item — the app never writes clover_item_id.

## Call sites (enqueue AFTER the successful go-live UPDATE)
- **`reviewInventoryItem`** (`ops.functions.ts`) — admin price-approve + take-live. Call when
  `takeLive` or a price was set; helper re-checks sellable. Also covers a **reprice of an already-live
  item** (Scope 1's "price" half).
- **`recordItemCount`** (`count.functions.ts`) — gated on `take_live`.
- **Recommend ALSO: `quickAddInventoryItem`** (`ops.functions.ts`) — it genuinely goes live
  (`set_available` + approved price) and is a real third go-live chokepoint; without it floor-staff Quick
  Adds never reach Clover. And optionally `approveInventoryPricing` (helper no-ops if not yet live).
- **Confirmed non-enqueuers** (drafts/not-live): `catalogCoralItem`, `cutFragsFromColony`, `recordTradeIn`,
  `createInventoryFromCloverLink`. Frags reach Clover only when later taken live.

## Price-type recommendation
Dry goods/equipment → `FIXED` with the approved price + UPC `code` (the register-price-correctness win).
Livestock → `VARIABLE, price_cents=0` (push it so it's present/named in Clover; never force a wrong fixed
price). Inference only fires for brand-new app items with no link.

## Loop-avoidance (confirmed)
The inbound `clover-sync-sales` + `resolveReviewSaleEvent` never call this helper; only the explicit
go-live fns do, always `origin='app'`. The sellable-gate means even an accidental call no-ops. Realized
sales stay Clover-authored, never pushed back.

## Optional push-status surface
Extend `getCloverOverview` with pending/in-progress/failed counts (reuse its `countRows` pattern), and add
a "N pending push / N failed" badge + a "Push now" button (mirror `runSyncSales`) in Settings → Clover.

## Open decisions
1. **Index conflict-target shape** (above) — the one Lovable confirm.
2. Include **Quick Add** (recommend yes) + `approveInventoryPricing` (recommend yes) as enqueue points?
3. `item_type → price_type` default table OK?
4. Still gated on the **write-scoped Clover token** before the drain *succeeds* — but the enqueue lane can
   be built and verified now (rows land `pending`) independent of the token.
