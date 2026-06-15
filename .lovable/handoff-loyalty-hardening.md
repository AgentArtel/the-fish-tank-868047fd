# Handoff → Lovable: Reef Club DB hardening (migration lane)

A 5-agent production-readiness audit ran over the loyalty work. Claude fixed all the **app-lane**
issues (full-ledger balance, 12-month tier window, best-effort earn, config upsert, one idempotent earn
path). The items below are **DB lane = Lovable** — versioned migrations in `supabase/migrations/`.

## 1. Commit the loyalty tables as a migration (BLOCKER — invariant 5)
`loyalty_config`, `loyalty_ledger`, and `customers.reef_club_enrolled_at` were applied out-of-band from
`handoff-loyalty-migration.md` but there is **no file in `supabase/migrations/`**. A fresh env / CI / DB
rebuild would be missing them and the app would throw on every sale sync and every Reef Club card.
**Action:** commit the applied SQL as `supabase/migrations/<ts>_loyalty.sql` and confirm the live DB
matches it (especially the `UNIQUE (sale_event_id, kind)` the earn idempotency depends on, and the
`loyalty_ledger (customer_id, created_at DESC)` index).

## 2. Ledger integrity at the DB (the app guards aren't enough)
- **Over-redemption race (TOCTOU):** `recordLoyaltyEntry` reads the balance, checks, then inserts — two
  concurrent redemptions can both pass and drive the balance negative. Fix with a `SECURITY DEFINER` RPC
  `loyalty_redeem(customer_id, amount_cents, channel, reason)` that re-checks the balance in-transaction
  (lock the customer's rows / `SELECT … FOR UPDATE` on a running total) and rejects overdraw atomically.
  The app would call this RPC instead of the raw insert for redemptions.
- **RLS weaker than intent:** `loyalty_ledger` INSERT is granted to `can_edit_content` (any editor), but
  the discretionary actions (`bonus`/`redeem`/`doa`/`adjust`) are meant to be **admin-only**. An editor
  could insert arbitrary rows directly, bypassing `requireAdmin` + the overdraw check. Tighten: only
  `service_role` (system earn) and admins may INSERT discretionary kinds. Note: the new **attribution**
  earn (`kind='earn'`) is editor-initiated and legitimate, so scope the policy by `kind` (editors may
  write `earn`; only admins may write bonus/redeem/doa/adjust).
- **Sign/kind CHECK:** add a constraint tying sign to kind (`redeem`/`expire` ≤ 0; `earn`/`bonus`/`doa`
  ≥ 0; `adjust` either) so a bad direct insert can't store a positive redemption.

## 3. DB-side aggregation for balance + spend (scalability)
App code currently sums a customer's ledger and rolling-12-mo sales in JS (correct now, but per-customer
unbounded reads). Provide either:
- an RPC `customer_loyalty_summary(customer_id)` returning `balance_cents`, `annual_spend_cents`; or
- denormalized running totals on `customers` (`reef_credit_cents`, `rolling_year_spend_cents`) maintained
  by trigger. The app would swap `customerBalanceCents` / the spend loop for the DB value.

## 4. Report/query indexes (from the scalability audit — broader than loyalty, but related)
- `CREATE INDEX ON inventory_sale_events (sold_at DESC) WHERE kind='sale';` — reports + the new
  `listUnattributedSales` filter on `sold_at`; today these can seq-scan.
- The customers list (`listCustomers`) sums ALL sale events (`.limit(50000)`) in JS to get lifetime
  spend — silently wrong past 50k rows. Best paired with the denormalized totals in #3.

## Not loyalty, but flagged by the audit (separate handoffs as you prioritize)
- Clover **cron poll is never scheduled** — add a `cron.schedule('clover-poll', …)` migration (mirrors
  vendor-watch-refresh); without it there's no automated sales ingest.
- Clover ingest dedupe keys on `clover_line_item_id` alone but the UNIQUE is `(order_id, line_item_id)`
  — app-lane fix Claude can make; can drop real sales if Clover reuses line ids across orders.
