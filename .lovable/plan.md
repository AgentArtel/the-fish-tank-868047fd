# Phase 1.5 — AI Invoice Draft Parser

Add an "Extract with AI" helper to the existing Vendor Batch detail page. AI populates **draft** `vendor_line_items` (kind=sellable; review_status=pending or needs_info; pricing_status=not_priced) and `vendor_batch_charges` only. Phase 1 manual workflow is untouched.

## Hard safety rules (enforced server-side)
The handler never writes any of: `approved_retail_price`, `approved_by`, `approved_at`, `pricing_status='approved'`, `review_status='approved'`, `converted_inventory_item_id`. It never inserts into `inventory_items`. It never touches `availability_status` or `live_sale_status`. No Clover writes. Human-entered batch header fields are never overwritten. Human-created and converted rows are never deleted.

## Backend — `extractBatchWithAI` in `src/lib/ops.functions.ts`

Input: `{ batchId, confirmOverwrite?: boolean }`.

Flow:
1. Load batch. Require `pdf_storage_path`.
2. If batch already has any line items or charges and `!confirmOverwrite` → return `{ needsConfirm: true }` so the UI can prompt.
3. Set `extraction_status='ai_pending'`.
4. Download PDF from the private `vendor-invoices` bucket. **Max size guard: 15 MB.** Larger → fail gracefully with readable message and `extraction_status='failed'`.
5. Call Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) using `LOVABLE_API_KEY`. Model: `google/gemini-2.5-pro` (PDF-native, strong on tabular invoices). PDF sent as an OpenAI-compatible `image_url` content part with `data:application/pdf;base64,...`. Tool-calling forced (`tool_choice`) with a function schema matching the JSON shape → strict structured output. System prompt encodes Quality Marine / Sea Dwelling column maps, the "Sell Price/Price = vendor cost, not retail" rule, and the charges-vs-sellable rule.
6. Validate the tool-call arguments with Zod. 429 → "AI rate limit"; 402 → "AI credits exhausted"; any non-OK / missing tool call / validation fail → `extraction_status='failed'`, append a dated note to `notes`, return readable error. The final report will explicitly confirm whether the gateway accepted the `data:application/pdf;base64,...` payload, and if it failed will quote the exact gateway error — no hacky workaround attempted.
7. **Vendor resolve** (no auto-create): only if batch has no `vendor_id` and AI returned a vendor name, look up via `ilike(name, ...)`. Exactly one match → set `vendor_id`. Zero/multiple → keep current `vendor_id` and add a staff warning. Never insert a vendor.
8. **Header patch** — always preservation, regardless of `confirmOverwrite`: only fill batch header fields whose current value is `null` or empty string. Human-entered values are never overwritten.
9. **Re-extraction cleanup** (only when `confirmOverwrite=true`):
   - Delete `vendor_line_items` where `vendor_batch_id = :id AND extraction_confidence IS NOT NULL AND converted_inventory_item_id IS NULL`. Converted lines and human-created lines (no confidence) are preserved.
   - Delete `vendor_batch_charges` where `vendor_batch_id = :id AND notes LIKE '[ai-extracted]%'`. Human charges are preserved.
10. Insert `vendor_line_items` rows: `kind='sellable'`, `pricing_status='not_priced'`, `review_status='needs_info'` when `extraction_warning` is non-empty else `'pending'`, `vendor_id=resolvedVendorId`, `vendor_batch_id`, and `extraction_confidence` (default 0.5 if AI omits) so AI-origin detection works on the next pass. `vendor_sell_price` is also written to `wholesale_cost` when AI didn't separately supply one (per Quality Marine / Sea Dwelling rule). Never sets approved_* fields.
11. Insert `vendor_batch_charges` rows. `charge_type` clamped to the existing enum (`freight | packaging | heat_pack | box | fuel_surcharge | discount | credit | tax | other`); unknown → `other` with the original label preserved. `notes` always prefixed `[ai-extracted]` so re-extraction can identify them without a schema change.
12. **Compensating rollback on partial failure**: if line-item insert fails → no rows landed; set `extraction_status='failed'`, return error. If charges insert fails → delete the just-inserted line items, set `failed`. If the final batch update fails → delete both just-inserted sets, set `failed`. Either everything new lands and status becomes `ai_done` / `intake_status='review'`, or nothing new lands and status is `failed`.
13. On success: `extraction_status='ai_done'`, `intake_status='review'`. Return `{ ok, lineCount, chargeCount, removedLines, removedCharges, warnings }`.

**AI-origin markers (no migration):**
- Lines: `extraction_confidence IS NOT NULL` (humans don't set it; AI always does, defaulting to 0.5).
- Charges: `notes LIKE '[ai-extracted]%'` prefix written by the handler.

## UI — `src/routes/_app/batches.$id.tsx`

- "Extract with AI" button in the header action row; disabled unless `batch.pdf_storage_path`.
- First click → AlertDialog: *"AI will create draft line items and charges only. Staff review is required before anything becomes inventory."* Confirm calls the server fn.
- If response is `needsConfirm` → second AlertDialog: *"This batch already has line items or charges. Re-extraction will only replace prior AI-created drafts; human-created and converted rows are preserved. Continue?"* Confirm re-calls with `confirmOverwrite: true`.
- Status pill near the header (`not_started | manual | ai_pending | ai_done | failed`) with color coding. Spinner + disabled while `ai_pending`.
- Line-item rows: small `XX%` confidence badge when `extraction_confidence` is set (existing `extraction_warning` rendering stays).
- Success toast includes `lineCount`, `chargeCount`, and a compact warnings summary; React Query keys invalidated so the page refreshes.

## Files
- **edit** `src/lib/ops.functions.ts` — append `extractBatchWithAI` + Zod schema + tool schema.
- **edit** `src/routes/_app/batches.$id.tsx` — Extract button, two AlertDialogs, status pill, confidence badge.

No migrations. No new tables, columns, enums, or storage buckets. `LOVABLE_API_KEY` is already in secrets.

## Assumptions
- AI provider: Lovable AI Gateway, model `google/gemini-2.5-pro`. PDF transport via the OpenAI-compatible `image_url` content part carrying a `data:application/pdf;base64,…` URL. The final report explicitly confirms whether the gateway accepted that shape.
- PDFs ≤ 15 MB. Larger → graceful failure with readable message.
- Vendor matching by case-insensitive name equality; never auto-creates vendors.

## Testing & report
- Typecheck/build.
- If an existing batch already has a PDF uploaded, run Extract and report:
  - files changed
  - model used
  - whether the gateway accepted the PDF base64 payload (and exact error if not)
  - inserted draft line count
  - inserted charge count
  - warnings returned
  - confirmation that no `inventory_items` rows were created
  - confirmation that re-extraction preserves human-created lines and charges (verified by adding one human line + one human charge before re-running)
  - known limitations

## Out of scope (explicit)
No Clover sync. No public website pages. No auto pricing approval. No auto inventory conversion. No live-sale automation.
