# Audit — Inventory + Intake (dry-goods bug + intake flow)

> Claude Code audit, 2026-06-13. Branch: `claude/fish-tank-vendor-watch-audit`.
> Build + `tsc --noEmit` clean before and after the one applied fix.

---

## A. Dry-goods bug — root cause + fix (APPLIED, Claude's lane)

### Symptom
"Adding dry goods inventory throws errors." The Quick Add dialog's **Dry Goods**
tab (and, in fact, the plain **Fish** livestock tab) fails on save with a toast
"Failed to save" / a not-null constraint error.

### Root cause (exact path)
1. `attrs` column is `jsonb **NOT NULL** DEFAULT '{}'` — added in
   `supabase/migrations/20260605062448_87e43908-...sql:1-2`.
2. `quickAddInventoryItem` builds the insert payload in
   `src/lib/ops.functions.ts` and, **before the fix**, line 1217 read:
   ```ts
   attrs: data.attrs && Object.keys(data.attrs).length > 0 ? data.attrs : null,
   ```
3. In `src/components/quick-add-fab.tsx` (`ManualForm.submit`, ~L212-216) `attrs`
   is only populated for `item_type === "coral"` (inventory_role / coral_type).
   For **dry_good** (and for **fish**) the `attrs` object stays empty, so the
   client sends no attrs and the server falls into the `: null` branch.
4. Postgres rejects an **explicit `NULL`** into a `NOT NULL` column **even when a
   DEFAULT exists** (the default only applies when the column is *omitted*, not
   when null is supplied). The `.insert(...)` at `ops.functions.ts:1199-1224`
   throws `null value in column "attrs" ... violates not-null constraint`, which
   `if (insErr) throw new Error(insErr.message)` surfaces to the UI.

### Why it reads as "dry goods only"
Corals never hit the bug: they go through **Coral Discovery** (`catalogCoralItem`,
always sets `attrs`) or the Quick Add coral branch (sets role/type). The Quick Add
**Dry Goods** tab is the canonical non-coral path, so that's where the boss sees
it. Plain **fish** quick-adds were equally broken — same line, same cause.

This was NOT a photo gate, pricing-approval gate, qty-balance, RLS, or
item-type-enum issue — `dry_good` is a valid enum member everywhere
(`item_type` enum, zod validators, generated types). It was purely the explicit
`null` into a `NOT NULL` jsonb column.

### Fix (one line, in-lane — no DB change needed)
`src/lib/ops.functions.ts` `quickAddInventoryItem` insert — send `{}` instead of
explicit `null` so the empty-attrs case is a valid value:
```ts
attrs: data.attrs && Object.keys(data.attrs).length > 0 ? data.attrs : {},
```
`bulkImportInventoryRows` (the "Paste list" path) was already safe — it **omits**
`attrs` from its insert and lets the column DEFAULT to `{}`, so paste-import dry
goods already worked. Only the manual Photo+Form path was broken.

Verified: `tsc --noEmit` clean, `npm run build` green.

---

## B. Intake flow map — how inventory gets created

### Data model (relevant columns)
- **`vendor_batches`** — one row per intake event (invoice / order sheet / packing
  list / `manual_entry`). `intake_status` (draft→uploaded→parsing→review→approved→
  converted→archived), `extraction_status`, `is_quick_add`. A system vendor with
  `slug='quick-add'` ("Quick Add / Restock") owns all quick-add/bulk batches; one
  batch per user per day.
- **`vendor_line_items`** — parsed/typed lines on a batch. `kind` (sellable|charge),
  `item_type`, `attrs`, `review_status`, `pricing_status` (not_priced|suggested|
  approved), `approved_retail_price`, `received_quantity`/`lost_quantity`,
  `converted_inventory_item_id`. AI fills these draft-only.
- **`inventory_items`** — the real stock row. `item_type` (enum), `attrs` (jsonb
  NOT NULL '{}'), `pricing_status` (not_priced|approved), `availability_status`
  (incoming|quarantine|needs_id|available|on_hold|sold_out|not_for_sale|dead_lost),
  `live_sale_status`, `needs_photo`, qty columns (`quantity_received` / `_available`
  / `_on_hold` / `_sold` / `_lost`).
- **`inventory_media`** — photos; `has_price_tag`, `ocr_text`. At least one row is
  required before `availability_status='available'`.

### DB guards/triggers on `inventory_items` (all fire for every item_type)
- `inv_guard_gates` (`guard_inventory_gates`, mig 20260526235115:270-293):
  `available` requires `pricing_status='approved'` + `retail_price` + `location_id`
  + `quantity_available>0`; staged/live needs a live-sale location.
- `trg_inv_photo_required` (`guard_inventory_photo_required`, mig 20260604224211):
  `available` requires ≥1 `inventory_media` row.
- `inv_guard_pricing_approval` (mig 20260610141205): **UPDATE-only** — a non-admin
  cannot *promote* `pricing_status` to `approved`. INSERTs are intentionally
  exempt, which is why Quick Add can insert `pricing_status:'approved'` directly.
- `inventory_qty_balance` CHECK: `received >= available+on_hold+sold+lost`.

