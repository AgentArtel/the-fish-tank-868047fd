# Handoff → Lovable: promote load-bearing `attrs` keys to columns? (scope/decision)

Tier-3 inventory review, item #15 — the **largest** item, and partly a **decision**, not a directive.
Several `inventory_items.attrs` jsonb keys are load-bearing (queried, sorted, drive logic). The audit
flagged them as "should be real columns." But one of them (`stock_mode`) was *deliberately* kept in
`attrs` by an earlier design (`design-coral-stock-tracking.md`). So before any migration, let's agree the
scope. Below is each key, how it's used today, and my recommendation.

## The keys

### 1. `rack_position` — **recommend promote to a real column**
- Read: `inventory.index.tsx` (coral plug column), `pricing-approval.tsx`, `inventory.coral-discovery.tsx`.
- Written: `catalogCoralItem` and now Quick Add (both uppercase it).
- There's already a functional index on `upper(attrs->>'rack_position')` (per `handoff-coral-discovery.md`).
- It's typed text, queried/sorted/displayed — a clean candidate for `rack_position text` + a normal index.

### 2. `inventory_role` — **optional / your call**
- Written by `catalogCoralItem` + Quick Add; drives the *initial* draft availability mapping at insert
  time (`for_sale→incoming`, `hold→on_hold`, else `not_for_sale`) and is shown in the coral attrs editor.
- Could become an enum column (`for_sale|growout|mother_colony|frag_source|hold`), but it's not in a hot
  query path. Promote only if you want the typing/constraint; otherwise fine to leave.

### 3. `stock_mode` — **recommend LEAVE in `attrs`** (flagging the tension)
- Read: `applyInventorySale` (colony vs frag decrement branch), `inventory-sales-card.tsx`.
- `design-coral-stock-tracking.md` explicitly chose to keep `stock_mode`/`price_mode` in `attrs` ("coral is
  the only consumer, no trigger needs them yet"). The audit (#15) says promote. **These conflict.** Unless
  you want to revisit that design call, I'd keep it in `attrs` — no trigger or RLS depends on it, and the
  sale path already reads it fine.

### 4. `attrs.clover_item_id` — **recommend stop duplicating, rely on `clover_item_links`** (mostly app-side)
- `clover_item_links` is the canonical Clover↔inventory provenance table. `createWorkspaceItemsFromClover`
  *also* stamps `attrs.clover_item_id`, and the import re-reads it (`invByCloverId`) for idempotency.
- This is duplicated provenance. The cleanup is mostly **app-lane** (I stop writing/reading
  `attrs.clover_item_id` and rely on `clover_item_links`), but it needs a **one-time backfill** so no
  existing link is lost: insert into `clover_item_links` any `attrs.clover_item_id` that isn't already
  linked. Can you do that backfill migration? Then I'll cut the app over.

## What I'd like from you
1. **Confirm scope.** My lean: promote **`rack_position`** to a column now; **leave `stock_mode` in attrs**
   (per the existing design); `inventory_role` = your call; `clover_item_id` = backfill + app cutover.
2. If we promote `rack_position`: a migration that **adds `rack_position text`, backfills it from
   `attrs->>'rack_position'`**, and (ideally) keeps writing both during the transition — or tell me to
   cut the app over in the same release and you drop the attrs key after. Replace the functional index
   with a plain `(location_id, upper(rack_position))` or `(rack_position)` index.
3. For `clover_item_id`: the backfill migration described above.

No app changes until we agree — this one's big enough to be worth a quick alignment first.

---

### Aside — correction to audit item #19 (dead schema)
While auditing I found the scope's claim that `inventory_media.ocr_text` / `ocr_extracted_at` have "no
reader" is **wrong** — they're written by `parseTagPhoto`/OCR (`ops.functions.ts`) and **read+displayed**
on the item detail page (`inventory.$id.tsx` Media section). **Do not drop those columns.** The other #19
candidates (`vendor_line_items.attrs` + its GIN index if truly never written; the unreachable
`live_sale_status='ended'` enum value) may still be droppable, but please verify each is genuinely
unreferenced before removing.
