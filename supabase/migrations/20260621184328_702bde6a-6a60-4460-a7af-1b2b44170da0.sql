
CREATE OR REPLACE FUNCTION public.apply_inventory_sale(
  _inventory_item_id uuid,
  _qty numeric,
  _unit_price_cents integer DEFAULT NULL,
  _source text DEFAULT 'manual',
  _kind text DEFAULT 'sale',
  _clover_order_id text DEFAULT NULL,
  _clover_line_item_id text DEFAULT NULL,
  _clover_payment_id text DEFAULT NULL,
  _clover_item_name text DEFAULT NULL,
  _customer_id uuid DEFAULT NULL,
  _user_id uuid DEFAULT NULL
)
RETURNS TABLE(sale_event_id uuid, duplicate boolean, earn_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.inventory_items%ROWTYPE;
  v_total integer;
  v_status text;
  v_stock_mode text;
  v_is_colony boolean;
  v_sale_id uuid;
  v_existing_id uuid;
  v_duplicate boolean := false;
  v_loy_enabled boolean := false;
  v_loy_pct numeric := 0;
  v_earn_cents integer := 0;
BEGIN
  -- Idempotency check (matches UNIQUE(clover_order_id, clover_line_item_id)).
  IF _clover_order_id IS NOT NULL AND _clover_line_item_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.inventory_sale_events
    WHERE clover_order_id = _clover_order_id
      AND clover_line_item_id = _clover_line_item_id
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      sale_event_id := v_existing_id;
      duplicate := true;
      earn_cents := 0;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = _inventory_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % not found', _inventory_item_id;
  END IF;

  v_stock_mode := (v_item.attrs->>'stock_mode');
  v_is_colony := (v_item.item_type = 'coral' AND v_stock_mode = 'colony');

  v_total := CASE WHEN _unit_price_cents IS NULL THEN NULL
                  ELSE (_unit_price_cents * _qty)::integer END;

  v_status := CASE WHEN _kind = 'sale' THEN 'applied' ELSE 'needs_review' END;

  INSERT INTO public.inventory_sale_events (
    inventory_item_id, qty, unit_price_cents, total_cents,
    source, kind, status,
    clover_order_id, clover_line_item_id, clover_payment_id, clover_item_name,
    customer_id, created_by
  ) VALUES (
    _inventory_item_id, _qty, _unit_price_cents, v_total,
    _source, _kind, v_status,
    _clover_order_id, _clover_line_item_id, _clover_payment_id, _clover_item_name,
    _customer_id, _user_id
  )
  RETURNING id INTO v_sale_id;

  -- Decrement stock for a real sale on a tracked item.
  IF _kind = 'sale' AND NOT v_is_colony THEN
    PERFORM public.decrement_inventory_stock(_inventory_item_id, _qty);
  END IF;

  -- Loyalty earn (best-effort — idempotent on UNIQUE(sale_event_id, kind)).
  IF _kind = 'sale' AND _customer_id IS NOT NULL AND v_total IS NOT NULL AND v_total > 0 THEN
    SELECT enabled, COALESCE(earn_percent, 0)
      INTO v_loy_enabled, v_loy_pct
      FROM public.loyalty_config
      WHERE id = true
      LIMIT 1;
    IF v_loy_enabled AND v_loy_pct > 0 THEN
      v_earn_cents := FLOOR(v_total * v_loy_pct / 100.0)::integer;
      IF v_earn_cents > 0 THEN
        BEGIN
          INSERT INTO public.loyalty_ledger (
            customer_id, kind, amount_cents, channel, reason, sale_event_id, created_by
          ) VALUES (
            _customer_id, 'earn', v_earn_cents, 'in_store',
            v_loy_pct::text || '% Reef Credit on purchase',
            v_sale_id, _user_id
          );
        EXCEPTION WHEN unique_violation THEN
          v_earn_cents := 0;
        END;
      END IF;
    END IF;
  END IF;

  sale_event_id := v_sale_id;
  duplicate := v_duplicate;
  earn_cents := v_earn_cents;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_inventory_sale(uuid, numeric, integer, text, text, text, text, text, text, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_inventory_sale(uuid, numeric, integer, text, text, text, text, text, text, uuid, uuid) TO authenticated, service_role;
