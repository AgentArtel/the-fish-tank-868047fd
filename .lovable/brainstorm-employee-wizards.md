# Brainstorm — Employee wizards / guided walkthroughs

> **Status:** ideation / scoping only. **Nothing changed.** Read-only pass over `src/components/*`,
> `src/lib/ops.functions.ts`, `src/lib/clover.*`, `src/routes/_app/*`, and `supabase/migrations/*`.
> No app code edited, no migration written, no commit.
> **Goal:** design a catalog of guided wizards for the recurring jobs floor staff do — *input, match,
> update* data on shift — and clarify the **admin (oversight)** vs **employee (data-entry)** split.
> **Reuse-first:** every wizard below is mapped to existing components / server fns it builds on; net-new
> pieces are called out explicitly with a priority.
> **Lanes:** `[App=Claude]` frontend wizard + wiring · `[DB=Lovable]` migration / RPC / RLS / trigger ·
> `[Decision]` an owner call before build.

---

## TL;DR — what's already there, and the three holes

The intake → tag → review → live loop is **mostly built** and the wizard *patterns* already exist:
Coral Discovery (`catalogCoralItem`), the Review Stock swipe deck (`InventoryReviewWizard` +
`reviewInventoryItem`), Quick Add FAB (`quickAddInventoryItem` / `bulkImportInventoryRows`), the
Photo-on-file gate (`useGoLiveWithPhoto` / `PhotoOnFileWizard`), the batch receive flow
(`receiveBatchLines` + `BarcodeScanDialog` + `PhotoReceiveDialog` + DOA photos), and PO reconciliation
(`ReconcileSection` + `computeQuickAddReconciliation`). The sale ledger + atomic decrement
(`applyInventorySale` → `decrement_inventory_stock` RPC) and Clover sales ingest
(`clover.ingest.server.ts`) are live.

**The audited holes are real and they are all employee-facing:**

1. **No Clover sale/link reconciliation UI.** Clover sales ingest works, and unlinked or refund/void
   lines land in `inventory_sale_events.status='needs_review'` (they are **not** silently dropped — the
   prompt's framing is slightly off, but the *effect* is the same: nobody resolves them, so stock for
   unlinked POS items never decrements). `clover_item_links` rows sit `unlinked` with no surface to link
   them. **This is the #1 gap.**
2. **No inventory count / cycle-count flow.** Nothing walks a rack/tank and reconciles physical vs
   `quantity_available`. `adjustInventoryQuantities` exists but has no guided caller and no audit reason.
3. **No first-class mortality path.** `quantity_lost` exists and the qty CHECK respects it, but no wizard
   moves stock into it; flipping `availability_status='dead_lost'` does **not** move `quantity_lost`, and
   `quantity_on_hold` is never moved by status changes either.

**Plus one structural blocker — now DECIDED (see next section):** `requireEditor` was
**admin | creator | reviewer only**, so `staff` couldn't run any mutating server fn. The owner's 3-role
decision resolves it: **floor staff IS the employee write-tier.**

---

## ⭐ Owner decisions + added scope (2026-06-21)

### Roles → just three: `admin · dev · floor staff`
Collapse the 6-role set (admin/manager/creator/reviewer/staff/viewer) to **three**:
- **admin** — owner/manager oversight: pricing approval, go-live, Clover config, user management + all below. *(absorbs manager, reviewer)*
- **dev** — technical superuser: admin + integrations / AI keys / debug. *(you & me)*
- **floor staff** — the **employee write-tier**: runs the input/match/update wizards (receive, count,
  mortality, hold, relocate, manual sale, trade-in). **Cannot** approve pricing, go-live, or touch Clover
  config. *(absorbs staff, creator, viewer)*

