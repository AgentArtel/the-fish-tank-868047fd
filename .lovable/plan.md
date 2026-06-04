# Make Quick Add discoverable + add vendor on the fly

## What you're seeing

Inventory is empty because nothing has been converted from a vendor batch yet, and the Quick Add entry point isn't obvious. The floating `+` button (bottom-right of every app page) opens the Quick Add dialog, but:

- The `/inventory` empty state says "Approve and convert vendor line items to populate" and never mentions Quick Add.
- There's no inline Add button in the page header, so the FAB is easy to miss.
- Quick Add doesn't let you pick (or create) the vendor the item came from — so existing/restock stock can't capture where it was bought.

## The fix

### 1. Make Quick Add reachable from the page
- Refactor `src/components/quick-add-fab.tsx`: keep `QuickAddFab` (floating), and export a new `QuickAddButton` (normal button that opens the same dialog, accepts `variant`/`size`/optional `defaultMode`).
- `src/routes/_app/inventory.index.tsx`: add `<QuickAddButton>Quick Add</QuickAddButton>` to the right of the search/filter row.
- Replace the one-line empty state with a real empty state inside the table area:
  - "No inventory yet"
  - Sub: "Add items as you restock with Quick Add, or convert a vendor batch for a full intake run."
  - Buttons: `Quick add an item` + outline `Open vendor batches` (Link to `/batches`).

### 2. Vendor picker inside Quick Add (Manual + Markdown)
Add a vendor selector to the Quick Add forms so each item records where it was bought.

- New small combobox `VendorPickerCombo` inside `quick-add-fab.tsx`:
  - Searchable list of existing active vendors (queried client-side from `vendors`).
  - Footer action: "+ Add new vendor…" — opens a tiny inline form (name required, optional contact name/email/phone, notes) that creates the vendor via a new server fn `quickCreateVendor` and immediately selects it.
  - Vendor is optional (you can leave it blank for legacy stock with unknown source).

- Wire `vendor_id` through:
  - `quickAddInventoryItem` server fn — add `vendor_id?: string | null` to the input validator, write to `inventory_items.vendor_id` (column already exists per current schema).
  - The Manual and Markdown bulk submit paths both pass the selected vendor.

- New server fn `quickCreateVendor` in `src/lib/ops.functions.ts`:
  - Editor-gated (`requireEditor`).
  - Input: `{ name: string; contact_name?: string|null; contact_email?: string|null; contact_phone?: string|null; notes?: string|null }`.
  - Inserts into `vendors` with `is_active=true`, returns the new id+name.
  - Trims and rejects empty name; case-insensitive dedupe against existing vendor names (return existing id if match).

### 3. Tiny polish in the Manual form
- Move the field order to mirror your restock flow: Vendor → Item name → Type → Qty → Retail → Wholesale → Location → Notes.
- Quantity input keeps "current on-hand" semantics (it already maps to `quantity_received`/`quantity_available` in the existing fn).

## Out of scope (still queued)

- Sprint 2 dedupe-aware bulk import.
- Sprint 3 one-time photo-on-file wizard.
- Sprint 4 missing-price-tag export.
- No PO upload path is being added — you confirmed you don't have one for this stock.

## Files touched

- `src/lib/ops.functions.ts` — add `quickCreateVendor`; extend `quickAddInventoryItem` input with `vendor_id`.
- `src/components/quick-add-fab.tsx` — extract `QuickAddButton`, add `VendorPickerCombo`, thread `vendor_id` through both submit paths, reorder fields.
- `src/routes/_app/inventory.index.tsx` — header button + new empty state.
- `.lovable/devlog.md` — append a Sprint-1.5 note for the vendor-on-quick-add addition.

No schema migration needed — `inventory_items.vendor_id` and the `vendors` table already exist.

Approve and I'll implement.
