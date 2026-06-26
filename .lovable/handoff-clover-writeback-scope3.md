# Handoff → Lovable: Scope 3 — stock mirror (app → Clover `item_stocks`)

> **Additive on Scope 1.** Activates the `set_stock` op already reserved in the Scope 1 queue
> (`handoff-clover-writeback.md`). Token check is green for stock-write on live. This spec is about doing
> it **safely** — the crux is loop-avoidance with the inbound sales sync. **Do not start until (a) Scope 1
> is shipped and (b) the §1 tracking-enablement unknown is verified on the live merchant.**

## ⛔ Gating unknown — verify FIRST (on a real *existing* imported item, not a fresh one)
The token probe set stock on a **freshly-created** item. Existing imports have tracking off (all
`itemStock.quantity` = 0). **Does `POST /v3/merchants/{mId}/item_stocks/{itemId}` accept a quantity on an
item that was never tracked?**
- **(A) works (enable-on-write):** no extra step; first push lights up tracking.
- **(B) 400/404 until enabled:** a one-time per-item **enable** call is needed first — confirm the exact
  Clover field/call to turn on stock tracking for an existing item.

The drain handles both with an **enable-if-needed** branch (try `item_stocks`; on a
tracking-not-enabled error, do the enable call, retry once). But **Lovable must confirm A vs B (and the
enable call for B) before we finalize.** Also confirm **A2: `item_stocks.quantity` is absolute-set, not a
delta** (the whole design assumes absolute), and **A3:** the "tracking off" error (400/404) is
distinguishable from "no scope" (403).

## 1. Loop-avoidance (the whole point) — airtight, by construction
The inbound sales path writes the **same column** Scope 3 pushes: `clover-sync-sales` →
`apply_inventory_sale` → `decrement_inventory_stock` lowers `inventory_items.quantity_available`. If any
write to that column enqueued a `set_stock`, a Clover sale would bounce back out → feedback loop.

**Rule: `set_stock` is enqueued ONLY by explicit app-authored stock writers, as a line of code at the
call site. The inbound sales RPC has no enqueue line, so a Clover-sale decrement physically cannot create
a queue row.** Not a DB trigger — a trigger fires for *both* writer classes and can't tell a human count
from a Clover-sale decrement.

**The only enqueuing (app-authored) stock writers:**
- `recordItemCount` (`count.functions.ts`) — count deck
- `adjustInventoryQuantities` (`ops.functions.ts`) — manual adjust (only when `quantity_available` set)
- `receiveBatchLines` (`ops.functions.ts`) — intake/receive
- `reviewInventoryItem` (`ops.functions.ts`) — when `quantityAvailable` set

**Interleave case, resolved:** app sets 10 → push (Clover=10) → Clover sale → Clover=9 → sync decrements
app to 9. The app does **not** push 9 back, because the writer that lowered it to 9 was the sales RPC
(no enqueue line). Both sides sit at 9, converged, zero outbound traffic. The next *human* recount is the
only thing that pushes again — exactly the "app count = physical-on-hand source of truth" semantic. (A
near-simultaneous recount + sale: the authoritative physical recount briefly overwrites an un-synced
decrement on Clover; the sale still flows in via sync; self-heals. Acceptable — don't over-engineer locks.)

## 2. Per-type policy (mirror only countable, tracked stock)
| item_type | Mirror? | Why |
|---|---|---|
| `dry_good` | **Yes** | Countable, UPC-coded — the natural fit (pilot here). |
| `fish`, `invert` | Yes (conditional) | Countable head-stock; FIXED-priced only. |
| `coral` colony (`attrs.stock_mode='colony'`) | **No** | Stock-untracked by design; `apply_inventory_sale` already skips colony decrements. |
| `coral` frag | Yes (conditional) | Real per-frag counts; if not colony. |
| `live_rock`/`equipment`/`other` | Owner decision | Default exclude. |

**Exclude VARIABLE-priced livestock** (price=0, rung at register) — tracking them invites the register to
block sales at count 0. Enqueue guard: `set_stock` only when `item_type ∈ allowed` AND not `(coral &
colony)` AND `clover_price_type != 'VARIABLE'`.

## 3. Conflict rule (reconciles with the locked "workspace wins catalog/pricing; Clover wins sales")
**App's counted `quantity_available` = source of truth for physical on-hand; pushed to Clover as an
absolute set, overwriting drift. Clover sales = realized decrements that flow IN via sync and are never
pushed back.** Divergence (a sale not yet synced vs an app count) self-heals: the sale syncs within the
10-min window; the next physical recount re-anchors both sides. No bidirectional reconciliation engine.

## 4. Drain + schema additions (on the Scope 1 `clover-push` fn)
- **`set_stock` mapping:** resolve link → `clover_item_id`; `cloverWrite("POST",
  /item_stocks/{cloverId}, { quantity: <app quantity_available> })` (absolute), + enable-if-needed branch.
- **Schema:** add `last_pushed_stock int`, `last_pushed_stock_at timestamptz`, `tracking_enabled bool` to
  `clover_item_links`.
- **Idempotency:** skip the push if queued qty == `last_pushed_stock` (mark `done`, no API call). With the
  Scope 1 `(inventory_item_id, op)` pending-coalesce, rapid recounts collapse to one push of the latest.
- **Ordering:** `clover-push` and `clover-sync-sales` stay on independent crons; they never both enqueue,
  so no hard ordering. Keep the status-flip-as-lock drain.

## 5. Open owner decisions
1. **Type scope** — dry-good-only pilot first, then expand? (Recommended.)
2. **VARIABLE livestock** — confirm exclude (recommended).
3. **Tracking-on-zero** — OK for tracked items to be unsellable at the register at count 0?
4. **One-time backfill** — after enabling, bulk-push current app counts for all in-scope items once, or
   only mirror changes from now on? (Recommend opt-in bulk backfill per type.)
5. **Pilot** — enable on a few dry goods, watch one sales-sync cycle, then roll out.

## Sequence
1. Ship Scope 1 (queue + drain + new-items/price).
2. **Lovable verifies §0 (A vs B, absolute-vs-delta, error codes) on a real existing item** — paste findings.
3. Lovable: schema additions + `set_stock` path in the drain. Claude: the 4 enqueue call-sites (guarded by
   the §2 policy, `origin='app'`) + a type-scope toggle/backfill surface.
4. Pilot on dry goods → watch one cycle → expand per the owner decisions.