**This resolves the structural blocker:** floor staff is the write tier (the `requireFloorStaff` guard,
option (b) further below). Foundation = **Phase 0**, spec in `.lovable/handoff-phase0-roles-rls.md`:
`[DB=Lovable]` collapse the role enum + update RLS + add floor-staff write policies/RPCs for the safe ops ·
`[App=Claude]` refactor `auth-guards` + the users UI + each wizard's guard. *(Open detail: does floor staff
draft CMS content, or is content admin-only? minor.)*

### Added wizards
- **11. Trade-in intake (fish & coral)** · floor staff · **net-new** · **P1** — a customer brings stock (no
  PO, no vendor): capture species/qty/condition + **value/credit given** + link the customer → draft
  inventory (pending review/pricing). Reuses the Coral Discovery / Quick Add capture pattern.
  *Depends on the store-credit decision.*
- **12. Process a return / refund** · floor staff (+admin for write-off) · **net-new** · **🅑 BACKLOG
  (owner decision)** — resolves the Clover refund/void `needs_review` events that today dead-end: restock
  (qty back) vs write-off, and refund-to-cash vs **store credit**. Pairs with wizard 2.
  **Parked 2026-06-22:** deferred pending business-owner sign-off on refund policy (cash vs credit rules,
  restock vs write-off authority, who eats shrinkage). The store-credit *plumbing* it needs is already
  shipped (`grant_store_credit`, `source='return'/'refund'`), so this is unblocked technically — it's a
  **policy** decision, not an engineering one. Pick back up once the owner rules on refund policy.

### Added gaps (beyond the original 3 holes)
- **Store credit / customer dollar-balance** `[Decision]` — there's loyalty *points* but no **credit
  balance**; trade-ins *give* it, refunds *return to* it. Underpins 11 + 12. Likely a new table + RPC
  `[DB=Lovable]`. **Decide: do we want store credit?**
- **Re-pricing / markdowns on existing inventory** · **P1** `[App]` — pricing approval covers only *new*
  items; no flow to change an existing item's price (sales, clearance, grown-up livestock).
- **Quarantine → floor release** · **P1** `[App]` — the `quarantine` availability status exists but has no
  transition flow; QT mortality should feed wizard 4.
- **Vendor DOA / shortage credit claims** · **P2** — DOA is captured on receive, but no path to claim the
  credit back from the supplier.

### Note — the Clover sale path changed (post-migration)
The sale ledger is now the shared **`apply_inventory_sale` RPC** (manual + Clover), and Clover ingest is a
**Supabase edge function** — `applyInventorySale` / `clover.ingest.server.ts` were deleted. Wizards 2 & 8
call the RPC, not the old helper.

---

## Data model cheat-sheet (the columns these wizards touch)

- **`inventory_items`** — `availability_status` ∈ {`incoming`,`quarantine`,`needs_id`,`available`,`on_hold`,
  `sold_out`,`not_for_sale`,`dead_lost`}; `pricing_status` ∈ {`not_priced`,`approved`}; `live_sale_status`;
  `quantity_received / _available / _on_hold / _sold / _lost`; `needs_photo`; `location_id`; `rack_position`;
  `item_type`; `attrs` (jsonb). CHECK `inventory_qty_balance`: `received ≥ available + on_hold + sold + lost`.
  Trigger `inv_guard_gates`: `available` requires `pricing_status=approved` + `retail_price` + `location_id`
  + `quantity_available>0`; live-sale requires a `is_live_sale` location. Trigger `log_inventory_activity`
  auto-writes `inventory_activity_logs`.
- **`clover_item_links`** — `clover_item_id` (UNIQUE), `inventory_item_id` (nullable), `clover_name`,
  `clover_price_cents`, `link_status` ∈ {`linked`,`unlinked`}, `last_synced_at`.
- **`inventory_sale_events`** — `inventory_item_id` (nullable), `qty`, `unit_price_cents`, `source`
  ∈ {`manual`,`clover`}, `kind` ∈ {`sale`,`refund`,`void`}, `status` ∈ {`applied`,`needs_review`,`reversed`},
  `clover_order_id / _line_item_id / _payment_id / _item_name`, `customer_id`.
