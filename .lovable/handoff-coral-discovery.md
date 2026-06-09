# Hand-off — Coral Discovery (for Lovable / DB owner)

Date: 2026-06-09 · App-side feature is merged to `main`. This note covers the
database side so we stay coordinated. **No migration is required to run the
feature** — but there are a few things to confirm and a couple of decisions
that are yours to make.

## What shipped (app side)

A purpose-built **Coral Discovery** screen (`/inventory/coral-discovery`) to
catalog the corals already in a tank, one system at a time, and tag each one
with its 3D-printed plug code (e.g. `B3`, `X3`, `H8`) so we know exactly where
it sits on the rack.

- Creates **draft** coral `inventory_items` (no vendor / no PO).
- Each coral's plug code is stored, uppercased, in
  `inventory_items.attrs->>'rack_position'`.
- `/inventory` shows a **Plug** column when filtered to `type=coral`.

Files: `src/lib/ops.functions.ts` (`catalogCoralItem`,
`getCoralDiscoveryOverview`), `src/routes/_app/inventory.coral-discovery.tsx`,
`src/lib/item-type-attrs.ts` (added `rack_position` to the coral schema),
`src/routes/_app/inventory.index.tsx` (Plug column).

## How drafts are written (so nothing goes live by accident)

For each catalogued coral:

| Field | Value |
|---|---|
| `item_type` | `coral` |
| `pricing_status` | `not_priced` (discovery never approves pricing) |
| `availability_status` | `for_sale → incoming`, `hold → on_hold`, `growout / mother_colony / frag_source → not_for_sale` — **never `available`** |
| `quantity_received` / `quantity_available` | both = entered qty (others 0) |
| `vendor_id` / `source_vendor_batch_id` | null |
| `attrs` | `{ rack_position, inventory_role, coral_type? }` (+ any future coral attrs) |
| photo | optional at capture; sets `needs_photo=true` when skipped |

## Verified safe against the current schema (no migration needed)

I checked the live triggers/constraints — drafts pass all of them:

1. **`trg_inv_photo_required`** only raises when `availability_status = 'available'`. Draft saves without a photo are fine.
2. **`inv_guard_gates`** — the `available` branch requires approved pricing + retail + location + qty>0, and staged/live live-sale requires a live-sale location. We never set `available` or staged/live, so it passes.
3. **`inventory_qty_balance` CHECK** (`received >= available + on_hold + sold + lost`) — we set `received = available = qty`, rest 0. Passes.
4. **RLS `inv insert editor`** = `can_edit_content(auth.uid())`; the server fn runs as the authenticated editor (`requireEditor`). `vendor_id` is nullable, so vendor-less inserts are allowed.

## Please confirm / decide (DB side — your call)

1. **(Confirm) Storage RLS.** Discovery uploads photos to the existing
   `inventory-media` bucket under a `coral-discovery/` path prefix (same
   pattern as the working `quick-add/` prefix). If the bucket's RLS is
   path-restricted rather than bucket-wide for authenticated editors, please
   allow the `coral-discovery/` prefix.

2. **(Decide) Promotion path for discovery drafts → live.** This is the one
   real gap. The Pricing Queue (`/pricing-approval`) today operates on
   `vendor_line_items`, so these **inventory-item** drafts won't show up there.
   To take a discovered coral live, an admin currently has to open the item,
   set + approve the retail price, ensure a photo is on file, then flip
   availability to `available` (the gates/photo triggers enforce the rest).
   Options:
   - **(a)** Extend the pricing queue + `getWorkload` badge counts to include
     `inventory_items` where `item_type='coral' AND pricing_status='not_priced'`
     (or a dedicated discovery flag), giving these drafts a real review surface; or
   - **(b)** Keep promotion as a manual per-item admin action.
   Either is fine on the app side — we just need to agree which.

3. **(Optional) First-class `inventory_role`.** It currently lives in
   `attrs.inventory_role`. If you'd rather promote it to a real column/enum
   (the earlier field audit flagged this), that's a DB change we can wire the
   UI to.

4. **(Optional) Enforce one coral per plug at the DB.** We only *warn* in the
   UI today. A partial unique index would harden it, e.g.:
   ```sql
   CREATE UNIQUE INDEX inv_coral_plug_unique
     ON public.inventory_items (location_id, upper(attrs->>'rack_position'))
     WHERE item_type = 'coral' AND attrs ? 'rack_position';
   ```
   Check for pre-existing duplicates before adding it.

5. **(Optional cleanup) Double "created" activity log.** There's an
   `AFTER INSERT` `log_inventory_activity` trigger that already logs a
   `created` row; `catalogCoralItem` *also* inserts an explicit
   `coral_discovery` log row (with the plug + system in the summary). Not
   harmful, but if you'd prefer a single row, we can drop the explicit insert
   or have the trigger defer to it.

## Not in scope (unchanged, per standing rules)

No Clover sync, no bulk automation, no storage-unit work, no fish/dry-goods.
Discovery is manual and draft-only.
