# Scope — Sales Analytics / "What's selling" dashboard

> **Status:** SCOPING / DESIGN ONLY. No app code changed, no schema applied, no PR. Claude Code,
> 2026-06-14.
> **Read-first:** `VISION.md` (Roadmap phase 3 = Sales/POS), `REALITY_MAP.md` (Dashboard =
> "Technically working", Clover sync = parked-but-now-imported), `CLAUDE.md` invariants.
> **Reuse anchors:** `src/components/coral-sales-report.tsx` (the existing rollup card pattern),
> `getCoralSalesByType` in `src/lib/ops.functions.ts:2316`, `src/lib/coral-type.ts` (classifier),
> `fmtMoney`/`suggestRetail` in `src/lib/ops.ts`, `src/routes/_app/dashboard.tsx` (host surface).
> **DB lane:** everything here reads existing tables. **No new tables/columns are required for v1.**
> Any later rung that needs schema is flagged and is **Lovable's lane** (versioned migration).

---

## 1. Problem & opportunity

The shop just imported its full Clover catalog into `inventory_items` and recent sales into the
`inventory_sale_events` ledger (`supabase/migrations/20260613201503_*.sql`). That data is currently
almost invisible: the only sales surface is `CoralSalesReport` (one CSS-bar card, **coral-only**,
rendered at the bottom of the dashboard) plus the per-item `SalesCard`. The owner can't yet answer
basic questions — *what sells, when, what's dead, how much revenue, is this thing worth the rack
space?*

**Opportunity:** turn the raw ledger + catalog into a small, honest analytics surface that helps
the shop decide **what to reorder, what to discount/cull, and where the money comes from**. This
is squarely VISION Roadmap phase 3 ("once inventory is stable… read-sync with Clover so stock and
sales stay aligned") — the read side has landed, so visualizing it is in-scope and additive (it
touches no approval gate and writes nothing).

**Guardrail (CLAUDE.md invariant):** analytics is **read-only/draft-only insight**. It must never
change pricing, availability, or create inventory. It *suggests* ("reorder candidate", "slow
mover"); a human still decides.

---

## 2. What data we already have (columns + caveats)

### `inventory_sale_events` — the sale ledger (migration `20260613201503`)
| Column | Type | Use for analytics |
|---|---|---|
| `inventory_item_id` | uuid (FK, `ON DELETE SET NULL`, **nullable**) | join to catalog for type/name/category. **Often null** (unlinked Clover lines). |
| `qty` | numeric(12,2) | units sold per line |
| `unit_price_cents` | integer (nullable) | per-unit POS price (retail) |
| `total_cents` | integer (nullable) | line revenue — **already cents**, divide by 100 for dollars |
| `sold_at` | timestamptz (indexed w/ item) | time-series x-axis |
| `source` | `'manual' \| 'clover'` | segment manual vs POS |
| `kind` | `'sale' \| 'refund' \| 'void'` | **filter `kind='sale'`** for revenue; refunds/voids are separate |
| `status` | `'applied' \| 'needs_review' \| 'reversed'` | see caveat below |
| `clover_item_name` | text | **the only label available for unlinked rows** |
| `clover_order_id` | text | basket / order grouping (basket analysis later) |

Indexes already exist: `(inventory_item_id, sold_at DESC)` and `(status)` — time-window + status
queries are cheap.

### `inventory_items` — the catalog (migration `20260526235115`, `item_type` added in `20260603202651`)
Relevant columns: `item_name`, `item_type` (`fish|coral|invert|dry_good|live_rock|equipment|other`),
`category`/`subcategory`, `retail_price`, **`wholesale_cost`**, `quantity_available`,
`quantity_sold`, `quantity_received`, `availability_status`, `vendor_id`, `location_id`,
`created_at`, plus `attrs` (`stock_mode` = frag/colony for corals).

### Caveats the dashboard MUST be honest about (surface them in the UI, don't hide them)
1. **Many sales are unlinked / `needs_review`.** Per `clover.ingest.server.ts`, only Clover lines
   whose `clover_item_id` maps via `clover_item_links` get `inventory_item_id` + `status='applied'`;
   **everything unmatched (and every refund/void) is inserted as `status='needs_review'` with
   `inventory_item_id = null`.** So **item-level / type-level rollups are partial** until linking
   improves. Two consequences:
   - **Revenue & order-level metrics** (revenue over time, AOV, order count) should count **all
     `kind='sale'` rows regardless of link** — they don't need the join, so they're complete and
     trustworthy *today*.
   - **Item/type/category breakdowns** must join to `inventory_items` and will only cover linked
     rows. Show a "**N sales unlinked — link items to include them**" banner with the unlinked
     count so the number isn't silently wrong. (`getCoralSalesByType` already silently drops
     non-coral and unlinked rows — the new fns should *count and disclose* the dropped rows.)
