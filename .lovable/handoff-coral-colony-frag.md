# Handoff: Colony → Frag model (per-colony sell-down)

> Register a coral **colony** → cut individual **frag** listings from it → track per-colony sell-down
> (frags + revenue off each colony). **B subsumes A:** the colony's sell-down total counts BOTH quick
> sales logged directly on the colony AND sales of its linked frag listings. Builds on the existing
> colony/frag model — preserves the non-decrementing-colony invariant. Lanes: `[DB=Lovable]` · `[App=Claude]`.

## ✅ Confirmed model (owner-aligned 2026-06-26) — three independent axes + per-head pricing
The old single "inventory_role" field tangled three concepts. Split into three independent picks per coral
(no overlap), plus per-polyp pricing. **All ride on attrs except `retail_price` (column) and the one new
`source_colony_id` column — no other DB change.**

| Axis | Values | Field | Drives |
|---|---|---|---|
| **Kind** | Colony · Frag | `attrs.stock_mode` (`colony`/`frag`) | counting: colony = cut-from source (never decrements); frag = unit (decrements) |
| **Status** | For sale · Grow-out · Not-for-sale | `attrs.sale_state` (`for_sale`/`growout`/`nfs`) → `availability_status` | sellability: `for_sale`→`incoming` (go-live later); `growout`/`nfs`→`not_for_sale` (can't ring up). Grow-out & NFS are distinct labels but both block the sale. |
| **Size** | Mother colony (10+) · Colony (3-6) · Frag (1-2) | `attrs.coral_size` (`mother_colony`/`colony`/`frag`) | **label only** — filter/report, zero behavior |

**Per-head (per-polyp) pricing:**
- A **Colony** carries `attrs.price_per_head_cents` (the rate frags inherit).
- A **Frag** carries `attrs.head_count` (int). Frag `retail_price` **auto** = `head_count × per_head_rate`,
  unless overridden (manual `retail_price` + `attrs.price_overridden=true`).
- The **Cut-frags** dialog auto-prices each frag from the parent colony's per-head rate by its head count;
  every frag is overridable. Standalone frags can take a per-head rate or a flat price directly.

**Retire a colony** (`setColonyGone`) → `sold_out` **and** surfaces on a new **"to restock"** list
(sold-out colonies). Don't cascade to unsold frags.

**Catalog UX (Coral Discovery / Quick Add):** replace the 5-value role dropdown with the three clean
controls above (Kind toggle · Status · Size) + per-head rate (colony) / head count (frag). "Ready to sell"
is the normal go-live gate, not a coral field. The old `inventory_role` is superseded by Kind+Status+Size;
keep reads backward-compatible during migration.

**Build order:** (1) Lovable ships `source_colony_id`; (2) simplified Coral Discovery (Kind/Status/Size +
per-head pricing) — app-only, usable immediately for the frag-tank teardown; (3) Cut-frags w/ auto-pricing;
(4) Colony sell-down rollup; (5) "To restock" list.

## What already exists (build on, don't duplicate)
- `inventory_items.attrs.stock_mode` ∈ `colony`|`frag`. `apply_inventory_sale` (`20260621184328:54-76`)
  skips the decrement when `item_type='coral' AND stock_mode='colony'`. Frags decrement; colonies don't.
- `inventory_role` (mother_colony/frag_source/for_sale/growout/hold) — label set by `catalogCoralItem`.
- `setColonyGone` + `colony_gone*` columns retire a colony → `sold_out`.
- `inventory-sales-card.tsx` already logs sales per item + shows per-item sold/revenue. **No frag→colony
  link exists today** (verified).

## The ONLY DB change `[DB=Lovable]`
A self-FK lineage column + index, then **regenerate `types.ts`** (so the app drops `as any` on it):
```sql
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS source_colony_id uuid
    REFERENCES public.inventory_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inv_source_colony
  ON public.inventory_items(source_colony_id) WHERE source_colony_id IS NOT NULL;
```
Real column (not `attrs`) because the sell-down rollup is a `WHERE source_colony_id = :colony` aggregate —
indexed equality beats a JSONB expression scan; `ON DELETE SET NULL` cleanly orphans frags if a colony is
deleted (history preserved). Mirrors the prior `rack_position` attrs→column migration. **No CHECK/trigger
needed** — the "must point at a colony" guard lives in the server fn.

## App build `[App=Claude]` (after the column lands)
1. **`cutFragsFromColony` server fn** (beside `catalogCoralItem`, reuses `buildInventoryInsert` + a new
   `source_colony_id` field): input `{ colonyId, frags: [{ item_name, retail_price?, rack_position,
   photo_path?, coral_type? }] }`. Asserts the colony is `coral` + `stock_mode='colony'`. Per frag inserts
   `item_type='coral'`, `stock_mode='frag'`, `inventory_role='for_sale'`, `source_colony_id=colonyId`,
   qty 1, `availability='incoming'` (draft → admin prices/photos → `available`), inherits colony location.
   **The colony itself is never decremented** — we only insert frag rows.
   - "Cut frags from this colony" dialog on the colony detail page (in/next to `<SalesCard>`, gated on
     `isColony`), N frag rows. No separate "cut event" table — `count(frags where source_colony_id)` +
     each frag's `created_at` reconstruct cut history.
2. **`getColonyRollup` server fn** — two cheap queries (frag roster + `inventory_sale_events` for
   `[colony, ...fragIds]` where `kind='sale'`), aggregated in JS:
   - `fragsSold` / `revenueCents` = Σ over colony's own sales (A) **+** all linked frags' sales (B) — one
     union, no double-count (colony vs frag are disjoint `inventory_item_id`s).
   - `fragsListed`, `fragsRemaining`, `fragsSoldOut`, `estRemainingValueCents`.
   - Renders a **"Colony sell-down"** card on the colony page + a roster linking to each frag.
3. **Coral Discovery tweak** — `catalogCoralItem` derives `stock_mode` from role (overridable):
   `mother_colony`/`frag_source` → `colony`; `for_sale`/`growout`/`hold` → `frag`. One-step colony registration.

## How B subsumes A (the key)
Colony sell-down = **(A)** `inventory_sale_events` on the colony itself (quick "cut & sell" with no listing)
**+ (B)** Σ sale events of frags where `source_colony_id = colony`. Both are `inventory_sale_events` rows;
the union is the superset. You're never forced to create a listing for a counter sale, but listed frags
tie back automatically — and a Clover sale of a frag flows in via the same `apply_inventory_sale` and lands
in the colony rollup with zero extra work.

## Clover / Scope-1 fit (no Clover schema change)
Frags (role `for_sale`) become the sellable SKUs → pushed to Clover via Scope 1 → ringable. The colony
(`mother_colony`/`frag_source` → `not_for_sale`) is internal, never a Clover SKU. `source_colony_id` is
invisible to Clover — purely the internal rollup join.

## Owner decisions
1. **stock_mode mapping** — confirm `mother_colony` **and** `frag_source` ⇒ `colony` (others ⇒ frag). Override per-item on the detail card if a "mother colony" is ever sold whole.
2. **`setColonyGone`** — leave unsold linked frags untouched when a colony is retired? (Recommend yes — frags outlive the colony.)
3. Frags **inherit colony location / coral_type** by default — OK?
4. Optional `inventory_activity_logs` "Cut N frags" breadcrumb (cosmetic) — want it?

## Build sequence (non-decrementing-colony invariant intact at every step)
1. **Lovable:** `source_colony_id` column + index + regenerate `types.ts`. (Only DB change.)
2. **Claude:** `cutFragsFromColony` + "Cut frags" dialog.
3. **Claude:** `getColonyRollup` + "Colony sell-down" card (A+B total goes live).
4. **Claude:** Coral Discovery `stock_mode`-from-role tweak.

Assumptions: one colony → many frags (no frag-of-frag depth); `total_cents` reliably populated for revenue;
Lovable regenerates types so the app reads the new column without casts.
