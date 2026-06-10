# Development Log

Living record of what's been built, what was extra/unplanned, and what's still ahead. Append-only — newest day on top.

---

## 2026-06-10 — DB hardening: admin-only inventory pricing approval (Lovable / DB lane)

Hand-off `handoff-coral-review.md` item 1 — shipped.

- New migration adds `public.guard_inventory_pricing_approval()` + `inv_guard_pricing_approval` trigger on `inventory_items`.
- **`BEFORE UPDATE OF pricing_status` only.** Fires when pricing is being changed *to* `approved` from a non-approved value by a non-admin → `RAISE EXCEPTION` (`check_violation`, "Only admins can approve inventory pricing"). INSERT path is intentionally untouched so Quick Add / bulk-import (non-admin editor restock that inserts items already `pricing_status='approved'`) keeps working.
- Function is `SECURITY DEFINER`, `search_path = public`, `EXECUTE` revoked from PUBLIC/anon/authenticated — trigger context only.
- Mirrors the existing `guard_vli_pricing_approval` pattern on vendor lines.

Hand-off item 2 — **confirmed, no change needed.** `inventory-media` bucket RLS (migration `20260526235115`) is path-agnostic: editor INSERT/SELECT/UPDATE policies only check `bucket_id` + `can_edit_content(auth.uid())`, so `coral-discovery/` (and any future prefix) is already covered, same as the working `quick-add/` prefix.

### Frontend review (PR #4, no DB dependency)
- `approveInventoryPricing` admin-gated in the server fn (`isAdmin` + `requireActive`) — consistent with the new DB trigger; trigger is defence-in-depth.
- "Take live" path goes through `setInventoryAvailability` → `available`, which still hits `inv_guard_gates` (price + retail + location + qty) and `guard_inventory_photo_required` (photo). Invariants intact.

### Linter / out-of-scope
- Migration introduced 0 new lint findings (new function is `EXECUTE`-revoked).
- 11 pre-existing warns remain (10× SECURITY DEFINER `EXECUTE` exposure on `has_role`, `is_active_user`, `can_edit_content`, `handle_new_user`, `log_inventory_activity`, `touch_updated_at`, and the four existing `guard_*` triggers; 1× `pg_trgm` in `public`). Not part of this hand-off — flag if you want a hardening pass.

---

## 2026-06-09 — Coral Inventory Discovery (capture tool)

Kicks off the "Next phase — Coral Inventory Discovery (manual)" item from below. The field-audit concluded a coral can be entered today with no migration; this turns that into a single purpose-built screen so a tank can be catalogued in one sitting instead of clicking through the generic Quick Add for every frag.

New `/inventory/coral-discovery` page (linked in the Inventory nav group, Waves icon):

- **System picker** lists coral-holding locations first (`coral_system / coral_flat / frag_tank / growout_tank / live_sale_tank / display_tank`), with a "Show all locations" toggle. Defaults to the first coral system (e.g. C-40100). Shows live coral count + per-role breakdown for the selected system.
- **Capture form** optimised for rapid repeated entry down a rack: optional camera photo, common name (autofocus), **plug / rack tag** (the 3D-printed plug codes — B3, X3, H8 — that mark exactly where a coral sits), scientific name, inventory role, coral type, optional price, quantity / frag count, notes. "Save & next" keeps the role + type set and refocuses the name field; an admin-free Clear resets everything.
- **Plug tagging** is the headline of the discovery workflow: the tag is normalized to uppercase, stored in `attrs.rack_position` (also added to the coral schema in `item-type-attrs.ts`, so it renders on the item detail page too), and the form warns if a plug is already tagged in the selected system so the same coral isn't logged twice. The system panel shows a live "N plugs tagged" count.
- **Session log** keeps a running list of what was logged this page-load (with plug codes); **"Already in this system"** shows existing corals in the picked location with their plug codes. Both deep-link to `/inventory/$id`.

### Invariants respected (review before live)

Discovery creates **draft** coral `inventory_items` only — it can never push a coral live on its own:

