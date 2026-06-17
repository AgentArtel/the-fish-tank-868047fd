# Scope — Inventory cleanup, consolidation & correctness (4-agent review)

> Status: **review only, nothing implemented.** Source: four parallel read-only agents over the inventory
> UI, server logic, data model, and intake pipeline. Findings de-duplicated + prioritized below.
> Lanes: **[App]** = Claude (TS) · **[DB]** = Lovable (migration/RPC) · **[Decision]** = needs owner sign-off.

## Decisions needed first (they gate some fixes)
- **D1 — Editor go-live via the availability dropdown. → DECIDED: Available = editor-OK; Live-sale staging
  = admin-only.** Gate `setInventoryLiveSale` (into staged/live) behind admin; leave `setInventoryAvailability`
  editor-allowed (matches the Quick Add staff-add policy).
- **D2 — Coral's front door. → DECIDED + ✅ DONE: keep coral in Quick Add but ADD a required rack-position field** so the
  plug-tag discipline holds in both Quick Add and Coral Discovery. Quick Add now shows a required "Rack / plug
  position" input when `item_type === "coral"`, uppercased into `attrs.rack_position` (matches `catalogCoralItem`).
- **D3 — Price precedence. → DECIDED: admin-approved price wins.** The override is a suggestion; the live
  price and the printed tag both come from the approved/retail price. Fix the tag CSV to use the approved
  price (not the override) for consistency.

---

## Tier 1 — Real correctness / data bugs (do first)
1. **[App] ✅ RESOLVED (no change) — Clover `qty:1` is correct.** Verified with Lovable against real
   orders: classic Clover creates one `line_item` per unit (e.g. order KMQ3WMVN12H06 has the salt-water
   item ~35× as separate lines), never an aggregated quantity. Future caveat: if a weight/measure item
   (`unitQty`) is ever enabled, the mapper would need to read `unitQty` — none in the catalog today.
2. **[App] `override_retail_price` dropped at conversion** (`ops.functions.ts:156`). Define D3 precedence and apply it in both `convertLineItemsToInventory` and the pricing-approval fns.
3. **[App] reconcile↔convert UNIQUE clash on `source_vendor_line_item_id`** (`ops.functions.ts:1807` vs `:142`). A reconciled-then-converted line hard-errors or double-creates the same physical item. Fix: convert skips lines already linked via reconciliation; surface the conflict as a friendly message.
4. **[DB+App] ✅ RESOLVED — Sale decrement now atomic.** Lovable shipped the `decrement_inventory_stock(_id, _qty)` `SECURITY DEFINER` RPC (single row-locked `UPDATE … SET col = col - LEAST(qty, available)`, clamps to available, bumps sold, flips `sold_out` at zero). `applyInventorySale` (non-colony branch) now calls the RPC instead of the read-modify-write. Lost-update window closed.
5. **[App] `$0` counts as "approved"** — the 3 approval fns use `.nonnegative()`; the gate only checks `retail_price IS NULL`, so a $0 item can go live. Fix: `.positive()` on `reviewInventoryItem`, `approveInventoryPricing`, `approveLinePricing`.
6. **[App] Quantity/status desync** — the bulk-import *merge* path (`ops.functions.ts:~2028`) and `adjustInventoryQuantities` bump `quantity_available` but never clear `sold_out`, so a restocked item stays invisible. Only sale/colony paths couple status↔qty. Fix: re-derive status at the 0/sold_out boundary in the qty mutators.

## Tier 2 — High-traffic UX bugs
7. **[App] ✅ RESOLVED — Review Stock wizard** (`inventory-review-wizard.tsx`): keyboard `useEffect` now binds once per `[open]` and reads handlers through refs (no more re-subscribe-every-render double-fire window); the deck load uses a `loadSeq` ref guard so a quick close/reopen can't let a stale in-flight load clobber the fresh deck.
8. **[App] ✅ RESOLVED — `window.__quickAddTagPath` global** (`quick-add-fab.tsx`) → now a per-form-instance `parsedTagPath` state, so switching the Livestock/Dry-Goods tab can't attach the wrong tag photo.
9. **[App] ✅ RESOLVED — Stale nav badges** — new `invalidateInventoryViews(qc)` helper (`src/lib/inventory-cache.ts`) invalidates `["inventory"]` + `["workload"]` + `["coral-discovery-overview"]` + `["missing-tags"]` together; wired into the stock-list `refresh()`, the detail-page `refresh()`, and both Quick Add `onSaved` paths. Mirrors the `pricing-approval` canonical set.
10. **[App] ✅ RESOLVED — 2000-row cap** (`inventory.index.tsx`): replaced the `.limit(2000)` + client slice with server-side `.range()` pagination (`page` in the query key, `keepPreviousData` for smooth paging) and an exact `{ count: "exact" }` total, so the "X items" count is accurate and nothing is silently truncated.
11. **[App] ✅ RESOLVED — Detail page** (`inventory.$id.tsx`): distinguishes `isPending` (Loading…) from a `null` item (a real "Item not found" card with a back link); `QuantitiesCard` re-seeds its inputs on `item.updated_at` so it doesn't show stale counts after an external mutation.
12. **[DB] ✅ RESOLVED — Direct `supabase.update()` writes are RLS-safe, kept as-is.** Lovable verified at the DB level: `inventory_items`/`inventory_media` have only the four `can_edit_content`-gated policies (admin-only DELETE), so inactive/non-editor users can't write; the `inv_guard_gates` / `trg_inv_photo_required` / `inv_guard_pricing_approval` BEFORE triggers fire on client writes identically to server fns. Hardened: anon had stale table-level grants (functionally blocked by RLS, but) — migration `20260617155314` revokes `ALL` from anon on both tables. Decision: keep these as RLS-enforced direct writes, no app refactor.

