
# Phase 1 — Inventory Intake (Operations module) — revised

Real workflow: staff uploads a vendor invoice → reviews draft line items → boss approves retail prices → approved sellable lines convert to inventory → inventory gets a physical location and availability/live-sale status. Charges (freight, heat packs, tax, etc.) stay on the batch, never become inventory.

Revisions vs. v1 (all incorporated below):
1. `vendor_line_items.sell_price` → `vendor_sell_price`.
2. `vendor_batches.source_document_type` added.
3. `vendor_line_items.extraction_confidence` added (numeric, nullable).
4. `inventory_live_sale_status` enum: `not_eligible`, `eligible`, `staged`, `live`, `ended`.
5. `inventory_availability_status` enum gains `needs_id`.
6. `inventory_availability_status` uses `dead_lost` (and UI label "Dead / Lost").
7. Sidebar keeps the "Inventory Intake" label, but it links to `/batches` (Vendor Batches).

## 1. Database (one migration, awaiting your approval)

### Enums
- `vendor_batch_source_document_type`: `invoice`, `order_sheet`, `packing_list`, `manual_entry`, `other`
- `vendor_batch_intake_status`: `draft`, `uploaded`, `parsing`, `review`, `approved`, `converted`, `archived`
- `vendor_batch_extraction_status`: `not_started`, `manual`, `ai_pending`, `ai_done`, `failed`
- `vendor_line_review_status`: `pending`, `approved`, `rejected`, `needs_info`
- `vendor_line_pricing_status`: `not_priced`, `suggested`, `approved`
- `vendor_line_kind`: `sellable`, `charge`
- `vendor_batch_charge_type`: `freight`, `packaging`, `heat_pack`, `box`, `fuel_surcharge`, `discount`, `credit`, `tax`, `other`
- `inventory_availability_status`: `incoming`, `quarantine`, `needs_id`, `available`, `on_hold`, `sold_out`, `not_for_sale`, `dead_lost`
- `inventory_pricing_status`: `not_priced`, `approved`
- `inventory_live_sale_status`: `not_eligible`, `eligible`, `staged`, `live`, `ended`
- `store_location_kind`: `display_tank`, `coral_flat`, `live_sale_tank`, `quarantine`, `holding`, `dry_goods`, `back_of_house`, `other`
- `inventory_media_tag`: `internal`, `social`, `website`, `live_sale`
- `inventory_activity_action`: `created`, `updated`, `status_change`, `location_change`, `quantity_change`, `pricing_change`, `converted_from_line`, `note`

### Tables (domain fields only; standard id / created_at / updated_at on all)

- **vendors** — name, slug (unique), is_active, contact_name, contact_email, contact_phone, website, address, default_terms, default_carrier, notes.
- **store_locations** — name, slug, kind, is_active, is_live_sale (bool), capacity_notes, notes.
- **vendor_batches** — vendor_id, **source_document_type** (default `invoice`), invoice_number, order_number, po_number, sales_order_number, customer_number, invoice_date, ship_date, arrival_date, tracking_number, awb_number, carrier, terms, pdf_storage_path, pdf_file_name, invoice_subtotal, invoice_discount, invoice_total, balance_due, intake_status, extraction_status, notes, created_by, reviewed_by, reviewed_at.
- **vendor_batch_charges** — vendor_batch_id, charge_type, label, amount, quantity, notes.
- **vendor_line_items** — vendor_batch_id, vendor_id, kind (default `sellable`), vendor_item_id, line_number, quantity, size, raw_description, clean_item_name, scientific_name, category, subcategory, origin_region, regular_price, wholesale_cost, **vendor_sell_price**, line_total, has_discount, review_status, pricing_status, suggested_retail_price, approved_retail_price, approved_by, approved_at, extraction_warning, **extraction_confidence** numeric(5,4) nullable, notes, converted_inventory_item_id.
- **inventory_items** — source_vendor_line_item_id (unique nullable), source_vendor_batch_id, vendor_id, item_name, scientific_name, category, subcategory, origin_region, size, quantity_received, quantity_available, quantity_on_hold, quantity_sold, quantity_lost, wholesale_cost, retail_price, pricing_status, location_id, availability_status (default `incoming`), live_sale_status (default `not_eligible`), needs_photo (default true), website_ready_later (default false), notes, created_by.
  - CHECK: `quantity_received >= quantity_available + quantity_on_hold + quantity_sold + quantity_lost`.
  - Trigger gate: `availability_status = 'available'` requires `pricing_status='approved'` AND `retail_price IS NOT NULL` AND `location_id IS NOT NULL` AND `quantity_available > 0`.
  - Trigger gate: `live_sale_status IN ('staged','live')` requires `location_id` → `store_locations.is_live_sale = true`. `eligible` does not require it (it only declares the item is a live-sale candidate).
- **inventory_media** — inventory_item_id, storage_path, file_name, media_type (`image`/`video`), tag, alt_text, uploader_id, notes.
- **inventory_activity_logs** — inventory_item_id (nullable), vendor_batch_id (nullable), vendor_line_item_id (nullable), actor_id, action, summary, detail jsonb. No update/delete.