- `pricing_status` stays `not_priced` (discovery never approves pricing — admin still does).
- Nothing is set to `available` here. Role → draft availability: `for_sale → incoming`, `hold → on_hold`, `growout / mother_colony / frag_source → not_for_sale`. The intended role is recorded in `attrs.inventory_role` (and `attrs.coral_type`), matching the existing coral schema in `item-type-attrs.ts`.
- Photo is optional at capture (sets `needs_photo`), but the existing DB trigger still blocks `available` until a photo is on file — so the photo gate is preserved when an admin later promotes the item.

### Migrations

- None. Pure UI + two server fns on existing tables (`inventory_items`, `inventory_media`, `inventory_activity_logs`, `store_locations`).

### Files

- new `src/routes/_app/inventory.coral-discovery.tsx` — page, system picker, capture form (incl. plug/rack tag + duplicate warning), session log.
- edit `src/lib/ops.functions.ts` — `catalogCoralItem` (editor-gated draft create + plug tag + photo + activity log) and `getCoralDiscoveryOverview` (systems, per-location/role counts, plug positions in use, recent corals).
- edit `src/lib/item-type-attrs.ts` — `rack_position` field on the coral schema (shows on item detail page).
- edit `src/routes/_app.tsx` — "Coral Discovery" nav item under Inventory.

### What's next

