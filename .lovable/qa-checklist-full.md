# Full QA / audit checklist → Lovable

Comprehensive test pass over everything built this cycle: Reef Club loyalty, inventory review wizard,
feedback dock + auto-triage, chunked Clover sync, the `/customers` aggregation, and the audit hardening.
Lovable owns this pass because it needs **live-DB visibility** (RLS, constraints, RPCs, indexes, cron) +
**deployed-app E2E**. Mark each ✅/❌; for ❌ capture the exact error/SQL/screenshot and hand back to Claude.

Legend: **[DB]** = run SQL against the live DB · **[E2E]** = click through the deployed app ·
**[SEC]** = security/RLS check.

---

## 0. Pending infra to confirm first (gates other tests)
- [ ] **[DB]** `customers_with_spend(text,int)` RPC exists and runs (handoff-customers-aggregation.md). Then `/customers` should read from it.
- [ ] **[DB]** `VITE_GIT_SHA` build env set → feedback issues show a real commit, not "App commit: unknown".
- [ ] GitHub labels `feedback, bug, ui, idea, question` exist on the repo (so dock issues get labeled).
- [ ] (Option A) repo secret `ANTHROPIC_API_KEY` set + Actions "read/write" + "allow Actions to create PRs".

## 1. Reef Club loyalty
**Schema & constraints [DB]**
- [ ] `loyalty_config` + `loyalty_ledger` + `customers.reef_club_enrolled_at` exist as **committed migrations** (not dashboard-only).
- [ ] `loyalty_ledger` has `UNIQUE (sale_event_id, kind)` and index `(customer_id, created_at DESC)`.
- [ ] Sign/kind CHECK: `INSERT` a `redeem` with positive cents → **rejected**; `bonus` with negative → **rejected**.
- [ ] **[SEC]** Kind-scoped INSERT RLS: as a non-admin **editor**, inserting `kind='earn'` succeeds but `bonus/redeem/doa/adjust` is **denied**; as **admin** all kinds allowed.
- [ ] `loyalty_redeem` RPC: admin-only; rejects when amount > balance; writes a negative `redeem` row atomically.
- [ ] `customer_loyalty_summary` RPC returns balance + rolling-12-mo spend matching the ledger/sales.
- [ ] **Race test:** fire two concurrent `loyalty_redeem` calls that each exceed half the balance → exactly one succeeds, balance never goes negative.

**Functional [E2E]**
- [ ] Settings → Reef Club (admin): toggle **enable**, set earn %, edit tiers JSON, **Save** → persists on reload.
- [ ] With it enabled, run a Clover sales sync → a **linked member sale** writes an `earn` row at the configured % (check the customer's card + ledger).
- [ ] Customer profile → **Reef Club card**: balance, tier + progress bar, Reef Passport coral-type badges, recent activity all render.
- [ ] **Attach a past purchase**: pick a recent anonymous sale → it attaches `customer_id` and retro-earns credit; it leaves the unattributed list.
- [ ] Admin **Manage Reef Credit**: Add credit (+), Record redemption with channel **Live sale auction** (−), Arrive-Alive credit, Adjustment — each updates the balance.
- [ ] Redeem **more than balance** → clean "insufficient" error, nothing written.
- [ ] Non-admin: the Add/Redeem controls are hidden; the card is still viewable.

## 2. Inventory review wizard + stock filters
- [ ] **[E2E]** Inventory → status filter **"Needs review"** shows the draft set (not_for_sale / incoming / needs_id / quarantine / on_hold).
- [ ] Sort control (recently updated / name / qty / price) reorders the list.
- [ ] **"Review stock"** button shows for **admin only**; opens the swipe wizard.
- [ ] Per card: set location + qty + price, add a photo, **swipe right / →** → item flips to **Available** and leaves the queue.
- [ ] Go-live gates: try to take live with **no photo** → prompts the photo step; with **no price/location/qty** → blocked with a clear message.
- [ ] **Swipe left / Skip** → item is flagged (`attrs.review_flag`) and doesn't reappear next session.
- [ ] **[DB]** Confirm the photo/go-live **trigger** still blocks `availability='available'` without photo + approved price + retail + location + qty>0 (try a direct UPDATE).

## 3. Feedback dock
- [ ] **[E2E]** Dock renders bottom-left on every authed page; 4 type icons open the dialog.
- [ ] Submit **without** a screenshot → GitHub issue in `AgentArtel/the-fish-tank-868047fd` with labels `feedback`+type, correct page/device/viewport.
- [ ] Submit **with** a screenshot (file + paste) → image renders inline in the issue.
- [ ] **[DB/SEC]** `feedback` bucket is **private**; RLS allows authenticated insert + select; screenshots are signed-URL only (no public access).
- [ ] (Option A, once secrets set) open a `bug` issue → the workflow runs and produces a triage PR or analysis comment.

## 4. Clover sync (chunked)
- [ ] **[E2E]** Settings → Clover → **Sync sales now** runs to completion with a live progress count (no timeout / no dead Worker), even on the 30-day window.
- [ ] **Idempotency:** run it twice → the second run reports mostly "skipped/duplicate", no doubled sales/credit.
- [ ] Linked sales **decrement stock**; refunds/voids/unmatched land as **needs_review** (no stock change).
- [ ] Sales tied to a Clover customer **attach `customer_id`** (visible on the customer's history).
- [ ] **[DB]** `cron.job` shows **clover-poll every 10 min** active; confirm it has run recently (last_run, no errors).

## 5. /customers
- [ ] **[E2E]** After the RPC lands, the list shows correct **lifetime spend / order count**, sorted by spend desc; search by name/email/phone works.
- [ ] **[DB]** Spot-check one customer's `spend_cents`/`order_count` from the RPC against a manual `SUM` over `inventory_sale_events`.

## 6. Security / invariants (DB lane — high value) [SEC]
- [ ] **Mutating server fns check is_active + role**: as an **inactive** user, any mutation (log sale, approve pricing, save settings) is rejected; as a **viewer/staff**, editor-only actions are rejected.
- [ ] **AI is draft-only**: no AI/parse path writes `pricing_status='approved'`, `availability='available'`, `inventory_items`, or `loyalty_ledger`. (Spot-check the AI extract / coral-discovery flows.)
- [ ] **Pricing approval is admin-only** (UI + the DB pricing-approval trigger).
- [ ] **No item `available` without a photo** (trigger).
- [ ] **`getMe` projection**: app loads, header shows the user's email — confirm the narrowed `select` (id,email,display_name,avatar_url,is_active) didn't drop a needed field.
- [ ] **No dashboard-only schema**: loyalty + hardening + (new) customers RPC all exist as files in `supabase/migrations/`.

## 7. Build / health
- [ ] Deploy is green; no console errors on Dashboard, Inventory, Customers, a customer profile, Settings (Clover/Reef Club/AI), Vendor Watch.
- [ ] Run the repo linter; note any **new** errors introduced this cycle (the `no-explicit-any` warnings are pre-existing house style — ignore those).

---

## Reporting back
For each ❌: the page/SQL, the exact error or wrong value, and a screenshot. Group by section. Claude will
fix app-lane items; DB-lane fixes (RLS/constraint/RPC) stay in Lovable's lane.
