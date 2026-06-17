# Scope — Inventory cleanup, consolidation & correctness (4-agent review)

> Status: **review only, nothing implemented.** Source: four parallel read-only agents over the inventory
> UI, server logic, data model, and intake pipeline. Findings de-duplicated + prioritized below.
> Lanes: **[App]** = Claude (TS) · **[DB]** = Lovable (migration/RPC) · **[Decision]** = needs owner sign-off.

## Decisions needed first (they gate some fixes)
- **D1 — Editor go-live via the availability dropdown. → DECIDED: Available = editor-OK; Live-sale staging
  = admin-only.** Gate `setInventoryLiveSale` (into staged/live) behind admin; leave `setInventoryAvailability`
  editor-allowed (matches the Quick Add staff-add policy).
- **D2 — Coral's front door. → DECIDED: keep coral in Quick Add but ADD a required rack-position field** so the
  plug-tag discipline holds in both Quick Add and Coral Discovery.
- **D3 — Price precedence. → DECIDED: admin-approved price wins.** The override is a suggestion; the live
  price and the printed tag both come from the approved/retail price. Fix the tag CSV to use the approved
  price (not the override) for consistency.

---

## Tier 1 — Real correctness / data bugs (do first)
1. **[App] Clover sales ingest hardcodes `qty: 1`** (`clover.ingest.server.ts:177,196`; `clover.api.ts` mapper fetches no quantity). Multi-unit Clover sales under-decrement stock AND under-count revenue. Fix: read the Clover line-item quantity through the API mapper and pass it to `applyInventorySale`.
2. **[App] `override_retail_price` dropped at conversion** (`ops.functions.ts:156`). Define D3 precedence and apply it in both `convertLineItemsToInventory` and the pricing-approval fns.
3. **[App] reconcile↔convert UNIQUE clash on `source_vendor_line_item_id`** (`ops.functions.ts:1807` vs `:142`). A reconciled-then-converted line hard-errors or double-creates the same physical item. Fix: convert skips lines already linked via reconciliation; surface the conflict as a friendly message.
4. **[DB+App] Sale decrement is not atomic** (`applyInventorySale` read-modify-write, no lock). Concurrent manual+Clover sale of one item can lost-update. Fix: a `SECURITY DEFINER` RPC with `FOR UPDATE` (or `SET col = col - x`), mirroring `loyalty_redeem`. Lovable writes the RPC; app calls it.
5. **[App] `$0` counts as "approved"** — the 3 approval fns use `.nonnegative()`; the gate only checks `retail_price IS NULL`, so a $0 item can go live. Fix: `.positive()` on `reviewInventoryItem`, `approveInventoryPricing`, `approveLinePricing`.
6. **[App] Quantity/status desync** — the bulk-import *merge* path (`ops.functions.ts:~2028`) and `adjustInventoryQuantities` bump `quantity_available` but never clear `sold_out`, so a restocked item stays invisible. Only sale/colony paths couple status↔qty. Fix: re-derive status at the 0/sold_out boundary in the qty mutators.

## Tier 2 — High-traffic UX bugs
7. **[App] Review Stock wizard** (`inventory-review-wizard.tsx`): keyboard `useEffect` has no deps (stale-closure double-fire window); deck only reloads on `[open]` so a re-click while open shows a stale deck. Fix: deps array + ref guard + a `sessionNonce` to force reload.
8. **[App] `window.__quickAddTagPath` global** (`quick-add-fab.tsx`) → switching Livestock/Dry-Goods tab can attach the wrong tag photo. Fix: hold `tagPath` in component state.
9. **[App] Stale nav badges** — the stock list `refresh()` and Quick Add invalidate `["inventory"]` but not `["workload"]` (and coral/missing-tags keys), so sidebar counts lag. `pricing-approval` already does it right — just match it.
10. **[App] 2000-row cap** (`inventory.index.tsx`) silently truncates >2000 items and the "X items" count is wrong. Fix: server-side `.range()` pagination + a true count (or a "showing first N" notice).
11. **[App] Detail page** (`inventory.$id.tsx`): a deleted/invalid id renders "Loading…" forever (no not-found state); `QuantitiesCard` doesn't re-seed after an external mutation. Fix: distinguish `isLoading` vs `null`; re-seed on `item.updated_at`.
12. **[App/Decision] Direct `supabase.update()`** in the stock list/detail (location, notes, media) bypasses the server-fn `is_active`/role checks (relies on RLS only). Confirm RLS enforces it, or route through server fns.

## Tier 3 — Consolidation (the big maintainability win)
13. **[App] `buildInventoryInsert()` helper** — the inventory-row insert shape is duplicated **4×** (`quickAddInventoryItem`, `bulkImportInventoryRows`, `convertLineItemsToInventory`, `catalogCoralItem`) and has *already drifted* on `needs_photo` (false/true/`!photo`) and `pricing_status` (approved/not_priced). One builder with explicit per-path overrides. **Independently flagged by 3 of 4 agents.**
14. **[App] `goLiveAfterPhoto()` helper + `useGoLiveWithPhoto()` hook** — the "check photo → open PhotoOnFileWizard → apply available" block is copy-pasted across the stock list, detail, Pricing Queue, and review wizard.
15. **[DB+App] Promote load-bearing `attrs` keys to real columns**: `rack_position`, `stock_mode`, `inventory_role` (they're queried/sorted and drive sale-decrement logic — shouldn't be untyped jsonb). Drop duplicate `attrs.clover_item_id` in favor of the `clover_item_links` table (single source of provenance). Bigger effort (migration + app refactor).

## Tier 4 — Cleanups (quick, low-risk)
16. **[App] Redundant manual `created` activity-log inserts** (`convertLineItemsToInventory`, `catalogCoralItem`) — the `log_inventory_activity` trigger already writes them → items double-logged. Drop the manual ones.
17. **[App] Dead `doaBlocked` return** (`receiveBatchLines:309`) + the dead UI branch (`batches.$id.tsx:635`).
18. **[App] Clover catalog import pulls in `hidden`/archived items** as drafts (`clover.api.ts:91`). Skip `hidden`.
19. **[DB] Dead schema**: `vendor_line_items.attrs` + its GIN index (never written), the `inventory_media.ocr_text`/`ocr_extracted_at` columns (no reader), and the unreachable `live_sale_status='ended'` enum value (or add an "End live sale" action).
20. **[App] Misc**: unused imports in `batches.$id.tsx`, the `Recon` type drift in `reconcile-section.tsx`, the duplicated `countRows`/inline `count` in `clover.functions.ts`.

## Noted, lower priority
- Two coral-type vocabularies coexist (`attrs.coral_type` SPS/LPS/soft vs `coral-type.ts` euphyllia/acro slugs) — reconcile someday.
- `quantity_on_hold` / `quantity_lost` counters aren't moved by the `on_hold`/`dead_lost` status transitions (status-only today). Decide: wire paired moves, or demote to report-only + document.
- Reconcile matcher is greedy (can mis-pair similarly-named corals); re-Apply duplicates "not on PO" note stamps.

## Recommended sequence
**Tier 1 (correctness) → Tier 2 (UX bugs) → Tier 3.13/3.14 (the insert/go-live consolidation) → Tier 4 cleanups**, with the **DB-lane items (atomic-sale RPC, attrs→columns, dead-schema drops) handed to Lovable** in parallel. Tier 3.15 (attrs→columns) is the largest and can come last. The three Decisions (D1–D3) unblock items 2, 6, 12, and the coral path.