1. Surface `inventory_role` as a column on `/inventory` when `type=coral` is filtered (small, code-only — the audit's optional step).
2. A reviewer pass to promote `incoming` for-sale corals (price + photo + availability) — could reuse the pricing queue once it covers inventory items, not just vendor lines.

---

## 2026-06-05 (Sprint 7) — Intake capture upgrades

Two long-standing intake pain points are closed: receiving a big shipment no longer requires line-by-line typing, and bulk-add no longer forces a single "shared" photo across heterogeneous rows.

Receive flow now has a **Scan** button on `ReceiveSection` that opens a camera-based ZXing reader (`@zxing/browser`). Each successful decode is matched case-insensitively against `vendor_line_items.vendor_item_id` on the current batch only; matches optionally `+1` the row's `received_quantity` (toggle in the scan dialog), toast-confirm, and smooth-scroll the matched `<tr id="receive-row-:id">` into view with a brief target highlight. Duplicate codes within 1.5s are debounced so a sticker held in frame doesn't double-count. Unknown codes are listed in the scan log so the receiver can spot mislabeled items without leaving the dialog.

Bulk-add (Quick Add → Create rows) now supports **per-row photos**. Each Create row gets its own photo slot; the existing shared photo picker stays but is re-labeled as the **fallback** used only for rows that don't pick their own. `bulkImportInventoryRows` server fn accepts optional `photo_path` + `photo_file_name` per row and prefers them over `shared_photo_path` at apply time. Per-row uploads run in parallel before the mutation fires.

### Planned vs shipped

| Plan item | Status |
|---|---|
| Barcode scan on receive (ZXing camera reader) | Done |
| Match by `vendor_item_id` within current batch (case-insensitive) | Done |
| Auto-increment `received_quantity` on match (toggleable) | Done |
| Scroll matched row into view + highlight | Done |
| Debounce duplicate codes in-frame | Done |
| Per-row photo on Quick Add Create rows | Done |
| Shared photo demoted to "fallback" role | Done |
| `bulkImportInventoryRows` accepts per-row `photo_path` | Done |
| Parallel per-row uploads | Done |
| `id={receive-row-${l.id}}` on receive `<tr>` for scroll targeting | Done |
| USB/Bluetooth HID barcode wedge support (no camera) | Deferred (covered today because most HID scanners type into a focused input, but we should still add a dedicated capture input next sprint) |
| Save scan history to DB for audit | Deferred (in-memory only; receive logs already capture the qty delta) |

### Migrations

- None. Pure UI + serverFn payload additions on existing tables.

### Files

- new `src/components/barcode-scan-dialog.tsx` — ZXing reader, debounce, match list, auto-increment toggle.
- edit `src/components/quick-add-fab.tsx` — `RowPhotoSlot`, parallel uploads, shared-as-fallback wording.
- edit `src/lib/ops.functions.ts` — `bulkImportInventoryRows` accepts `photo_path` / `photo_file_name` per row.
- edit `src/routes/_app/batches.$id.tsx` — Scan button on `ReceiveSection`, `onMatch` handler, `id="receive-row-:id"` + `scroll-mt-24 target:bg-amber-50` for scroll targeting.
- add dep `@zxing/browser`.

### What's next (mirrors roadmap)

1. Sprint 8 — Per-type fields (coral / dry_good / fish JSONB `attrs`) + pricing approval queue.
2. Sprint 9 — AI parsing bring-your-own key (OpenAI / Gemini), fallback to Lovable AI Gateway.
3. Sprint 10 — Static + browser automation audit, then Clover POS read-sync.
4. Sprint 7 follow-up — HID barcode wedge input + persisted scan history for receive audit.

---



## 2026-06-05 (Sprint 6 · part 2) — Public `/catalog` route

Customers (and anyone with a scanned label URL) can now browse what's in stock without signing in. New top-level `/catalog` route, no auth gate, SSR. Pulls `availability_status='available'` items that have `quantity_available > 0`, `retail_price > 0`, and at least one photo on file — same trust gate the photo-on-file wizard already enforces. Accepts the exact same `?location=`, `?descendants=1`, `?type=` query params as `/inventory`, so QR labels printed for staff also work as public catalog deep links. Includes debounced search by name / scientific name, type filter, active-filter chips, and lazy-loaded image grid.

Server function `getPublicCatalog` is unauthenticated and uses `supabaseAdmin` (dynamic import inside the handler) with a tightly scoped projection — no wholesale cost, no vendor, no internal status fields ever leave the server. Photos are returned as 1-hour signed URLs, preferring `website` > `social`/`live_sale` > `internal` tag when an item has multiple shots.

### Planned vs shipped

| Plan item | Status |
|---|---|
| Public `/catalog` route, no auth, SSR-friendly | Done |
| `getPublicCatalog` server fn (admin client, sanitized projection) | Done |
| Filters: search, type, location (+ descendants), URL-driven | Done |
| Photo-first grid; items without photos are hidden | Done |
| Reuses QR label format from Sprint 6 · part 1 (zero label changes) | Done |
| SEO head() with og:title / og:description / twitter tags | Done |
| Customer-facing QR variant pointing at `/catalog` | Deferred (existing labels work; revisit if shop wants outward-facing signage) |

### Migrations

- None. Pure read path through `supabaseAdmin` with safe column projection.

### Files

- new `src/lib/catalog.functions.ts` — `getPublicCatalog` server fn (admin client, descendant resolver, signed-URL batching).
- new `src/routes/catalog.tsx` — public route, validateSearch, filter UI, photo grid, og tags.

### What's next (mirrors roadmap)

1. Sprint 7 — Intake capture upgrades (barcode scan on receive, bulk-add per-row photo).
2. Sprint 8 — Per-type fields (coral/dry_good/fish) + pricing approval queue.
3. Sprint 9 — AI parsing bring-your-own key (OpenAI / Gemini).
4. Sprint 10 — Static + browser automation audit, then Clover POS sync.

## 2026-06-05 (Sprint 6 · part 1) — QR deep-linking on `/inventory`

Printed QR labels now actually do something useful when scanned. `/inventory` accepts `?location=:uuid`, `?descendants=1`, and `?type=:itemType` search params, filters the list server-side, and shows clearable filter chips with the resolved location name + a one-click toggle to include sub-locations. The QR label generator on `/store-locations` encodes `descendants=1` automatically for container kinds (zone/room/rack/shelf/freezer/cooler) so scanning a "Coral Room" label shows everything inside it, not just items directly tagged to the room itself.

### Planned vs shipped

| Plan item | Status |
|---|---|
| `validateSearch` on `/inventory` with zod (`location`, `descendants`, `type`) | Done |
| Filter inventory query by `location_id` (single or via `IN (descendants)`) | Done |
| Filter inventory query by `item_type` | Done |
| Active-filter chips with location name + clear + toggle descendants | Done |
| Empty-state copy adapts when filters are active | Done |
| QR label URL encodes `&descendants=1` for container kinds | Done |
| Public `/catalog` route | Deferred to Sprint 6 · part 2 |
| Barcode scan on receive | Sprint 7 |

### Migrations

- None.

### Files

- edited `src/routes/_app/inventory.index.tsx` — validateSearch, descendant resolver, filter chips, type filter, shared locations query.
- edited `src/routes/_app/store-locations.tsx` — QR URL includes `&descendants=1` for container kinds.

### What's next (mirrors roadmap)

1. Sprint 6 · part 2 — Public `/catalog` (read-only, no auth, available items with photos).
2. Sprint 7 — Intake capture upgrades (barcode scan on receive, bulk-add per-row photo).
3. Sprint 8 — Per-type fields (coral/dry_good/fish) + pricing approval queue.
4. Sprint 9 — AI parsing bring-your-own key (OpenAI / Gemini).
5. Sprint 10 — Static + browser automation audit, then Clover POS sync.



## 2026-06-05 (Sprint 5) — Dashboard stock value by category

Owner wanted a glance-level read on where money is tied up. Replaced the single "Stock value" KPI on `/dashboard` with a category breakdown: Livestock (fish + invert + live_rock), Coral, and Dry goods (dry_good + equipment). Total + "Other" footnote shown in the section header. Aggregation done server-side in `getShopOverview` to keep it cheap.

### Planned vs shipped

| Plan item | Status |
|---|---|
| Extend `getShopOverview` to return per-category stock value | Done |
| Replace single "Stock value" KPI with Livestock / Coral / Dry goods row | Done |
| Keep total stock value visible (now section subtitle + "Total stock value" KPI in glance row) | Done |
| Link each category KPI to `/inventory` (deep-link by `?type=` lands in Sprint 6) | Done |

### Migrations

- None.

### Files

- edited `src/routes/_app/dashboard.tsx` — server fn aggregates by `item_type`; new "Stock value by category" section.

### What's next (mirrors roadmap)

1. Sprint 6 — QR deep-linking + customer-facing catalog (`?location=`, `?type=`, public `/catalog`).
2. Sprint 7 — Intake capture upgrades (barcode scan on receive, bulk-add per-row photo).
3. Sprint 8 — Per-type fields (coral/dry_good/fish) + pricing approval queue.
4. Sprint 9 — AI parsing bring-your-own key (OpenAI / Gemini).
5. Sprint 10 — Static + browser automation audit, then Clover POS sync.

---

## 2026-06-05 (Sprint 3) — Photo-on-file wizard

When someone tries to flip an item to Available without a photo on file, a modal now intercepts the change, captures a single photo (camera on mobile, file on desktop), uploads it, and then completes the availability change automatically. Works from both the inventory list row and the item detail page; the existing DB trigger (`guard_inventory_photo_required`) remains the source of truth.

### Planned vs shipped

| Plan item | Status |
|---|---|
| Reusable `PhotoOnFileWizard` dialog (camera capture, preview, retake, has-price-tag flag) | Done |
| `inventoryHasPhoto(id)` helper (single round-trip check) | Done |
| Intercept Availability → "Available" on inventory detail `ControlsCard` | Done |
| Intercept Availability → "Available" on inventory list row | Done |
| Auto-clear `needs_photo` + best-effort OCR on upload | Done |
| Apply pending availability change after successful upload | Done |

### Migrations

- None. Storage bucket + RLS + photo-required trigger were already in place.

### Files

- created `src/components/photo-on-file-wizard.tsx` — modal + `inventoryHasPhoto` helper.
- edited `src/routes/_app/inventory.$id.tsx` — `ControlsCard` gates availability changes through the wizard.
- edited `src/routes/_app/inventory.index.tsx` — `InventoryRow` gates availability changes through the wizard.

### What's next (mirrors roadmap)

1. Sprint 4 — Missing-price-tag export (CSV / printable sheet).
2. Filter Inventory page by `?location=:id` so QR labels actually deep-link.
3. Full audit pass via browser automation, tracked in an audit doc.
4. Own-API-key option for AI parsing.
5. Barcode scan on receive (getUserMedia + ZXing).
6. Customer-facing inventory search.

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

## Sprint 8 — Per-type fields (2026-06-05)

**Planned:** JSONB per-type attributes + pricing approval queue polish.

**Shipped:**
| Area | Change |
|---|---|
| Schema | `inventory_items.attrs jsonb NOT NULL DEFAULT '{}'`, same on `vendor_line_items`; GIN indexes for lookup |
| Schema definitions | `src/lib/item-type-attrs.ts` — per-type field groups for fish (care/swim zone/reef-safe), coral (type/lighting/flow/placement/aggression), invert, live_rock, dry_good (brand/SKU/UPC/expiry), equipment (brand/model/serial/wattage/warranty), other |
| UI | `src/components/attrs-editor.tsx` — schema-driven form (text/number/select/boolean); dirty-state save button |
| UI | `PerTypeCard` on `/inventory/:id` with item-type selector + auto-loaded fields |
| Server | `updateInventoryAttrs`, `updateInventoryItemType` server fns (editor-gated, zod-validated) |
| Pricing queue | `/pricing-approval` was already shipped — admin-gated approve, hooked to `approveLinePricing` |

**Deferred (Sprint 8 follow-up):** vendor line item per-type editor during intake review, expose `attrs` on `/catalog` projection, server-side filters on `/inventory` by attribute (e.g. `?attr.reef_safe=yes`).

---

## Sprint 9 — Bring-Your-Own AI keys

The whole intake stack (`aiExtractInvoice`, `parseTagPhoto`, `parseInventoryMarkdown`) hard-coded the Lovable AI Gateway. That meant any rate limit, credit issue, or "use my own paid OpenAI quota" preference forced us to redeploy. Sprint 9 fixes that without changing any feature behavior.

### What shipped

| Layer | Change |
|---|---|
| DB | `workspace_ai_settings` (singleton, admin-only RLS, GRANT/RLS/trigger), seeded with `provider='lovable'` so existing code paths keep working |
| Helper | `src/lib/ai-call.server.ts` — `callAIChat({ tier, lovableModel, messages, tools, tool_choice })` resolves provider → OpenAI (`api.openai.com`) / Gemini (OpenAI-compat `generativelanguage.googleapis.com/v1beta/openai`) / Lovable Gateway, surfaces upstream status as `e.status`, optionally falls back to Lovable, and records `last_used_at/provider/error` |
| Server fns | `getAISettings` (masked), `updateAISettings` (clear-with-empty-string, leave-alone-with-undefined), `testAISettings` (ping → "pong") — all admin-gated via `requireAdmin` |
| Refactor | All three AI call sites now use `callAIChat` with explicit `tier: "pro"` for invoice extraction and `tier: "flash"` for label/list parsing; user-facing errors mention Settings → AI |
| UI | `/settings/ai` admin page: provider switch (locks providers without a stored key), masked-key inputs with "leave blank to keep existing" semantics, per-tier model overrides, fallback toggle, **Send test ping** button, last-call/last-error panel |
| Nav | Added "AI keys" entry under Settings, admin-only |

### Security posture

Keys live in `workspace_ai_settings`, RLS = admin-only. The Data API never returns raw keys to non-admins. `getAISettings` returns masked values (first 4 + last 4). The settings table is touched only via `supabaseAdmin` from server fns that themselves run `requireAdmin(supabase, userId)` — so a non-admin can't bypass the masking via the server fn either. The new `last_error` column avoids leaking the key itself — only the upstream response status / message snippet.

### Deferred (Sprint 9 follow-up)

- Per-feature provider override (e.g. always Gemini Pro for invoices regardless of default provider)
- Persisted AI usage log (per call: feature, provider, model, tokens, latency, cost estimate)
- Show fallback warnings inline in the UI when an intake call quietly fell back to Lovable

## Facility Mapping — LOCKED (2026-06-06)

The `store_locations` tree is now the **source of truth** for the physical shop. No further structural changes without a new mapping cycle.

| Item | Status |
|---|---|
| Facility map seeded (Migration B + correction migration) | Done |
| Official names / kinds / aliases corrected | Done |
| Parent/child hierarchy verified (Migration C unnecessary — already wired) | Done |
| Zones mapped: Retail Floor, Showroom (Support / Fish Systems / Coral Systems / Display Systems), Quarantine, Warehouse/Storage | Done |
| Fish-system towers (S-2000/3000/4000/5000 → T1..T4) parented correctly | Done |
| Coral growout (C-40100..40400) as leaves under Coral Systems | Done |
| Planned QT towers (Q-30400, Q-30500) remain `planned=true, is_active=false` | Done |
| 3 original seed rows untouched | Done |
| 8 existing inventory assignments unchanged | Done |
| `system_group_id` correct on fish systems | Done |

**Standing rule:** no Clover sync, no storage-unit work, no bulk automation until the next phase explicitly approves it.

---

## Next phase — Coral Inventory Discovery (manual)

First target system: **C-40100 — LPS Growout Tank** (alias: Big Frag Tank).

Workflow (manual, no automation yet):

1. Identify coral system (start with C-40100)
2. Capture photos / short videos
3. Record coral name if known (common + scientific)
4. Record **sale status**: `for_sale | not_for_sale | growout | mother_colony | frag_source | hold`
5. Record price if known
6. Record quantity / frag count if applicable
7. Assign `location_id` from the existing `store_locations` tree
8. Prepare a clean review batch — **no inserts** until reviewed

**Out of scope for this phase:** Clover sync, bulk import automation, dry goods, fish, storage units.

---

## Coral Inventory Intake — current-state field audit

Question: can a coral item be entered cleanly **today** via the Workspace, without schema or UI changes?

### What is already covered by `inventory_items`

| Need | Field today | OK? |
|---|---|---|
| Coral common name | `item_name` | ✅ |
| Scientific name | `scientific_name` | ✅ |
| Item type = coral | `item_type` enum includes `coral` | ✅ |
| Location | `location_id` → `store_locations` (C-40100 exists) | ✅ |
| Price | `retail_price` + `pricing_status` (admin-approved) | ✅ |
| Quantity / frag count | `quantity_received` / `quantity_available` (numeric) | ✅ |
| Photos / video | `inventory_media` table + Photo-on-File wizard | ✅ |
| Notes | `notes` | ✅ |
| Vendor / lineage source | `vendor_id`, `source_vendor_line_item_id`, `source_vendor_batch_id` | ✅ |
| Per-type coral attrs (type/lighting/flow/placement/aggression/frag size/aquacultured) | `attrs` JSONB + `coral` schema in `src/lib/item-type-attrs.ts` | ✅ |
| Receive metadata | `received_at`, `received_by` | ✅ |

### Sale-status mapping — partial gap

The requested sale-status vocabulary maps onto **two** existing dimensions:

| Requested value | Maps to today | Notes |
|---|---|---|
| `for_sale` | `availability_status = 'available'` | Requires photo + approved price + location (existing guards) |
| `not_for_sale` | `availability_status = 'not_for_sale'` | ✅ |
| `hold` | `availability_status = 'on_hold'` | ✅ |
| `growout` | ❌ no enum value | Could be stored as `availability_status='not_for_sale'` + `attrs.inventory_role='growout'` |
| `mother_colony` | ❌ no enum value | Same — needs an inventory-role concept |
| `frag_source` | ❌ no enum value | Same — needs an inventory-role concept |

**Inventory role** is the missing concept. `availability_status` answers "can a customer buy it?" but the coral-discovery workflow also needs to record **why** a non-saleable colony is in the system (growout vs mother vs frag source).

### Recommendation

**Coral inventory CAN be entered today**, with one small caveat:

- For `for_sale` / `not_for_sale` / `hold` → use existing `availability_status` directly.
- For `growout` / `mother_colony` / `frag_source` → record under `attrs.inventory_role` (free text) until a dedicated UI is built. The coral attrs editor (`PerTypeCard` on `/inventory/:id`) already renders arbitrary attr fields, so we can extend the coral schema in `src/lib/item-type-attrs.ts` with a single select field — **code-only change, no migration**.

**Tiny pre-work proposed before discovery starts (≤30 min):**

1. Add `inventory_role` select to `coral` schema in `src/lib/item-type-attrs.ts` with options `for_sale | growout | mother_colony | frag_source | hold` (mirrors the workflow vocabulary; `availability_status` handles the customer-facing toggle).
2. Optional: surface `inventory_role` as a column on `/inventory` when `type=coral` is filtered.

No DB migration. No Clover. No bulk import. Discovery can begin on C-40100 immediately after step 1.
