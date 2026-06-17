# Handoff → Lovable: atomic stock-decrement RPC (lost-update fix)

Audit (inventory data-model review) found `applyInventorySale` decrements stock with a **read-modify-write**
(SELECT `quantity_available/sold` → compute in JS → UPDATE). Two concurrent sales of the same item (e.g. a
manual log + the Clover cron firing together) can **lost-update** and over-count availability. Needs an
atomic, row-locked DB update — which can't be expressed from the PostgREST client (it can't do
`SET col = col - x`), so it's an RPC. Mirrors how `loyalty_redeem` made redemption atomic.

## Migration to add
```sql
-- Atomically decrement available stock for one non-colony sale line. Clamps to
-- available (no negative), bumps sold, and flips to sold_out at zero. Row-locked by
-- the UPDATE itself, so concurrent sales serialize. Returns the resulting quantities.
CREATE OR REPLACE FUNCTION public.decrement_inventory_stock(_id uuid, _qty numeric)
RETURNS TABLE (quantity_available numeric, quantity_sold numeric, availability_status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.inventory_items AS i
  SET
    quantity_available = i.quantity_available - LEAST(_qty, i.quantity_available),
    quantity_sold      = i.quantity_sold      + LEAST(_qty, i.quantity_available),
    availability_status = CASE
      WHEN i.quantity_available - LEAST(_qty, i.quantity_available) = 0
           AND i.availability_status = 'available'
      THEN 'sold_out'::public.inventory_availability_status
      ELSE i.availability_status
    END
  WHERE i.id = _id
  RETURNING i.quantity_available, i.quantity_sold, i.availability_status::text;
$$;

REVOKE ALL ON FUNCTION public.decrement_inventory_stock(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_inventory_stock(uuid, numeric) TO authenticated, service_role;
```
(Within a single UPDATE, the `i.*` references are the pre-update row values, so the two `LEAST(...)`
expressions are consistent. Confirm the `inventory_availability_status` enum name matches your schema.)

## After it's applied (Claude's follow-up, app lane)
`applyInventorySale` (non-colony branch) will call `db.rpc("decrement_inventory_stock", { _id, _qty })`
instead of the read-compute-update. No behavior change otherwise; the gate/qty CHECK constraints still hold.

## Separate — please verify (not a fix yet): Clover sale quantity
`clover.ingest.server.ts` records every Clover sale line as **qty 1**. Whether that's correct depends on
how your Clover represents quantity: classic Clover creates **one line_item per unit** for countable items
(so qty:1 per line is right), but uses `unitQty` (thousandths) for weight/measure items. **Before we change
it**, can you confirm from real order data whether a multi-unit sale shows as N line items or one line item
with a quantity field? That tells us whether there's actually a miscount to fix.

Reply when the RPC is applied (and on the Clover-qty question) and Claude will wire the app side.