### Distinct entry paths (they differ a lot)
1. **Vendor Intake / batches** (`/batches` → `/batches/$id`): create batch → upload
   PDF → `extractBatchWithAI` (draft line items, never priced) → human review →
   admin approves pricing (`approveLinePricing`) → `receiveBatchLines` (received/
   lost qty, DOA photo enforcement) → admin `convertLineItemsToInventory` creates
   `inventory_items` as `incoming` + `needs_photo:true`. The full, governed path.
2. **Quick Add FAB / "Quick Add" button** (`quick-add-fab.tsx`): in-store restock.
   Two modes (Livestock / Dry Goods) × two sub-tabs (Photo+Form / Paste list).
   - Photo+Form → `quickAddInventoryItem`: creates the item already
     `pricing_status:'approved'`, `needs_photo:false`, registers the required
     photo, then **flips to `available` only if a location was chosen**.
   - Paste list → `parseInventoryMarkdown` (AI) → dedupe (`findInventoryDuplicates`)
     → `bulkImportInventoryRows` (create/merge/skip; per-row or shared photo).
3. **Coral Discovery** (`/inventory/coral-discovery` → `catalogCoralItem`): catalog
   corals already in the building, no vendor/PO. Always DRAFT — `pricing_status`
   stays `not_priced`, availability is derived from inventory_role and is never
   `available`. Sets `attrs` (rack_position, inventory_role, coral_type).
4. **Item page** (`/inventory/$id`): edit qty/attrs/type, change availability;
   "Mark available" triggers the `PhotoOnFileWizard` if no photo, then flips status.
5. **New batch dialog** (`batches.index.tsx`) writes `vendor_batches` directly from
   the client (not via a server fn) — an inconsistency worth noting (see C).

---

## C. Confusion points + KISS recommendations (prioritized)

### Quick wins (frontend / Claude's lane, low risk)
1. **[DONE] Dry-goods save bug** — fixed (Section A).
2. **"Available" depends on a silently-required Location.** In Quick Add, the item
   only flips to `available` when a location is picked; otherwise it lands as
   `Incoming` with no strong signal that it's *not yet live*. The hint text is tiny
   ("No location? It will be saved as Incoming"). KISS: make Location visually
   required-to-go-live (e.g. an inline "Will save as Incoming — pick a location to
   make it Available now" banner that updates live), or move it above the fold.
   *Frontend, low risk.*
3. **Retail price is mandatory even for not-yet-priced restock.** `submit` hard-
   blocks on a valid retail price, but Quick Add stamps `pricing_status:'approved'`
   regardless — so every quick-add silently *approves* pricing, bypassing the admin
   pricing gate that batches/coral honor. This is the biggest conceptual confusion:
   two intake paths have opposite pricing rules. KISS recommendation (needs
   sign-off, see below) — but a cheap interim: relabel the Quick Add price field
   and dialog copy to say "sets approved retail (admin path)" so staff understand
   what they're committing.
4. **Two near-identical "get/create today's quick-add batch" blocks** exist
   (`quickAddInventoryItem` and `bulkImportInventoryRows`, plus a third standalone
   `getOrCreateQuickAddBatch`). Extract one helper to remove drift. *Frontend/
   server-fn refactor, low risk, reuse-first per CLAUDE.md rule 1.*
5. **`batches.index.tsx` `NewBatchDialog` writes `vendor_batches` directly via the
   client** instead of a server fn — unlike every other mutation. Inconsistent and
   skips the `requireEditor` server check (RLS still applies). KISS: route it
   through a small `createVendorBatch` server fn for consistency. *Low risk.*

### Needs sign-off / bigger
6. **Reconcile the pricing-approval invariant across paths.** CLAUDE.md says
   "pricing approval is admin-only," and the batch/coral paths enforce it, but Quick
   Add inserts `pricing_status:'approved'` for any editor (the INSERT exemption in
   `inv_guard_pricing_approval` is deliberate but means floor staff effectively
   approve pricing). Decide intentionally: either (a) Quick Add is an
   admin-blessed shortcut (document it), or (b) Quick Add items should land
   `not_priced` and `incoming` until an admin approves — which would route restock
   through the same pricing gate. **Cross-lane decision** (product + possibly a
   Lovable trigger change if INSERT should also be gated). Risk: medium — changes
   the everyday restock UX.
7. **Unify the "add existing inventory" mental model.** Today a user must guess
   among Quick Add (restock), Coral Discovery (existing corals), and Batches
   (vendor receiving) with no single "I already have this item, log it" entry. For
   *existing* (non-vendor) stock the answer is "Quick Add for dry goods/fish, Coral
   Discovery for corals" — undiscoverable. KISS: one "Add existing stock" launcher
   that branches by item type to the right flow, or fold Coral Discovery's
   draft-only behavior into Quick Add as a "draft (needs review)" toggle so there's
   one form with one set of rules. **Needs sign-off** (touches navigation/component
   hierarchy — explicitly gated by CLAUDE.md rule 2). Risk: medium-high.

### DB hand-off (Lovable's lane) — only if option 6(b) is chosen
No migration is required for the dry-goods fix. *If* product decides Quick Add must
also honor the admin pricing gate on INSERT, spec for Lovable: extend
`guard_inventory_pricing_approval` (mig 20260610141205) to also fire `BEFORE INSERT`
and reject `pricing_status='approved'` from non-admins — and update the Quick Add
server fns to insert `not_priced`/`incoming`. Do not implement until signed off.
