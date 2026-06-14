# Scope — Reef Club: closing the attribution gap

## The problem
Reef Credit earns only when a Clover sale is **linked to a customer** (`inventory_sale_events.customer_id`).
But most walk-in POS orders are anonymous — Clover carries no customer — so in practice very few sales
would ever earn. The program is correct but starves for input. Fixing attribution is the difference
between a loyalty program that technically works and one that actually accrues credit.

We do **not** control the Clover register, so we can't reliably capture the buyer at the point of sale.
The realistic lever is **post-hoc attribution**: let staff attach the member who made a recent
anonymous purchase, and retro-earn the credit they'd have gotten.

## Design (v1, shipped — app lane, no migration)
- **`listUnattributedSales`** (editor) — recent `kind='sale'` events with `customer_id IS NULL`, bounded
  by a time window (default 60d) + row cap (≤200), grouped into orders for display.
- **`attachSaleToCustomer`** (editor) — stamps `customer_id` onto the chosen sale events (only those
  still unattributed, so a sale is never stolen from another member) and **retro-earns** Reef Credit for
  each via the shared idempotent `recordSaleEarn` helper. Also marks `reef_club_enrolled_at`.
- **UI** — an "Attach a past purchase" panel on the existing `/customers/$id` Reef Club card (no new
  route/nav). Staff tick the customer's recent anonymous purchases → credit lands immediately.

## Why this shape
- **One earn path.** `recordSaleEarn` (loyalty.server.ts) is now the single source of truth for earning,
  used by the live sync (`applyInventorySale`) AND attribution. It routes through the unit-tested
  `computeEarnCents`, and is idempotent via the ledger's `UNIQUE(sale_event_id, kind)`.
- **Doubles as recovery.** The same mechanism re-credits any `applied` sale that's missing its `earn`
  row — so a missed live earn (e.g. a transient failure) is recoverable, not lost. Accordingly the live
  earn in `applyInventorySale` is now **best-effort**: a loyalty failure can never break the
  sale-of-record or stock decrement.

## Known follow-ups (see handoff-loyalty-hardening.md — DB lane)
- Commit the loyalty tables as a versioned migration (currently applied out-of-band).
- DB-level ledger integrity: sign/kind CHECK, admin/service-role-only INSERT RLS, atomic redemption
  (RPC) to close the read-then-write over-redemption race.
- DB-side balance/rolling-spend aggregation (RPC or denormalized totals) so per-customer reads don't
  sum the ledger in app code at scale.

## Parked (needs sign-off)
- A **global** "unattributed sales" queue (its own nav item) for bulk attribution, vs. the current
  per-customer-initiated flow. Deferred to respect the no-new-nav rule.