- **`store_locations`** — hierarchical (`parent_location_id`, `system_group_id`), `kind`, `location_code`,
  `area_code`, `is_live_sale`, `is_active`, `sort_order`. QR labels deep-link to
  `/inventory?location=<id>&descendants=1`.
- **`vendor_line_items`** — `received_quantity`, `lost_quantity`, `loss_reason`, `assigned_location_id`,
  `reconciliation_status` ∈ {`pending`,`matched`,`short`,`accepted`,`missing`,`extra`,`skipped`},
  `reconciled_inventory_item_id`, `converted_inventory_item_id`.
- **RPC** `decrement_inventory_stock(_id, _qty)` — atomic, row-locked decrement + `sold_out` flip.

---

# Wizard catalog

Each wizard: **Job-to-be-done · Who · Entry point · Flow · Data · Reuse map · Gaps + Priority.**

---

## 1. Intake / Receive a delivery  ·  P0  ·  mostly reuse

- **Job-to-be-done:** A box arrives from a vendor. Verify counts vs the PO, record DOA/mortality on
  arrival (with the required photos), assign each line to a tank/rack, optionally barcode-scan, and mark
  the batch received — so receiving is a guided checklist instead of a dense grid.
- **Who:** floor staff / receiver (today: editor; see `[Decision]`).
- **Entry point:** Quick Add FAB → "Receive a vendor order" already routes to `/batches`
  (`quick-add-fab.tsx`). New: a **"Start receiving" CTA** on `batches.$id.tsx` that opens a stepped
  wrapper over the existing `ReceiveSection`.
- **Step-by-step flow:**
  1. **Pick the batch** (or create one — `createVendorBatch`). Show vendor + PO totals banner.
  2. **Line-by-line, one card at a time** (re-skin `ReceiveSection`'s per-line drafts as a deck, like the
     Review wizard): big "received N of M" stepper, "+ scan" (BarcodeScanDialog), "snap to match"
     (PhotoReceiveDialog), tank/rack picker.
  3. **Any DOA?** toggle → lost qty + `loss_reason` + the **two required photos** (`in_bag` + `on_lid`,
     enforced by `guard_vli_doa_photos` + the `receiveBatchLines` pre-flight).
  4. **Review summary** (ordered vs received vs lost; flag mismatches) → confirm.
  5. Save → `receiveBatchLines`. Admin still does pricing approval + convert-to-inventory afterward.
- **Data:** writes `vendor_line_items.received_quantity / lost_quantity / loss_reason /
  assigned_location_id / item_type / override_retail_price`; `vendor_line_receive_logs` (audit);
  `vendor_line_doa_photos`. Reads `store_locations`. **Server fn:** `receiveBatchLines`, `uploadDoaPhoto`,
  `createVendorBatch`.
- **Reuse map:** `ReceiveSection`, `BarcodeScanDialog`, `PhotoReceiveDialog`, the DOA dialog, the totals
  banner, `receiveBatchLines` — **all exist**. The swipe-deck shell can copy `InventoryReviewWizard`.
- **Gaps / new:** purely a UX wrapper (stepped/one-card mode) over today's grid — **net-new is small,
  [App] only**. No DB change. The grid already works, so this is "strengthen," not "build."

---

## 2. Match items to Clover (POS reconciliation)  ·  P0  ·  net-new UI, reuses matcher pattern

- **Job-to-be-done:** Two related queues that currently have **no surface**: (a) `clover_item_links` rows
  that are `unlinked` (a POS product with no workspace item — its sales never decrement stock); (b)
  `inventory_sale_events.status='needs_review'` (unmatched sale lines + refunds/voids). Walk an employee
  through each: search/suggest a workspace item, confirm the link (or create the item), and clear the
  sale from the queue.
