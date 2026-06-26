# Plan: "To-restock" list (#5) — [App=Claude], no DB change

> A running re-order list of sold-out / retired stock (especially retired coral colonies), so the owner
> has something to work from and send to vendors. **App-only — query + route + one nav entry. No migration.**

## How `sold_out` happens (both paths already exist)
1. **Colony retire** — `setColonyGone` (`ops.functions.ts`) sets `colony_gone=true` + timestamps + `availability_status='sold_out'`. (The owner's "retire a mother colony/colony" case.)
2. **Normal item sells to 0** — `decrement_inventory_stock` / `syncAvailabilityToStock` flip `available → sold_out`.

So **`availability_status='sold_out'`** is the unifying signal; `colony_gone=true` is a subset carrying the retire date.

## What's on the list
- **Default = all `sold_out` items**, with **colonies flagged/pinned to the top** (a retired mother colony is the highest-signal re-order). A dry good / fish that hit 0 is also legitimately "restock me."
- **Scope filter:** `All sold-out` (default) · `Colonies only` · by type.
- **Exclude** `dead_lost` (that's mortality, not a re-order) and `not_for_sale`.

## Build
- **`getRestockList({ scope })`** server fn (requireEditor) — select sold-out items
  (`id,item_name,scientific_name,item_type,size,attrs,rack_position,location_id,retail_price,wholesale_cost,colony_gone,colony_gone_at,updated_at,vendors(name)`),
  `scope='colonies'` adds `item_type='coral' AND attrs->>stock_mode='colony'`. Order by `colony_gone_at` desc then `updated_at`. Return rows + `count` + `totalEstValueCents`.
- **Route `/inventory/restock`** (`src/routes/_app/inventory.restock.tsx`) — **clone `inventory.missing-tags.tsx`** (same shape: PageHeader, location-path resolver, grouped table, CSV/print export — which is genuinely useful for sending a vendor a re-order). Per row: item (→ `/inventory/$id`), type + **Colony badge**, location path, **retired/last-sold date** (`colony_gone_at` else `updated_at`), **vendor**, est. value (`retail_price`); header shows summed est. value. **Group by vendor** (toggle to type); colonies pinned.
- **Nav:** one entry under Inventory in `_app.tsx` — `{ to: "/inventory/restock", label: "Restock", icon: ShoppingCart }`, right after Stock.

## Leaving the list — no new flag
An item drops off **naturally** when restocked: re-receiving (`adjustInventoryQuantities` → qty>0) flips `sold_out → available`. For a colony, `setColonyGone({ gone:false })` already un-retires it. Row actions reuse existing fns ("Re-receive" / "Un-retire colony") — **no `dismiss`/`restocked` flag, no schema change.**

## Open decisions (owner)
1. Default scope: all sold-out (recommended) vs colonies-only?
2. `setColonyGone(false)` today clears `colony_gone` but leaves `availability_status='sold_out'` until re-received — want a one-line tweak so un-retire also flips availability (gated by qty/photo/price)? (Only optional server-fn change; still no DB change.)
3. Optional **"Mark ordered"** tag (`attrs.restock_ordered` via `updateInventoryAttrs`) to flag items already on a PO without removing them — v1 or defer?
4. Add a `restockCount` nav badge to `getWorkload` now, or ship the route first?

**Assumptions:** `attrs.stock_mode==='colony'` is the colony marker; `colony_gone ⇒ sold_out`; `updated_at` is an acceptable proxy for "became sold-out" (no dedicated `sold_out_at` column). Editor-gated.
