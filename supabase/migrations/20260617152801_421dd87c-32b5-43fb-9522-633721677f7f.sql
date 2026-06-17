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