# Scope + Handoff → Lovable: Store credit (customer dollar-balance)

> **Owner decision (2026-06-21): yes, we want store credit.** It underpins the trade-in (wizard 11)
> and return/refund (wizard 12) flows in `.lovable/brainstorm-employee-wizards.md`, both of which
> dead-end today because there's nowhere to *put* the value we give a customer.
>
> Sequencing: this folds in **after** the mortality wizard (Phase 0 app-side: `record_inventory_loss`,
> shipped on `claude/phase0-app-guards-mortality`). It's the next employee-wizard foundation.

## 0. The core distinction — store credit is NOT loyalty

We already have **Reef Credit** (the `loyalty_ledger` + `customer_loyalty_summary` RPC + atomic
`loyalty_redeem` RPC). Store credit is a **different financial object** and must be a **separate
ledger** — do not overload `loyalty_ledger`:

| | **Reef Credit (loyalty)** | **Store credit (this scope)** |
|---|---|---|
| What it is | Earned marketing **reward** (a % of spend) | Real **money we owe** the customer |
| Where it comes from | System-earned on sales | Trade-ins, returns/refunds, goodwill |
| Accounting | Promotional liability | Cash-equivalent liability (tax-relevant) |
| Expiry | May expire (promotional) | Generally **must not** expire (often regulated) |
| Conflating them | — | Would corrupt both the rewards math and the books |

**Reuse the proven _mechanics_, not the table.** The loyalty ledger already nailed the hard parts
(balance = `SUM` via a DB-side RPC, atomic redeem under a row lock to prevent overdraw). Store credit
mirrors that shape in its own table. This is "reuse and restyle what exists" (Engineering Rules 1 & 6),
not "stuff a second concept into one table."

## 1. Data model `[DB=Lovable]`

**New table `store_credit_ledger`** (mirrors `loyalty_ledger`'s ledger-sum design):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `customer_id` | uuid → `customers(id)` | indexed |
| `kind` | text/enum | `grant · redeem · adjust · refund_reversal` |
| `amount_cents` | int | **always positive**; sign is implied by `kind` (matches loyalty: grants/refunds add, redeem subtracts). A `CHECK (amount_cents > 0)` keeps every row unambiguous. |
| `source` | text/enum | `trade_in · return · refund · manual · goodwill` — provenance for the books |
| `related_ref` | uuid/text null | the trade-in draft, return event, or `inventory_sale_events.id` that produced/consumed it (audit trail) |
| `reason` | text null | free-text note (capped) |
| `created_by` | uuid | the staff member |
| `created_at` | timestamptz default now() | |

Balance is **never stored** — it's `SUM(grants+refunds) − SUM(redeems)` from the rows, same as loyalty.

## 2. RPCs `[DB=Lovable]` — narrow write model

Floor staff never write `store_credit_ledger` directly (RLS denies it). All writes go through
`SECURITY DEFINER` RPCs that self-check `is_floor_staff_or_above(auth.uid())` — exactly the pattern
`record_inventory_loss` established. Three RPCs:

1. **`store_credit_summary(_customer_id uuid)`** → `{ balance_cents }` (+ optionally lifetime granted/
   redeemed for display). DB-side aggregate, no JS sum, no row cap. Mirror of `customer_loyalty_summary`.
   Granted to `authenticated`; gated by `is_floor_staff_or_above`.

2. **`grant_store_credit(_customer_id uuid, _amount_cents int, _source text, _reason text DEFAULT NULL, _related_ref uuid DEFAULT NULL)`**
   — inserts one positive `kind='grant'` (or `refund_reversal` when `_source='refund'/'return'`) row.
   Checks `is_floor_staff_or_above`. Used by the **trade-in** and **return** wizards.

3. **`redeem_store_credit(_customer_id uuid, _amount_cents int, _reason text DEFAULT NULL, _related_ref uuid DEFAULT NULL)`**
   — **atomic**: locks the customer row, re-reads the balance, **rejects overdraw in-transaction**
   (no read-then-write race), inserts `kind='redeem'`. Direct copy of `loyalty_redeem`'s shape.
   Used at checkout / manual sale to apply credit toward a purchase.

`adjust` (corrections / write-offs) stays **admin/dev-only** — either a separate admin RPC or an RLS
policy allowing `is_admin_or_dev` to insert `kind='adjust'`. Floor staff grant and redeem (their job at
the counter); only admin/dev can hand-correct the ledger.

## 3. Clover relationship — store credit is a **workspace** concept, NOT synced to Clover

Per the two-way-sync principle (`.lovable/scope-clover-sync.md`): **Clover is the POS-transaction
master; the workspace is the consolidated/derived master.** Store credit is a **liability we track in
the workspace** — it is **not** pushed into Clover as an item, and Clover is not its source of truth.

- **Redemption at checkout** reduces what's tendered through Clover, but the credit *ledger* lives here.
  The Clover sale still records the net cash/card; the matching `redeem_store_credit` row records the
  credit portion in the workspace. Treat the checkout reconciliation (Clover tender ↔ workspace
  redemption) as a **known integration seam**, not a sync — flag it when the two-way sync lands; don't
  build a Clover write for it now.
- This keeps store credit decoupled and data-driven: the wizard invokes the RPC, the UI reacts to the
  ledger the RPC writes. No app-side external I/O (Engineering Rule 7 holds — there's no third-party
  call here at all; it's pure auth-gated DB).

## 4. App side (Claude's lane, after the RPCs land)

- **`store-credit.functions.ts`** (or fold into `loyalty.functions.ts`): thin server fns wrapping the
  three RPCs, gated with `requireFloorStaff` (grant/redeem/summary) and `requireAdmin` (adjust),
  mirroring `recordLoyaltyEntry`.
- **Customer card**: a **Store Credit** panel on `customers.$id.tsx`, rendered next to `<ReefClubCard />`
  — balance + recent ledger activity + a "Give credit" / "Redeem" action (floor-staff-gated via `useMe`).
  Restyle the existing `reef-club-card.tsx`; don't invent new UI.
- **Wire into the wizards** (built later, separately):
  - **Trade-in intake (wizard 11)** → on completion, `grant_store_credit(source='trade_in', related_ref=<draft>)`.
  - **Return/refund (wizard 12)** → "refund to store credit" branch calls
    `grant_store_credit(source='return'/'refund', related_ref=<sale event>)`.
  - **Manual sale / checkout** → optional "apply store credit" calls `redeem_store_credit`.

## 5. Open decisions (owner) — confirm, not blockers for the table/RPCs

1. **Expiry** — recommend **no expiry** (store credit is owed money and is often legally barred from
   expiring, unlike loyalty points). Default: never expires. Confirm.
2. **Grant cap / approval threshold** — should large floor-staff grants (e.g. a big coral trade-in)
   require admin sign-off above a $ threshold, or is the trade-in wizard's appraisal step enough?
   Recommend: no hard cap initially; the ledger's `created_by` + `source` give a full audit trail, and
   `adjust` is admin-only for corrections.
3. **Redeem both at once?** At checkout, can a customer spend store credit **and** Reef Credit on one
   order? Recommend yes — they're separate ledgers, applied independently; the UI sums both for display
   but writes one row to each.

## 6. Reply with

Confirm `store_credit_ledger` + the `store_credit_summary` / `grant_store_credit` / `redeem_store_credit`
RPCs (gated by `is_floor_staff_or_above`, `adjust` reserved for `is_admin_or_dev`) are in, plus the
expiry decision (default: none). Then I'll add the server-fn wrappers + the Store Credit card and wire
it into the trade-in / return wizards as those get built.
