# Development Log

Living record of what's been built, what was extra/unplanned, and what's still ahead. Append-only — newest day on top.

---

## 2026-06-05 (Sprint 2.5) — Roles + location mapping polish

Extended the role system so invites/role-assignment cover staff and viewers, and rebuilt the Store Locations page into a visual map: thumbnails, photo gallery per location, breadcrumb path, item counts, inline rename, reorder, and printable QR labels.

### Planned vs shipped

| Plan item | Status |
|---|---|
| Add `manager`, `staff`, `viewer` to `app_role` enum | Done |
| Treat `manager` as editor in `can_edit_content` | Done |
| `setUserRole` server fn + RoleSelect with descriptions | Done |
| Invite + active-user role dropdowns include all 6 roles | Done |
| `store_location_media` table + bucket RLS (`media/store-locations/*`) | Done |
| Photo gallery dialog (multi-upload, set primary, delete) | Done |
| Thumbnail rendered in tree row | Done |
| Breadcrumb path on each node | Done |
| Direct + subtree item count badge | Done |
| Inline rename (double-click) | Done |
| Up/down reorder siblings via `sort_order` | Done |
| Printable QR labels (one per active location, links to `/inventory?location=:id`) | Done |
| Delete location action in edit dialog | Done (extra) |

### Migrations

- `20260605020*_extend_role_enum_locations.sql` — `app_role` += manager/staff/viewer; `store_locations.sort_order`, `store_locations.primary_photo_url`; new `store_location_media` table + RLS; storage policies for `media/store-locations/*`.
- `20260605020*_can_edit_manager.sql` — `can_edit_content` now grants editor to `manager`.

### Files

- edited `src/lib/cms.functions.ts` — `ROLE_ENUM`, `setUserRole`, expanded enums on `approveUser`/`inviteUser`.
- edited `src/lib/ops.ts` — `APP_ROLES`, `APP_ROLE_LABELS`, `APP_ROLE_DESCRIPTIONS`.
- rewrote `src/routes/_app/settings.users.tsx` — `RoleSelect` w/ inline descriptions, role-change for active users.
- rewrote `src/routes/_app/store-locations.tsx` — tree thumbnails, breadcrumbs, counts, reorder, inline rename, `PhotoDialog`, `PrintLabelsButton`.
- added dep: `qrcode` (+ `@types/qrcode`).

### What's next (mirrors roadmap)

1. Sprint 3 — Photo-on-file wizard (single-photo intake for items already on the floor without a vendor batch).
2. Filter Inventory page by `?location=:id` so QR labels actually deep-link.
3. Drag-and-drop reorder + cross-parent move (current is up/down within siblings only).

---

## 2026-06-05 (Sprint 2) — Bulk paste import with dedupe


Pasted lists now go through a dedupe pass before insert. Each row is tagged New / Likely dup / Exact match against existing inventory; the user can choose Create new, Add qty to existing, or Skip per row, and apply all decisions in a single server call.

### Planned vs shipped

| Plan item | Status |
|---|---|
| `findInventoryDuplicates` server fn — name + scientific-name scoring vs existing items | Done |
| `bulkImportInventoryRows` server fn — atomic-ish per-row create / merge / skip, editor-gated | Done |
| Reuses today's Quick Add batch (same as single Quick Add) | Done |
| Merge path increments `quantity_available` + `quantity_received` and stamps notes | Done |
| Reviewable grid: per-row decision dropdown, candidate name + score + qty + price shown | Done |
| Shared photo required only when ≥1 row is set to Create | Done |
| Tally line ("X create · Y merge · Z skip") + summary toast on apply | Done |
| Vendor + location pickers apply to all rows | Done (existing) |

### Migrations

- None (pg_trgm already enabled in Sprint 1.6; scoring uses the same token-overlap helper as reconciliation).

### Files

