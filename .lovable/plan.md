
# Intake Foundation — Today's Build

Goal: by the time the shipment arrives, you can open a vendor batch, walk through each AI-extracted line, record received/lost quantities, assign a tank, accept or adjust a 3× suggested retail, and convert to live inventory — with role gates intact. Everything else (barcodes, sticker OCR, PO reconciliation, customer-facing search) is deferred to tomorrow with notes so nothing slips.

## Today's scope (in build order)

### 1. Schema: `item_type` + zones-and-tanks + pricing suggestion

One migration. Touches three tables.

**New enum:** `item_type` = `fish | coral | invert | dry_good | live_rock | equipment | other`

**vendor_line_items** — add:
- `item_type item_type` (nullable; AI fills it, human can override)
- `suggested_retail_3x` numeric(12,2) generated: `wholesale_cost * 3` (stored generated column for sortability)

**inventory_items** — add:
- `item_type item_type` (copied from line on convert)
- `received_at timestamptz` (set when receiving step runs)
- `received_by uuid` (actor)

**store_locations** — extend, do NOT replace:
- Add `parent_location_id uuid REFERENCES store_locations(id)` — lets a `zone`-kind row contain tank-kind rows
- Add `zone` to the `store_location_kind` enum
- Existing rows stay valid; new "zone" rows are parents, tanks point to them via `parent_location_id`
- This avoids breaking the existing `inventory_items.location_id` FK or any current code

### 2. Server functions (in `src/lib/ops.functions.ts`)

All require `requireEditor` (admin/creator/reviewer) unless noted.

- `listLocationsTree()` — returns zones with nested tanks, for picker dropdowns
- `upsertLocation({ id?, name, kind, parent_location_id?, is_live_sale, capacity_notes, notes })` — create/edit zones and tanks
- `receiveBatchLines({ batchId, lines: [{ lineItemId, received_qty, lost_qty, lost_reason?, location_id?, notes?, override_retail? }] })` — atomic per-row update on `vendor_line_items` (writes received/lost into new columns on the line, stores chosen location + retail override). Does NOT create inventory yet — keeps the "receive then admin-approve pricing then convert" gate intact.
- Extend `convertLineItemsToInventory` (admin-only, unchanged) so it copies `item_type`, `location_id`, `received_at`, and uses received_qty as `quantity_received` (lost_qty written to `quantity_lost`)
- `inviteUser({ email, role, display_name? })` — admin only. Uses `supabaseAdmin.auth.admin.inviteUserByEmail` and inserts into `user_roles` + marks `profiles.is_active=true` on first sign-in via existing trigger (or we pre-create the profile row marked active)

To support per-line receiving without yet another table, also add to `vendor_line_items`:
- `received_quantity numeric(12,2)`
- `lost_quantity numeric(12,2) default 0`
- `loss_reason text`
- `assigned_location_id uuid REFERENCES store_locations(id)`

### 3. UI

**a. Settings → Locations** (new page `/_app/settings/locations`)
- Tree view: zones with their tanks
- "Add zone" / "Add tank" buttons
- Edit name, kind, live-sale flag, capacity, notes
- Required before receiving can assign a location, but receive screen will allow blank-location rows and warn

**b. Settings → Users** (extend existing approval queue)
- New "Invite user" button → modal: email + role select → calls `inviteUser`
- Existing pending-approval queue stays as-is

**c. Batch detail (`/_app/batches/$id`) — new "Receive" mode**
- Toggle/tab "Receive shipment" alongside existing line table
- Per row: ordered qty, received qty input (defaults to ordered), lost qty, loss reason dropdown, location picker (zone → tank cascade), wholesale, **suggested retail = 3× wholesale** shown prominently, override input next to it
- "Save received" button → calls `receiveBatchLines`
- After saving, lines move into pricing-approval state; admin clicks existing "Approve pricing" then existing "Convert to inventory" (now copies location + item_type)
- Lines with `received_qty=0` stay flagged on the batch as "did not arrive"

### 4. Safety rules preserved (no changes)

- AI cannot approve pricing
- AI cannot mark review approved
- AI cannot convert to inventory
- AI cannot create inventory_items
- AI cannot delete human-created or converted rows
- All new mutating server fns gated by `requireEditor` or `requireAdmin`
- `inviteUser` admin-only; new users land inactive until they sign in (existing handle_new_user trigger logic)

## Tomorrow (explicitly deferred — captured in `mem://features/intake-roadmap`)

Will write a memory file so this doesn't get lost:

1. **Barcode scanning on receive** — camera input via `getUserMedia` + a JS barcode lib (ZXing/quagga); maps barcode → vendor_item_id lookup on the batch
2. **Sticker photo OCR** — reuse Lovable AI Gateway with image input; parses species + sci name from a photo, prefills a new line
3. **Purchase order upload + reconciliation** — new `purchase_orders` + `purchase_order_lines` tables; matches PO line ↔ invoice line ↔ received qty; produces "missing", "substituted", "extra" report
4. **Customer-facing inventory search** — public/read-only page with search by name/sci name/category/price range; filters to `availability_status='available'`
5. **Per-type field differences** — coral fragging metadata, dry-goods SKU/UPC, fish size+sex
6. **Clover sync** — out of scope until inventory flow is stable
7. **Public website pages** — out of scope today

## Open questions before I start (none blocking)

- Tank vs zone naming: I'll use `zone` (parent, kind=`zone`) and `tank` (child, existing kinds like `display_tank`, `quarantine`, etc.). Acceptable?
- Invite emails go through Supabase Auth's default email; custom branding can come later.

## Files I'll touch

- `supabase/migrations/<new>.sql` — schema additions above
- `src/lib/ops.functions.ts` — add `listLocationsTree`, `upsertLocation`, `receiveBatchLines`, `inviteUser`; extend `convertLineItemsToInventory`
- `src/routes/_app/settings.locations.tsx` — new
- `src/routes/_app/settings.users.tsx` — extend with invite modal (or create if missing)
- `src/routes/_app/batches.$id.tsx` — add Receive tab
- `mem://features/intake-roadmap` — deferred list
- `mem://index.md` — link the roadmap

Approve and I'll execute in order: migration first (you'll get a separate approval prompt for that), then server fns, then UI.
