# Intake & Inventory Plan

## Shipped

### Sprint 1.5 — Quick Add polish
- QuickAddButton inline on `/inventory` header + real empty state
- VendorPickerCombo inside Quick Add (search existing + inline create)
- `quickCreateVendor` server fn with case-insensitive dedupe
- Field order in Manual form mirrors restock flow

### Sprint 1.6 — Attach-PO-later reconciliation
- `vendor_batches.is_quick_add` flag
- `vendor_line_items.{reconciliation_status, reconciled_inventory_item_id, reconciliation_notes}`
- Server fns: `promoteQuickAddBatchVendor`, `computeQuickAddReconciliation`, `confirmReconciliation`
- ReconcileSection UI on batch detail

### Sprint 2 — Dedupe-aware bulk import
- `findInventoryDuplicates` + `bulkImportInventoryRows` server fns
- Per-row decision: Create / Merge / Skip with name+sci scoring
- Merge increments quantity; shared photo required when any Create row exists

### Sprint 2.5 — Roles + Location Mapping polish
- Extended `app_role` enum: admin, manager, staff, viewer
- `setUserRole` server fn + RoleSelect UI (invite + inline change)
- `store_location_media` table + photo gallery + star-for-thumbnail
- Location tree: thumbnails, breadcrumbs, item counts, inline rename, reorder siblings, printable QR labels
- Mobile-collapsible sidebar (Sheet drawer)
- `store_locations` supports arbitrary nesting with kinds: room, rack, shelf, bin, freezer, cooler

### Sprint 3 — Photo-on-file wizard
- `PhotoOnFileWizard` dialog: camera/file capture, preview, price-tag toggle, auto-upload to `inventory-media`
- Intercepts availability_status → `available` when no photo on file
- Wired into `inventory.$id` ControlsCard and `inventory.index` InventoryRow
- `guard_inventory_photo_required` trigger enforced at DB level

### Sprint 4 — Missing-price-tag export
- `/inventory/missing-tags` page: grouped by location, shows items lacking `has_price_tag=true`
- Print + Download CSV buttons
- Linked from `/inventory` header

### Sprint 5 — Dashboard stock value by category
- `getShopOverview` aggregates stock value by `item_type` server-side
- `/dashboard` shows Livestock / Coral / Dry goods KPIs + total + "Other" footnote

## Current priority queue (re-prioritized)

1. **QR deep-linking + customer catalog** — `/inventory?location=:id&descendants=1&type=:t` filtering ✅ (part 1 shipped 2026-06-05); public `/catalog` route still pending (part 2)
2. **Intake capture upgrades** — Barcode scan on receive (ZXing) + per-row photo on bulk add
3. **Per-type fields + pricing approval queue** — JSONB `attrs` per item_type; admin override review UI
4. **AI parsing bring-your-own key** — Workspace OpenAI/Gemini key, fallback to Lovable AI Gateway
5. **Audit + Clover** — Static + browser automation audit, then Clover POS read-sync

## Invariants (never override)

- AI is draft-only on intake: cannot approve pricing, mark review approved, convert to inventory, or create `inventory_items`.
- All mutating server fns check `is_active` + role (`requireEditor` for editors, `isAdmin` for admin-only).
- Pricing baseline is 3× wholesale. Admin must approve before live; override supported per line.
- Inventory item cannot be `available` without at least one photo (DB trigger + UI intercept).
- Convert requires `review=approved` AND `pricing=approved` AND admin.
