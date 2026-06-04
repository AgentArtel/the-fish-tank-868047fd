# Development Log

Living record of what's been built, what was extra/unplanned, and what's still ahead. Append-only — newest day on top.

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

1. Own-API-key option for AI parsing (user-provided OPENAI/GEMINI key preferred over `LOVABLE_API_KEY`)
2. Barcode scan on receive (`getUserMedia` + ZXing) → `vendor_item_id` lookup
3. Purchase order upload + reconciliation (`purchase_orders` + `po_lines`, PO ↔ invoice ↔ received match)
4. Customer-facing inventory search (public read-only catalog filtered by `availability='available'`)
5. Per-type fields: coral fragging metadata, dry-good SKU/UPC, fish size/sex/age
6. Pricing approval queue showing market-rate overrides with reason
7. Bulk-add: per-row photo upload instead of a single shared photo
8. Clover POS sync — out of scope until inventory flow is stable

## Standing rules (in force)
- AI cannot approve pricing, mark review approved, convert to inventory, or create `inventory_items`
- All mutating server fns gated by `requireEditor` or admin-only check
- Convert requires `review=approved` AND `pricing=approved` AND admin role
- Inventory item cannot be `available` without at least one photo (DB trigger)
- DOA tag requires both in-bag and on-lid photos (DB trigger + server pre-check)