- **Who:** manager/admin to start (it edits stock + money); could open to staff once safe. Today only
  admin can run the Clover server fns — **needs new editor-level server fns** (`[Decision]` + `[DB]` RLS).
- **Entry point:** new nav badge **"Clover review (N)"** sourced from `getCloverOverview`'s
  `salesNeedingReview` + `unlinked` counts (already computed). Lands on a new
  `/inventory/clover-reconcile` route. Also reachable from `settings.clover.tsx` summary cards.
- **Step-by-step flow:**
  - **Tab A — Link products:** list `clover_item_links` where `link_status='unlinked'`. For each: show
    `clover_name` + `clover_price_cents`; **suggest** workspace items by fuzzy name (reuse the `nameScore`
    matcher already in `ops.functions.ts`); employee taps **Link** (sets `inventory_item_id`,
    `link_status='linked'`) or **Create item** (drafts an `inventory_items` row from the Clover name/price,
    `not_for_sale`, `needs_photo`, `attrs.clover_item_id`) — exactly what `createWorkspaceItemsFromClover`
    already does per-row, just employee-triggered one at a time.
  - **Tab B — Resolve sales:** list `inventory_sale_events` where `status='needs_review'`. For an
    **unmatched sale** (no `inventory_item_id`): once its Clover item is linked in Tab A, offer
    **"Apply now"** → `applyInventorySale(..., source:'clover', kind:'sale')` then set the event
    `status='applied'`. For a **refund/void**: show it, let a human **acknowledge** (set `reversed`) or
    leave for admin — per the standing "no auto-reverse" decision.
- **Data:** updates `clover_item_links` (`inventory_item_id`, `link_status`); inserts/updates
  `inventory_items`; calls `applyInventorySale` → `decrement_inventory_stock`; updates
  `inventory_sale_events.status`. **New server fns** (editor-gated): `linkCloverItem`,
  `createInventoryFromCloverLink`, `resolveReviewSaleEvent`.
- **Reuse map:** the **suggest/confirm matcher UX** is `ReconcileSection` + `computeQuickAddReconciliation`
  (same fuzzy-match-then-confirm shape — reuse `nameScore`). Item-creation logic exists in
  `createWorkspaceItemsFromClover`. Sale application is `applyInventorySale`. The link table + counts
  (`getCloverOverview`) exist.
- **Gaps / new:** the whole **UI is net-new** (`[App]`), plus **3 small editor-gated server fns**
  (`[App]` authoring, `[DB=Lovable]` RLS/grants if any). Per Engineering Rule 7 these are auth-gated DB
  reads/writes only (no third-party I/O) — the *Clover fetch* stays in the existing ingest, so the new fns
  are app-server-fn-legal. **This is the single highest-leverage gap.**

---

## 3. Inventory count / cycle count  ·  P0  ·  net-new (flow + audit RPC)

- **Job-to-be-done:** Walk one location/rack, count what's physically there, and reconcile against
  `quantity_available` with an audit trail and a discrepancy reason — so the "trustworthy picture" the
  vision demands is actually checkable.
- **Who:** floor staff counts; **admin signs off** large adjustments (`[Decision]` on the threshold).
- **Entry point:** **QR label deep-link** is the natural trigger — scanning a rack QR already opens
  `/inventory?location=<id>&descendants=1`. Add a **"Count this location"** button on that filtered view
  (and on `store-locations.tsx`). New route `/inventory/count?location=<id>`.
- **Step-by-step flow:**
  1. Load **expected items** for the location (and descendants): name, `rack_position`, expected
     `quantity_available`, thumbnail.
  2. For each, employee enters **counted qty** (big +/- stepper; default = expected so unchanged lines are
     one tap). Scan-to-find via `BarcodeScanDialog` to jump to a row.
  3. **Flag discrepancies** automatically (counted ≠ expected) with a reason picker (`miscount`,
     `shrinkage`, `found_extra`, `mortality→see wizard 4`).
  4. **Found something not in the system?** inline **Quick Add** (reuse `quickAddInventoryItem`).
  5. **Review summary** of deltas → submit. Counted=0 with no reason → suggest `sold_out` / hold for
     mortality wizard.