- edited `src/lib/ops.functions.ts` — appended `findInventoryDuplicates` + `bulkImportInventoryRows`.
- edited `src/components/quick-add-fab.tsx` — rewrote `MarkdownBulk` with dedupe pass, per-row decision UI, and single-call bulk apply.

### What's next (unchanged order)

1. Sprint 3 — One-time photo-on-file wizard the first time an item is made Available.
2. Sprint 4 — Missing-price-tag export (CSV / printable sheet).
3. Full audit pass via browser automation.
4. Own-API-key option for AI parsing.
5. Barcode scan on receive.

---

## 2026-06-05 (later) — UX polish: mobile sidebar + flexible location nesting

Two setup-quality issues blocking real use of the app on the floor.

### Planned vs shipped

| Plan item | Status |
|---|---|
| Mobile-collapsible sidebar (Sheet drawer + hamburger top bar; desktop unchanged) | Done |
| Auto-close mobile drawer on route change | Done |
| Allow arbitrary nesting in `store_locations` (room → freezer → shelf → bin, etc.) | Done |
| New location kinds: `room`, `rack`, `shelf`, `bin`, `freezer`, `cooler` | Done |
| Recursive tree UI with expand/collapse + "Add inside" on container kinds | Done |
| Parent picker excludes self + own descendants (cycle-safe) | Done |

### Migrations

- `20260605_*` — `ALTER TYPE store_location_kind ADD VALUE` for room, rack, shelf, bin, freezer, cooler.

### Files

- edited `src/lib/ops.ts` — extended `STORE_LOCATION_KINDS`/labels, added `STORE_LOCATION_CONTAINER_KINDS`.
- rewrote `src/routes/_app/store-locations.tsx` — recursive tree, generalized dialog (any container can be a parent).
- edited `src/routes/_app.tsx` — extracted `SidebarBody`, desktop `aside` hidden on mobile, mobile `Sheet` drawer with hamburger header.

### What's next (unchanged order)

1. Sprint 2 — Bulk paste import with dedupe (next).
2. Sprint 3 — Photo wizard for Quick Add (camera-first capture).
3. Sprint 4 — Missing-tag export (printable list of inventory needing labels).

---

## 2026-06-05 — Sprint 1.6: Attach-PO-later reconciliation for Quick Add batches

When a restock is logged via Quick Add and the vendor PO/invoice shows up later, the user can now upload it onto the same batch and reconcile extracted PO lines against the inventory items they already created on the floor.

### Planned vs shipped

| Plan item | Status |
|---|---|
| Mark new Quick Add batches with `is_quick_add=true` (back-fill existing) | Done |
| `vendor_line_items.reconciliation_status` + `reconciled_inventory_item_id` + `reconciliation_notes` | Done |
| `promoteQuickAddBatchVendor` server fn (editor-gated, reassigns vendor on batch + on QA inventory items) | Done |
| `computeQuickAddReconciliation` server fn (token-overlap name match + scientific-name fallback, returns confirmed / suggested / unmatched PO / unmatched inv) | Done |
| `confirmReconciliation` server fn (matches, accept-PO-line, flag-missing, flag-extra; respects `inventory_items.source_vendor_line_item_id` UNIQUE) | Done |
| `ReconcileSection` UI on batch detail (visible only when `is_quick_add=true`) | Done |
| Vendor promotion combobox at top of section | Done |
| Reuse existing `extractBatchWithAI` for PO PDF parsing (no separate attach fn needed) | Done |
| pg_trgm extension enabled for future fuzzy queries | Done |

### Migrations

- `20260605_*_quick_add_po_reconciliation` — `vendor_batches.is_quick_add`, three `vendor_line_items` reconciliation columns + check constraint + index, back-fill of existing quick-add batches, `pg_trgm` extension.

### Files

- `src/lib/ops.functions.ts` — `promoteQuickAddBatchVendor`, `computeQuickAddReconciliation`, `confirmReconciliation`; `quickAddInventoryItem` + `getOrCreateQuickAddBatch` now set `is_quick_add: true`.
- `src/components/reconcile-section.tsx` — new section component with VendorPromote + ReconcileMatcher.
- `src/routes/_app/batches.$id.tsx` — import + render `<ReconcileSection>` above line items.