Indexes on every FK plus `(vendor_batch_id, line_number)`, `(availability_status)`, `(location_id)`, `(pricing_status)`, `(vendor_id)`.

### RLS (reuses existing helpers)
- `SELECT`: authenticated + `is_active_user(auth.uid())`.
- `INSERT`/`UPDATE`: authenticated + `can_edit_content(auth.uid())`.
- Admin-only writes to `vendor_line_items.pricing_status / approved_retail_price / approved_by / approved_at` enforced by trigger using `has_role(auth.uid(),'admin')`.
- `DELETE`: admin only.
- `inventory_activity_logs`: insert by active users (for triggers + manual notes); no update/delete.
- GRANT `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role`. No anon.

### Storage
- Private bucket `vendor-invoices` (PDFs). Policies: insert/select/update by `can_edit_content`, delete by admin. Path `{vendor_id}/{batch_id}/{filename}`.
- Private bucket `inventory-media`. Same policies.

### Triggers
- `touch_updated_at` on every new table.
- Inventory availability + live-sale gate trigger.
- Pricing-approval guard trigger on `vendor_line_items`.
- Activity-log trigger on `inventory_items` for status / location / quantity / pricing changes.

## 2. App pages (TanStack routes under `_app/`)

Sidebar `Operations` group becomes:
- **Inventory Intake** → `/_app/batches.tsx` (list) + `/_app/batches.$id.tsx` (Header / Line Items / Charges / Convert sections). Label intentionally stays "Inventory Intake" for staff clarity.
- **Pricing Approval** → `/_app/pricing-approval.tsx`
- **Inventory** → `/_app/inventory.tsx` + `/_app/inventory.$id.tsx`
- **Vendors** → `/_app/vendors.tsx` (replaces coming-soon)
- **Store Locations** → `/_app/store-locations.tsx` (replaces "Store Placement" coming-soon)
- **Tasks / SOPs** → stays as coming-soon

Old `/_app/inventory-intake.tsx` and `/_app/store-placement.tsx` coming-soon files are deleted.

## 3. Server functions (`createServerFn` + `requireSupabaseAuth`)

- `getSignedInvoicePdfUrl({ path })`, `getSignedInventoryMediaUrl({ path })`.
- `convertLineItemsToInventory({ lineItemIds })` — validates `review_status='approved'`, `kind='sellable'`, `pricing_status='approved'`, not already converted; inserts inventory, sets `converted_inventory_item_id`, writes activity log.
- `approveLinePricing({ lineItemId, approvedRetailPrice })` — admin check via `has_role` in handler; DB trigger is the backstop.
- `setInventoryAvailability` / `setInventoryLiveSaleStatus` / `adjustInventoryQuantities` — change + activity log in one transaction.
- Direct browser uploads to Storage for PDFs and inventory media; metadata rows inserted via the standard Supabase client.

## 4. Frontend conventions

- Shadcn `Input` / `Select` / `Textarea` / `Dialog`, existing `rounded-lg border bg-card` tables.
- New `OpsBadge` for the operations enums, with a label map in `src/lib/ops.ts`. `dead_lost` renders as **"Dead / Lost"**; `needs_id` renders as **"Needs ID"**; `not_eligible` renders as **"Not eligible"**; `vendor_sell_price` field labelled **"Vendor sell price"**; `approved_retail_price` field labelled **"Approved retail price"**.
- Currency `numeric(12,2)` rendered with `Intl.NumberFormat("en-US",{style:"currency",currency:"USD"})`.
- PDF link only on batch detail; no in-browser viewer.

## 5. Out of scope (explicit non-goals)

- No Clover sync / OAuth / tokens / webhooks / external APIs.
- No AI parsing — `extraction_status`, `extraction_warning`, `extraction_confidence` exist so AI can fill them later without schema changes.
- No public website inventory pages — only the `website_ready_later` flag.
- No maintenance/service work, QC checklists, reorder logic.
- No changes to existing auth, RLS helpers, content/media/products/campaigns/publishing modules, branding, Meta settings, or workspace repositioning.

## 6. Execution after approval

1. Run the single migration (tables + enums + RLS + triggers + storage buckets + policies).
2. Add `OpsBadge` and `src/lib/ops.ts` enum label maps.
3. Build pages in this order: Vendors → Store Locations → Inventory Intake (batches list + detail with line items + charges) → Pricing Approval → Convert-to-Inventory action → Inventory dashboard + detail + media.
4. Update the `Operations` group in `src/routes/_app.tsx`; delete the two replaced coming-soon files.
5. Smoke test: create vendor + live-sale location → create batch → add 2 line items + 1 freight charge → admin approves pricing → convert sellable line → assign live-sale location → mark `eligible` → `staged` → `live`.

## Acceptance criteria

- Charges never appear in inventory; rejected lines never convert.
- Inventory cannot go `available` without approved price + location + quantity.
- `staged`/`live` requires the item's location to be a live-sale location; `eligible` does not.
- Non-admin staff cannot approve pricing in the UI or via direct DB writes.
- Sidebar still shows "Inventory Intake" and existing CMS, branding, auth, and Meta surfaces continue to work unchanged.