- **Data:** updates `inventory_items.quantity_available` (and `quantity_received` to keep the
  `inventory_qty_balance` CHECK satisfied); writes an **audit row** per adjustment. **New server fn**
  `applyInventoryCount` wrapping the writes; ideally a **new `inventory_count_sessions` / `_lines`** pair
  for the trail (or, lighter, reuse `inventory_activity_logs` with `action='quantity_change'` +
  `detail.reason`).
- **Reuse map:** the location-filtered list + tree-walk + QR deep-link all exist on `inventory.index.tsx`;
  `adjustInventoryQuantities` + `syncAvailabilityToStock` already do the qty math + `sold_out`/restock
  flip; `BarcodeScanDialog` and `QuickAddButton` exist.
- **Gaps / new:** **[App]** the count deck; **[DB=Lovable]** either the `inventory_count_sessions` tables
  (preferred for a real audit) **or** a decision to log via `inventory_activity_logs`; **new server fn**
  `applyInventoryCount` (editor-gated, batched, reason-tagged). **[Decision]** does a count adjustment
  need admin co-sign above a threshold?

---

## 4. Log dead livestock / mortality  ·  P0  ·  net-new (small, fixes a real data bug)

- **Job-to-be-done:** "Found a dead fish." Search the item, record N lost with a reason and an optional
  photo, and have stock + availability update correctly — moving qty into `quantity_lost`, **not** just
  flipping a status (which today leaves `quantity_lost` untouched and can violate intent).