### Notes / decisions

- Matching is in-process JS (normalized token overlap + scientific-name fallback) since both sets are small per-batch. `pg_trgm` is installed for future use (e.g. searching across batches).
- Activity log uses `action: "updated"` with a `"PO line matched to Quick Add inventory item"` summary — the existing activity-action enum doesn't include a `reconciled` value and we didn't widen it this sprint.
- `confirmReconciliation` is idempotent: it re-runs the same selections safely, skipping items already linked to other lines.
- "Flag extras" appends a dated note to the inventory item rather than blocking it — it stays sellable.

---



## 2026-06-04 (late) — Sprint 1.5: Quick Add discoverability + vendor on the fly

Unblocking restock-as-you-go: empty inventory page hid the FAB, and Quick Add couldn't capture vendor.

### Shipped

| Area | Change |
|---|---|
| Quick Add FAB | Exported new `QuickAddButton` (inline-friendly variant), kept floating `QuickAddFab` unchanged. |
| Quick Add forms | Added `VendorPickerCombo` (searchable, quick-create) to Manual and Markdown bulk paths. |
| Server fn | New `quickCreateVendor` (editor-gated, slug auto-gen, case-insensitive dedupe). |
| Server fn | Extended `quickAddInventoryItem` input with optional `source_vendor_id`; writes to `inventory_items.vendor_id` so restocked items record actual source instead of the "quick-add" batching vendor. |
| Inventory list | Header-right `Quick Add` button + real empty state with `Quick add an item` and `Open vendor batches` actions. |

### Files

- `src/lib/ops.functions.ts` — added `quickCreateVendor`, extended `quickAddInventoryItem`.
- `src/components/quick-add-fab.tsx` — `QuickAddButton`, `VendorPickerCombo`, vendor state threading.
- `src/routes/_app/inventory.index.tsx` — header button + empty state.

No schema migration — used existing `vendors` + `inventory_items.vendor_id` columns.

---

## 2026-06-04 — Sprint 1: OCR / image tagging on photo upload

### Planned
| Item | Status |
|---|---|
| Extend `parseTagPhoto` to return raw label text + auto-detected `has_price_tag` | Done |
| Cache OCR results on `inventory_media` (`ocr_text`, `ocr_extracted_at`) | Done |
| Auto-run OCR on each new photo uploaded in inventory detail Media section | Done |
| "Re-run AI extraction" button per image tile | Done |
| Surface OCR'd text + `tag ✓` badge in media tiles | Done |
| Quick Add FAB already wired to `parseTagPhoto` (no change needed) | Verified |

### Migrations
- `*_inventory_media_ocr_cache` — add `ocr_text`, `ocr_extracted_at` to `inventory_media`