## Tier 3 — Consolidation (the big maintainability win)
13. **[App] ✅ RESOLVED — `buildInventoryInsert()` helper** (`ops.functions.ts`). One typed builder (`TablesInsert<"inventory_items">`) centralizes the full column list + invariants (`live_sale_status: not_eligible`, `attrs` never explicit-null, `quantity_lost` default 0); all 4 sites (`quickAddInventoryItem`, `bulkImportInventoryRows`, `convertLineItemsToInventory`, `catalogCoralItem`) now route through it with the genuinely-per-path fields (`pricing_status`, `availability_status`, `needs_photo`, provenance) passed explicitly. No more silent drift.
14. **[App] ✅ RESOLVED — `useGoLiveWithPhoto()` hook** (`photo-on-file-wizard.tsx`). `ensurePhoto(item, action, onCancel?)` + a `photoGate` element encapsulate "check photo → open PhotoOnFileWizard → run action once uploaded". The 3 status-flip surfaces (stock list, detail, Pricing Queue) now use it. The Review Stock wizard keeps its bespoke flow on purpose — there the photo is the *last* of several gates in a multi-field commit (location/qty/price), not a one-shot status flip, and it preloads photo state per card.
15. **[DB+App] 🔧 IN PROGRESS — Promote load-bearing `attrs` keys to real columns.** Lovable shipped the `rack_position text` column + `(location_id, rack_position)` index and backfilled it. App cutover (this PR): all **list/query reads** now use the `rack_position` column (inventory list, Pricing Queue coral row, Coral Discovery overview); **writes dual-write** the column — `buildInventoryInsert` mirrors `attrs.rack_position`→column on insert, and `updateInventoryAttrs` mirrors it on edit (uppercased). Next: ping Lovable that reads are on the column so they drop the attrs key; then a follow-up moves the detail attrs-editor field to the column and stops dual-writing. **`stock_mode`/`inventory_role` stay in attrs** (Lovable confirmed). **`ocr_text`/`ocr_extracted_at` NOT dropped** (confirmed). **`attrs.clover_item_id`: deferred — see note.** Decision/handoff: `handoff-attrs-to-columns.md`.
    - ⚠️ **`attrs.clover_item_id` is NOT just duplicate provenance — it's the orphan-recovery key** for crash-resumed chunked Clover imports (`createWorkspaceItemsFromClover` inserts items then links them in separate writes; on a worker-timeout between, the next run finds the orphan via `attrs.clover_item_id` and re-links instead of duplicating — `clover_item_links` can't, since the missing link *is* the gap). Removing it risks duplicate inventory items. Pushed back to Lovable: either keep it as the recovery marker, or promote it to a real `inventory_items.clover_item_id` column (typed/indexed, single-source on the item).

## Tier 4 — Cleanups (quick, low-risk)
16. **[App] ✅ RESOLVED (coral) — Redundant manual `created` activity-log insert** dropped from `catalogCoralItem` (it was a literal duplicate of the trigger's `created` row, which already carries `to_jsonb(NEW)` — full row incl. attrs). **Kept** `convertLineItemsToInventory`'s log on purpose: it's action `converted_from_line` (a *distinct* action, not a duplicate `created`), so the scope's "redundant created" premise didn't hold there.
17. **[App] ✅ RESOLVED — Dead `doaBlocked` return** removed from `receiveBatchLines` (it always returned `[]`; the real DOA block throws pre-flight) + the dead `res.doaBlocked` UI branch dropped from `batches.$id.tsx`.
18. **[App] ✅ RESOLVED — Clover `hidden` items skipped** in `cloverListItems` (`clover.api.ts`) so archived/hidden Clover items no longer become workspace drafts; the vestigial `hidden` field was dropped from `CloverItem`.
19. **[DB] Dead schema** (Lovable): `vendor_line_items.attrs` + its GIN index (if truly never written), and the unreachable `live_sale_status='ended'` enum value. **⚠️ Correction:** the `inventory_media.ocr_text`/`ocr_extracted_at` columns are **NOT dead** — they're written by OCR and read+displayed on the detail page; do not drop them. Bundled into `handoff-attrs-to-columns.md`.
20. **[App] ✅ PARTLY RESOLVED — Misc**: consolidated the duplicated inline `count` helper in `clover.functions.ts` onto the module-level `countRows`. Deferred (cosmetic, low value, risk without a linter): the `Recon` `any[]` type precision in `reconcile-section.tsx` and an unused-import sweep in `batches.$id.tsx`.

## Noted, lower priority
- Two coral-type vocabularies coexist (`attrs.coral_type` SPS/LPS/soft vs `coral-type.ts` euphyllia/acro slugs) — reconcile someday.
- `quantity_on_hold` / `quantity_lost` counters aren't moved by the `on_hold`/`dead_lost` status transitions (status-only today). Decide: wire paired moves, or demote to report-only + document.
- Reconcile matcher is greedy (can mis-pair similarly-named corals); re-Apply duplicates "not on PO" note stamps.

## Recommended sequence
**Tier 1 (correctness) → Tier 2 (UX bugs) → Tier 3.13/3.14 (the insert/go-live consolidation) → Tier 4 cleanups**, with the **DB-lane items (atomic-sale RPC, attrs→columns, dead-schema drops) handed to Lovable** in parallel. Tier 3.15 (attrs→columns) is the largest and can come last. The three Decisions (D1–D3) unblock items 2, 6, 12, and the coral path.