- **Who:** floor staff (fast, low-stakes, frequent).
- **Entry point:** **Quick Add FAB** new intent card "Log a loss / mortality"; also a per-item action on
  `inventory.$id.tsx` and a swipe-action in the count wizard (#3).
- **Step-by-step flow:**
  1. **Find the item** — search by name / scan QR or barcode (reuse the find patterns;
     `findInventoryDuplicates`'s search shape works).
  2. **How many lost?** stepper (default 1), **reason** (`death`, `disease`, `jumped`, `doa_late`,
     `damaged`), optional **photo** (`PhotoOnFileWizard`).
  3. Confirm → record. If `quantity_available` hits 0 → auto `sold_out` (or `dead_lost` if the whole lot
     is gone). Coral **colony** items use `setColonyGone` instead of decrementing.
  4. Toast + undo window.
- **Data:** **new RPC `record_inventory_loss(_id, _qty, _reason)`** mirroring `decrement_inventory_stock`:
  atomic, row-locked — `quantity_available -= n`, `quantity_lost += n` (respecting the
  `inventory_qty_balance` CHECK), flip availability at 0. Writes `inventory_activity_logs`
  (`action='quantity_change'`, `detail.reason='loss'`). Optional `inventory_media` photo.
- **Reuse map:** `decrement_inventory_stock` is the exact pattern to clone; `setColonyGone` handles
  colonies; `PhotoOnFileWizard` for the photo; the FAB intent-card pattern exists.
- **Gaps / new:** **[DB=Lovable]** the `record_inventory_loss` RPC (clean atomic loss path — fixes the
  "status flip doesn't move `quantity_lost`" bug); **[App]** the wizard + new editor-gated
  `logInventoryLoss` server fn calling the RPC. Small, high-correctness-value.

---

## 5. Go-live (price + photo → available)  ·  P1  ·  pure reuse

- **Job-to-be-done:** Take a reviewed draft live cleanly through the gates.
- **Who:** **admin only** (it approves pricing + flips availability — invariant).
- **Entry point:** "Review stock" button on `inventory.index.tsx` (exists).
- **Flow / Data / Reuse:** This **is** the `InventoryReviewWizard` swipe deck →
  `reviewInventoryItem` (sets price = approved, `takeLive` → `available` behind `inv_guard_gates`) with the
  photo gate. **Already built.** Listed here only so the loop is complete; **no new work** beyond pointing
  staff at it. Catalogued via Coral Discovery (`catalogCoralItem`) flows straight into this deck.
- **Gaps:** none structural. P1 polish only: surface the Pricing Queue's coral two-step
  (`approveInventoryPricing` then go-live) inside the same deck so admins don't bounce between
  `/pricing-approval` and Review Stock.

---

## 6. Relocate / move stock  ·  P1  ·  net-new (tiny)

- **Job-to-be-done:** Move a coral/fish to a new tank or rack plug and keep the system honest.
- **Who:** floor staff.
- **Entry point:** QR scan of the **destination** location → "Move an item here"; or per-item action.
- **Flow:** find item (search/scan) → confirm new `location_id` + `rack_position` → save. Warn on plug
  collision (Coral Discovery already computes `positionsByLocation` for this).
- **Data:** `inventory_items.location_id` + `rack_position`. **Server fns exist:**
  `setInventoryRackPosition`; a location-only setter is a 5-line addition (or reuse
  `adjustInventoryQuantities`'s pattern). `log_inventory_activity` auto-logs `location_change`.
- **Reuse map:** `setInventoryRackPosition`, the location picker, the plug-collision check from
  `getCoralDiscoveryOverview`.
- **Gaps / new:** **[App]** small wizard + one **new `setInventoryLocation` server fn** (`[App]` author).

---

## 7. Put on hold / reserve for a customer  ·  P1  ·  net-new (fixes `quantity_on_hold` gap)

- **Job-to-be-done:** A customer wants an item held. Move N from available → on hold, tag who/why, so it
  stops showing as freely sellable.
- **Who:** floor staff.
- **Entry point:** per-item action; Quick Add FAB intent.
- **Flow:** find item → qty to hold + customer (reuse the customer picker /
  `customers_with_spend`) + expiry note → confirm.
- **Data:** **`quantity_on_hold` is never moved by anything today** — needs a real path:
  `quantity_available -= n`, `quantity_on_hold += n`; set `availability_status='on_hold'` when fully held.
  **New RPC `move_to_hold` / `release_hold`** (atomic, CHECK-safe), or careful use of
  `adjustInventoryQuantities` (which today sets raw values — risky for concurrent edits).
- **Reuse map:** customer picker, `adjustInventoryQuantities` shape, `setInventoryAvailability`.
- **Gaps / new:** **[DB=Lovable]** hold/release RPCs; **[App]** wizard + server fns. **[Decision]** do
  holds expire / auto-release?

---

## 8. Log a manual / in-store sale  ·  P1  ·  pure reuse

- **Job-to-be-done:** A walk-in buys something not rung through Clover (or before Clover is live).
- **Who:** floor staff.
- **Entry point:** per-item action; FAB intent.
- **Flow:** find item → qty + unit price (prefill `retail_price`) → optional customer → confirm.
- **Data / Reuse:** **`logInventorySale` already exists** (`applyInventorySale`, `source='manual'`,
  decrements via RPC, writes the ledger, earns loyalty). Just needs a friendly **find→confirm wizard**
  in front of it. Colony frag-off uses the colony branch automatically.
- **Gaps / new:** **[App]** thin wizard only. No DB change.

---

## 9. Coral frag-off  ·  P2  ·  reuse

- **Job-to-be-done:** Frag a mother colony into a sellable frag; record the event without decrementing the
  colony (colony is stock-untracked).
- **Who:** floor staff / propagator.
- **Flow:** pick colony → "frag off N" → optionally Quick-Add the new frag(s) as draft coral with
  `rack_position`. Colony "all gone" → `setColonyGone`.
- **Data / Reuse:** `applyInventorySale` colony branch logs a frag-off event without decrement;
  `setColonyGone`; `catalogCoralItem` to birth the frags. Mostly exists.
- **Gaps / new:** **[App]** small wizard tying colony event + frag draft together. P2 — not daily.

---

## 10. End-of-day reconcile  ·  P2  ·  reuse + roll-up

- **Job-to-be-done:** A closing checklist: resolve the day's Clover `needs_review` (wizard 2), clear any
  open holds, confirm no `dead_lost` lots still show available, glance at today's loss/sale totals.
- **Who:** closing manager.
- **Entry point:** new card on `/dashboard` or `/tasks` (the Tasks/SOPs stub is the natural home).
- **Flow:** a checklist that **links into wizards 2/3/4/7** + a read-only day summary.
- **Data / Reuse:** reads `inventory_sale_events`, `getCloverOverview`, the dashboard rollups
  (`getCoralSalesByType`); no new writes of its own.
- **Gaps / new:** **[App]** checklist composition once 2/3/4 exist; depends on Tasks/SOPs (currently a
  stub). P2.

---

# Admin (oversight) ↔ employee (data-entry) map

The intended shape: **employees capture/match/update via wizards → data lands in tables → admins
review/approve via queues.** The gate invariants enforce the split (AI is draft-only; pricing approval
admin-only; no `available` without photo+price+location; live-sale admin-only).

| Admin oversight surface (exists) | Employee input wizard that feeds it | State |
|---|---|---|
| **Pricing Queue** `/pricing-approval` (`approveLinePricing`, `approveInventoryPricing`) | Receive (1), Coral Discovery (`catalogCoralItem`), Quick Add (`quickAddInventoryItem` flags `price_review`) | exists ↔ exists |
| **Review Stock deck** (`InventoryReviewWizard` → `reviewInventoryItem`) | Coral Discovery, Clover draft import, Receive | exists ↔ exists |
| **Missing tags** `/inventory/missing-tags` | Photo-on-file wizard (`useGoLiveWithPhoto`) | exists ↔ exists |
| **Clover settings** counts (`getCloverOverview`: unlinked, salesNeedingReview) | **Clover reconcile wizard (2)** | **count exists ↔ wizard MISSING (P0)** |
| **Dashboard / Reports** (stock value, `getCoralSalesByType`) | Count (3), Mortality (4), Manual sale (8) | exists ↔ **3/4 MISSING (P0)** |
| **PO reconciliation** `ReconcileSection` (admin/editor) | Receive (1) + Quick Add | exists ↔ exists |
| (none) **Audit/discrepancy review** | Count (3) audit trail | **both MISSING** |

**What's missing on each side:**

- **Employee side (the holes):** Clover reconcile (2), cycle count (3), mortality (4), hold (7), relocate
  (6) — the daily "keep the data honest" jobs. Without 2/3/4 the admin queues describe a reality nobody
  maintains.
- **Admin side:** no **count/audit review** surface (pairs with 3); no **Clover review queue** page (the
  count is shown in settings but there's no place to *act*); refund/void events in `needs_review` have no
  admin disposition UI.
- **Structural `[Decision]` (blocks the employee side):** `staff` is not an `editor`, so no staff member
  can run any wizard's writes today. Options:
  - **(a)** add `staff` to the `requireEditor` set (simplest; broadens write access to all editor fns —
    probably too much);
  - **(b)** add a **`requireFloorStaff`** guard (admin|creator|reviewer|**staff**) used only by the safe
    employee fns (count, loss, hold, manual sale, relocate, receive), keeping pricing/go-live/Clover-config
    admin-only. **Recommended.** `[DB=Lovable]` confirms the `user_roles` rows + any RLS; `[App=Claude]`
    adds the guard and applies it per fn.

---

# Recommended build sequence

**Phase 0 — unblock (decide first):**
- `[Decision]` Floor-staff write tier: adopt **`requireFloorStaff`** (option b). Owner sign-off.
- `[DB=Lovable]` Confirm `staff` role rows + RLS on `inventory_items` / `inventory_sale_events` /
  `clover_item_links` allow the new editor-gated fns for that tier.

**Phase 1 — P0 (fills the three audited holes + the daily loop):**
1. **Mortality wizard (4)** — smallest, highest correctness value. `[DB]` `record_inventory_loss` RPC ·
   `[App]` wizard + `logInventoryLoss` fn. Fixes the `quantity_lost` bug.
2. **Cycle count (3)** — `[DB]` `inventory_count_sessions`/`_lines` (or decision to log via activity log) ·
   `[App]` count deck + `applyInventoryCount`. QR-deep-link entry.
3. **Clover reconcile (2)** — `[App]` `/inventory/clover-reconcile` (Tab A link, Tab B resolve) +
   `linkCloverItem` / `createInventoryFromCloverLink` / `resolveReviewSaleEvent` fns; reuse `nameScore`
   matcher. `[DB]` RLS for the new editor-gated fns. **Highest leverage.**
4. **Receive wrapper (1)** — `[App]` stepped/one-card shell over `ReceiveSection`. No DB change.

**Phase 2 — P1:**
5. **Manual sale (8)** — `[App]` thin wizard over existing `logInventorySale`.
6. **Relocate (6)** — `[App]` wizard + `setInventoryLocation` fn.
7. **Hold/reserve (7)** — `[DB]` hold/release RPCs · `[App]` wizard. `[Decision]` expiry behavior.
8. **Go-live polish (5)** — `[App]` fold coral pricing two-step into the Review deck.

**Phase 3 — P2:**
9. **Coral frag-off (9)** — `[App]` wizard over `applyInventorySale` colony branch + `catalogCoralItem`.
10. **End-of-day reconcile (10)** — `[App]` checklist on Tasks/SOPs once 2/3/4/7 land.

---

## At-a-glance catalog

| # | Wizard | Role | Reuse vs new | Priority |
|---|---|---|---|---|
| 1 | Intake / Receive | floor staff | reuse (`ReceiveSection`/`receiveBatchLines`) + UX shell | **P0** |
| 2 | Match items to Clover | manager/admin → staff | **net-new UI** + 3 fns; reuse `nameScore`/`applyInventorySale` | **P0** |
| 3 | Inventory count | staff (+admin sign-off) | **net-new** flow + audit; reuse qty math + QR deep-link | **P0** |
| 4 | Log mortality | floor staff | **net-new** small; reuse `decrement_inventory_stock` pattern | **P0** |
| 5 | Go-live | admin | **pure reuse** (`InventoryReviewWizard`) | P1 |
| 6 | Relocate stock | floor staff | net-new tiny + 1 fn; reuse `setInventoryRackPosition` | P1 |
| 7 | Hold / reserve | floor staff | net-new + RPC (fills `quantity_on_hold` gap) | P1 |
| 8 | Manual sale | floor staff | **pure reuse** (`logInventorySale`) + wizard shell | P1 |
| 9 | Coral frag-off | propagator | reuse `apply_inventory_sale` colony + `catalogCoralItem` | P2 |
| 10 | End-of-day reconcile | closing mgr | reuse / roll-up of 2/3/4/7 | P2 |
| 11 | Trade-in intake (fish & coral) | floor staff | net-new; reuse Coral Discovery / Quick Add capture | P1 |
| 12 | Process return / refund | floor staff (+admin write-off) | net-new; resolves Clover `needs_review` | P1 |

> **Engineering-rule check:** every "new server fn" above is an **auth-gated DB read/write** (no
> third-party `fetch`, no AI, no scraping) — legal as a TanStack `createServerFn`. The only external I/O
> (Clover REST) stays in the existing `clover.*` ingest path; wizard 2 only reads/writes the tables that
> ingest already populates. Nothing here belongs in an edge function.