### Notes
- OCR runs best-effort on upload (failures don't block the upload, just skip).
- `has_price_tag` is auto-set from AI detection — overrides the upload-form checkbox when AI is confident.

---


## 2026-06-04 — DOA enforcement, audit trail, Quick Add

### Planned (from earlier asks today)
- Audit trail for each receive action (received qty, lost qty, location, 3× retail) with timestamp + user
- DOA toast prompting mandatory in-bag and on-lid photos (wholesaler requirement)
- Server-side enforcement of DOA photo requirement
- Quick Add for restocking livestock + dry goods (photo / markdown / manual)
- Missing-photo prompt across the app

### Shipped
- `vendor_line_receive_logs` table — full audit row per receive action (actor, timestamp, before/after of received, lost, reason, location, override retail)
- `vendor_line_doa_photos` table + `guard_vli_doa_photos` trigger — DB-level block on DOA tag without both `in_bag` and `on_lid` photos
- `receiveBatchLines` server pre-check — atomic fail before any writes if any DOA line is missing required photos
- DOA capture UI on batch detail with toast prompts
- Quick Add FAB in global `_app` layout → `getOrCreateQuickAddBatch` (one batch per user per day under auto-vendor `quick-add`)
- `quickAddInventoryItem` server fn — creates vendor_batch + inventory_item + inventory_media in one shot
- `parseTagPhoto` (Gemini 2.5 Flash vision) — extracts name / scientific name / type / retail price from a tag or label photo
- `parseInventoryMarkdown` — bulk markdown → reviewable grid → bulk insert
- `inventory_media.has_price_tag` flag on primary photos
- `guard_inventory_photo_required` trigger — blocks `availability_status='available'` without ≥1 photo
- Missing-photo banner on `inventory.$id` (red when item is "Available", amber otherwise)

### Migrations
- `20260604222946_*` — receive audit log + DOA photos table
- `20260604223452_*` — DOA photo guard trigger
- `20260604224211_*` — quick-add vendor + inventory photo guard + `has_price_tag`

---

## 2026-06-03 — Intake foundation (from `.lovable/plan.md`)

### Planned vs. shipped
| Plan item | Status |
|---|---|
| `item_type` enum on vendor_line_items + inventory_items | Done |
| `suggested_retail_3x` generated column (wholesale × 3) | Done |
| `received_at` / `received_by` on inventory_items | Done |
| `store_locations` — `parent_location_id` + `zone` kind | Done |
| `received_quantity` / `lost_quantity` / `loss_reason` / `assigned_location_id` on vendor_line_items | Done |
| `listLocationsTree` server fn | Done |
| `upsertLocation` server fn | Done |
| `receiveBatchLines` server fn (editor-gated, atomic per-row) | Done |
| `convertLineItemsToInventory` extended (copies type, location, received_at/by) | Done |
| `inviteUser` admin-only via `supabaseAdmin.auth.admin.inviteUserByEmail` | Done |
| Settings → Locations page (zone/tank tree, add/edit) | Done — built as `/_app/store-locations` (flat route) |
| Settings → Users invite modal | Done |
| Batch detail "Receive shipment" mode (qty, lost, reason, location, 3× retail, override) | Done |
| Safety rules preserved (no AI write to pricing/review/inventory) | Done |
| Roadmap memory file | Done — `mem://features/intake-roadmap` |

### Migrations
- `20260603181448_*` — earlier intake schema baseline
- `20260603202651_*` — item_type enum, zones, receive columns, suggested_retail_3x

---

## What's next (ordered)

From `mem://features/intake-roadmap` — kept in sync as items ship:

1. Sprint 2 — Bulk paste import with dedupe (from earlier roadmap of feature sprints)
2. Sprint 3 — One-time photo-on-file wizard the first time an item is made Available
3. Sprint 4 — Missing-price-tag export (CSV / printable sheet of items without a tag photo)
4. Full audit pass using browser automation, tracked in an audit doc
5. Own-API-key option for AI parsing (user-provided OPENAI/GEMINI key preferred over `LOVABLE_API_KEY`)
6. Barcode scan on receive (`getUserMedia` + ZXing) → `vendor_item_id` lookup
7. Customer-facing inventory search (public read-only catalog filtered by `availability='available'`)
8. Per-type fields: coral fragging metadata, dry-good SKU/UPC, fish size/sex/age
9. Pricing approval queue showing market-rate overrides with reason
10. Bulk-add: per-row photo upload instead of a single shared photo
11. Clover POS sync — out of scope until inventory flow is stable


## Standing rules (in force)
- AI cannot approve pricing, mark review approved, convert to inventory, or create `inventory_items`
- All mutating server fns gated by `requireEditor` or admin-only check
- Convert requires `review=approved` AND `pricing=approved` AND admin role
- Inventory item cannot be `available` without at least one photo (DB trigger)
- DOA tag requires both in-bag and on-lid photos (DB trigger + server pre-check)
