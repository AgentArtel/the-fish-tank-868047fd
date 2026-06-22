CREATE OR REPLACE FUNCTION public.record_inventory_loss(_inventory_item_id uuid, _qty numeric, _reason text, _note text DEFAULT NULL::text)
 RETURNS TABLE(quantity_available numeric, quantity_lost numeric, availability_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.inventory_items%ROWTYPE;
  v_loss numeric;
  v_new_avail numeric;
  v_new_lost numeric;
  v_new_status public.inventory_availability_status;
BEGIN
  IF v_uid IS NULL OR NOT public.is_floor_staff_or_above(v_uid) THEN
    RAISE EXCEPTION 'Forbidden: floor-staff role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN
    RAISE EXCEPTION 'Loss quantity must be > 0';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Loss reason is required';
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = _inventory_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % not found', _inventory_item_id;
  END IF;

  v_loss := LEAST(_qty, COALESCE(v_item.quantity_available, 0));
  v_new_avail := COALESCE(v_item.quantity_available, 0) - v_loss;
  v_new_lost := COALESCE(v_item.quantity_lost, 0) + v_loss;

  v_new_status := v_item.availability_status;
  IF v_new_avail = 0 AND v_item.availability_status = 'available' THEN
    IF COALESCE(v_item.quantity_sold, 0) = 0
       AND COALESCE(v_item.quantity_on_hold, 0) = 0 THEN
      v_new_status := 'dead_lost';
    ELSE
      v_new_status := 'sold_out';
    END IF;
  END IF;

  UPDATE public.inventory_items AS i
     SET quantity_available = v_new_avail,
         quantity_lost = v_new_lost,
         availability_status = v_new_status
   WHERE i.id = _inventory_item_id;

  INSERT INTO public.inventory_activity_logs(inventory_item_id, actor_id, action, summary, detail)
  VALUES (_inventory_item_id, v_uid, 'loss',
    'Loss recorded: '||v_loss||' ('||_reason||')',
    jsonb_build_object('qty', v_loss, 'reason', _reason, 'note', _note));

  quantity_available := v_new_avail;
  quantity_lost := v_new_lost;
  availability_status := v_new_status::text;
  RETURN NEXT;
END;
$function$;