2. **No margin yet.** `wholesale_cost` is **null for Clover-imported items** (Clover only carries
   retail; the importer has no cost). So **profit/margin charts are out of scope for v1** — we only
   have revenue (POS retail). Margin becomes possible per-item only once cost is backfilled (vendor
   intake already captures `wholesale_cost`; Clover-only items won't have it).
3. **`sale_price` is POS retail**, not our suggested 3× — discounts at the register are baked in, so
   `total_cents` is *actual* money, which is what we want.
4. **"Slow movers" needs care.** A catalog item with zero ledger rows could be genuinely unsold
   **or** just never linked to Clover. Define slow-mover over **linked, available** items and label
   the caveat. `quantity_sold` on the item is a secondary signal (it's bumped by `applyInventorySale`
   for linked frag/fish/dry-good sales, but **not** for colony corals or unlinked sales).
5. **Colony corals don't decrement.** Coral colonies (`attrs.stock_mode='colony'`) log frag-off
   events but keep `quantity_available`; don't treat their stock as "sell-through".
6. **History depth.** Ledger only goes back as far as the Clover import window — early
   "trend" lines will be short. Cap selectable ranges to what exists; don't imply a year of data.

---

## 3. KISS FOUNDATION (v1) — the smallest genuinely useful dashboard

**Recommendation on placement: build a dedicated `/reports` route** (`src/routes/_app/reports.tsx`),
not more cards crammed onto `dashboard.tsx`. Rationale:
- The dashboard is an **"needs attention / at a glance"** action surface (Workload KPIs, recents).
  Analytics is exploratory and time-windowed — a different job.
- A route gives room for a shared date-range control and avoids bloating the already-long dashboard.
- It's additive, not an architecture change (CLAUDE.md rule 2): we add one nav entry + one route,
  reusing existing layout/components.
- **Keep `CoralSalesReport` where it is** on the dashboard as the teaser, and **move/reuse it** as
  one section of `/reports`. Add a small "View all reports →" link on the dashboard card.

All new server fns live in a new `src/lib/reports.functions.ts`, each `createServerFn({method:"POST"})`
+ `.middleware([requireSupabaseAuth])` + `await requireEditor(supabase, userId)` (matching
`getCoralSalesByType`). All take a `days` (or explicit `from`/`to`) input. Client: TanStack Query
with keys like `["reports","revenue-over-time",days]`. **Charts: use `recharts` (already a
dependency, `^2.15.4`)** for the time-series + bar charts; keep the existing CSS-bar style from
`coral-sales-report.tsx` for the simple ranked lists (it's lighter and already matches the design).

### v1 surface — sections, each with its query

**A. Summary KPI strip** (reuse the `Kpi` card pattern from `dashboard.tsx`)
- **Total revenue (period)** — `Σ total_cents` where `kind='sale'` & `sold_at ≥ cutoff`. No join → complete.
- **# of sales (line items)** and **# of orders** — `count(*)` and `count(distinct clover_order_id)`.
- **Average order value (AOV)** — revenue ÷ distinct `clover_order_id` (fallback to per-line avg for
  manual sales with no order id).
- **Units sold** — `Σ qty` where `kind='sale'`.
- Small muted footnote: "`X` sales need review / unlinked" (count of `status='needs_review'`).

```
select kind, status, clover_order_id, qty, total_cents, sold_at
from inventory_sale_events
where sold_at >= :cutoff;     -- aggregate in JS (mirrors getCoralSalesByType's approach)
```
Server fn: `getSalesSummary({days})`.

**B. Revenue over time** (recharts line/bar; day buckets ≤45d, week buckets beyond)
- Bucket `kind='sale'` rows by day/week from `sold_at`, sum `total_cents`. Overlay a faint refund
  line if useful. This is the headline chart and needs **no join** → trustworthy today.
- Server fn: `getRevenueOverTime({days, granularity})`.

**C. Top sellers** (two ranked CSS-bar lists side by side, reusing the `coral-sales-report.tsx` bar markup)
- **By revenue** and **by units** — group linked `kind='sale'` rows by `inventory_item_id`, join
  `inventory_items` for `item_name`. For unlinked rows, **fall back to `clover_item_name`** so the
  top-sellers list is still useful before linking is done (group by `coalesce(item_name, clover_item_name)`).
- Server fn: `getTopSellers({days, metric, limit=15})`.

**D. Sales by item type & by coral type** (two small bar cards)
- **By `item_type`:** join linked rows → group by `inventory_items.item_type`, sum qty + revenue.
  (Mirrors the dashboard's existing `stockByCat` bucketing logic so the two read consistently.)
- **By coral type:** **literally reuse `getCoralSalesByType`** (`ops.functions.ts:2316`) — it already
  classifies coral lines via `classifyCoralType` and returns `{rows,totalQty,totalRevenueCents}`.
  Render with the existing `CoralSalesReport` component. Only enhancement: have it also return the
  count of coral rows it dropped for being unlinked, to feed the disclosure banner.

**E. Slow / no movers** (table or CSS-bar list, *the actionable one for reorder/cull*)
- Catalog items with `availability_status='available'` and **zero `kind='sale'` ledger rows in the
  last N days** (or `quantity_sold = 0`). Show name, type, `retail_price`, days since `created_at`,
  `quantity_available`. Sort by oldest / most stock tied up.
- Caveat label inline: "zero recorded sales — may be unlinked in Clover".
- Server fn: `getSlowMovers({days, limit})` — left-anti-join in JS: load available items, load
  distinct sold `inventory_item_id`s in window, diff.

That's it for v1: **one route, ~5 server fns, ~2 recharts charts + reused CSS bars, zero schema.**
Every revenue/order metric is complete now; every item/type metric carries an honest "unlinked"
disclosure. Cache invalidation isn't needed (read-only), but if a "Sync sales now" button is nearby,
wire its `onSuccess` to invalidate `["reports", ...]` keys (CLAUDE.md rule 5).

---

## 4. POSSIBILITIES SCALE (v1 → advanced)

Effort: **S** ≈ <½ day, reuses v1 fns · **M** ≈ 1–2 days · **L** ≈ multi-day and/or needs schema/sign-off.

| Rung | What | Effort | Value | Notes / dependency |
|---|---|---|---|---|
| Day-of-week / hour-of-day heatmap | Bucket `sold_at` into 7×24 grid, color by revenue/units | **S** | High | "Should we open Sundays? staff Friday nights?" No join, no schema. recharts or a CSS grid. |
| Vendor sell-through | Group linked sales by `inventory_items.vendor_id` → which suppliers' stock actually moves | **S–M** | High | Reuses join. Informs *who to reorder from*. |
| Category / subcategory drill-down | Same as item-type but on `category`/`subcategory` | **S** | Med | Data is sparse/dirty on Clover imports; gate behind data cleanup. |
| Location sell-through | Join `location_id` → which racks/tanks move product | **M** | Med | Needs decent location tagging coverage first. |
| **Margin / profit analysis** | revenue − (qty × `wholesale_cost`) per item/type | **M** | **Very High** | **Blocked:** `wholesale_cost` null for Clover items. Unblocks as vendor-intake items accumulate sales, or after a cost backfill. Pure UI once cost exists. |
| Reorder signals / stockout risk | Velocity (units/day over window) × `quantity_available` → "days of cover left"; flag fast sellers low on stock | **M** | **Very High** | The money rung: prevents lost sales. Pairs with slow-movers as the two sides of "what to buy". Reads existing data; no schema. |
| Refund/void analysis | Trend & top items for `kind in ('refund','void')` | **S** | Med | Quality/DOA signal. Data already in ledger. |
| Seasonality | Month-over-month, same-week-last-year | **M** | Med | **Needs history** — low value until ≥1 season of ledger accumulates. |
| Basket analysis (items bought together) | Group by `clover_order_id`, find co-occurring `inventory_item_id` pairs | **L** | Med–High | Cross-sell/bundle insight ("torch buyers also buy glue"). Needs linked rows + enough orders; combinatorial query — do server-side, cache. |
| Forecasting | Project next-period demand per item from velocity + seasonality | **L** | Med | Only worth it after reorder-signals + seasonality exist and history is deep. Likely a scheduled job, not live. |
| Tie-in to **Vendor Watch** | Overlay vendor price trends (`scrape.functions`, `vendor-watch.*`) against our sell-through for the same coral type | **L** | High | Cross-lane: "this coral type sells fast AND vendor price just dropped → buy now". Joins two subsystems via `coral-type.ts` slugs (shared classifier = natural key). Design as its own scope; sign-off needed. |
| Materialized rollup / daily snapshot table | Pre-aggregate sales by day for fast charts at scale | **L (schema)** | Low now | **Lovable's lane.** Only if JS-side aggregation gets slow (`limit 5000` in `getCoralSalesByType` hints at the current ceiling). Premature today. |

**Suggested next-two-rungs after v1:** *reorder signals* + *day-of-week heatmap* — both are S/M,
need no schema, and directly answer "what do I buy and when do I sell it". Hold *margin* until cost
data exists; hold *seasonality/forecasting* until history is deep.

---

## 5. Open questions for the owner

1. **What decision do you most want this to drive?** Reorder (buy more of X), cull/discount (kill
   slow movers), staffing/hours, or pricing? This ranks rung order — v1 covers revenue + top/slow,
   but reorder-signals vs. margin pull in different directions.
2. **Is improving Clover item-linking worth a push?** Item/type/category breakdowns stay *partial*
   until more Clover items map to `inventory_items` via `clover_item_links`. How much of the catalog
   is linked today, and is a linking sprint in scope? (Revenue totals don't need it; product mix does.)
3. **Do you want cost/margin?** If yes, are you willing to backfill `wholesale_cost` on
   Clover-imported items (manually or from vendor invoices)? Without it we can only show revenue.
4. **Who sees reports?** Editors (`requireEditor`) by default. Should *staff/viewer* roles see a
   read-only revenue view, or is this admin/manager-only?
5. **Time granularity & history expectations?** How far back does the imported ledger go? That caps
   meaningful trend/seasonality windows and whether forecasting is even worth scoping yet.
6. **Refunds/voids:** treat as a first-class metric (return-rate/DOA signal) or just net them out of
   revenue and move on?
```
