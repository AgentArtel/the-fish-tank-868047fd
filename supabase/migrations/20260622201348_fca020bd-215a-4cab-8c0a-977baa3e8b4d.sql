
-- Add new activity action for trade-in intake
ALTER TYPE public.inventory_activity_action ADD VALUE IF NOT EXISTS 'trade_in';

-- 1. Narrow customer search for floor staff
CREATE OR REPLACE FUNCTION public.search_customers_for_staff(_q text DEFAULT NULL)
RETURNS TABLE(id uuid, first_name text, last_name text, email text, phone text, last_seen_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.first_name, c.last_name, c.email, c.phone, c.last_seen_at
  FROM public.customers c
  WHERE public.is_floor_staff_or_above(auth.uid())
    AND (
      _q IS NULL OR length(btrim(_q)) = 0 OR (
        c.first_name ILIKE '%'||_q||'%'
        OR c.last_name ILIKE '%'||_q||'%'
        OR c.email     ILIKE '%'||_q||'%'
        OR c.phone     ILIKE '%'||_q||'%'
      )
    )
  ORDER BY c.last_seen_at DESC NULLS LAST
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.search_customers_for_staff(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_customers_for_staff(text) TO authenticated;

-- 2. Atomic trade-in intake
CREATE OR REPLACE FUNCTION public.record_trade_in(
  _customer_id  uuid,
  _new_customer jsonb,
  _location_id  uuid,
  _lines        jsonb,
  _note         text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cust uuid;
  v_line jsonb;
  v_item_ids uuid[] := ARRAY[]::uuid[];
  v_total integer := 0;
  v_qty numeric;
  v_credit integer;
  v_item_type text;
  v_name text;
  v_new_id uuid;
  v_balance bigint;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_related_ref text;
BEGIN
  IF v_uid IS NULL OR NOT public.is_floor_staff_or_above(v_uid) THEN
    RAISE EXCEPTION 'Forbidden: floor-staff role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _lines IS NULL OR jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) = 0 THEN
    RAISE EXCEPTION 'At least one trade-in line is required';
  END IF;

  -- Resolve / create customer
  IF _customer_id IS NOT NULL THEN
    PERFORM 1 FROM public.customers WHERE id = _customer_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer % not found', _customer_id;
    END IF;
    v_cust := _customer_id;
  ELSE
    IF _new_customer IS NULL OR jsonb_typeof(_new_customer) <> 'object' THEN
      RAISE EXCEPTION 'Either _customer_id or _new_customer must be provided';
    END IF;
    v_first_name := NULLIF(btrim(_new_customer->>'first_name'), '');
    v_last_name  := NULLIF(btrim(_new_customer->>'last_name'), '');
    v_email      := NULLIF(btrim(_new_customer->>'email'), '');
    v_phone      := NULLIF(btrim(_new_customer->>'phone'), '');
    IF v_first_name IS NULL AND v_last_name IS NULL AND v_email IS NULL AND v_phone IS NULL THEN
      RAISE EXCEPTION 'New customer requires at least a name or contact field';
    END IF;
    INSERT INTO public.customers (first_name, last_name, email, phone, created_by)
    VALUES (v_first_name, v_last_name, v_email, v_phone, v_uid)
    RETURNING id INTO v_cust;
  END IF;

  -- Validate lines + accumulate total
  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines)
  LOOP
    v_name      := NULLIF(btrim(COALESCE(v_line->>'name','')), '');
    v_item_type := COALESCE(v_line->>'item_type','');
    v_qty       := COALESCE((v_line->>'qty')::numeric, 0);
    v_credit    := COALESCE((v_line->>'credit_cents')::integer, 0);

    IF v_name IS NULL THEN
      RAISE EXCEPTION 'Line missing name';
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Line "%" qty must be > 0', v_name;
    END IF;
    IF v_credit < 0 THEN
      RAISE EXCEPTION 'Line "%" credit_cents must be >= 0', v_name;
    END IF;
    IF v_item_type NOT IN ('fish','coral','invert','dry_good','live_rock','equipment','other') THEN
      RAISE EXCEPTION 'Line "%" has invalid item_type: %', v_name, v_item_type;
    END IF;

    v_total := v_total + v_credit;
  END LOOP;

  -- Insert draft inventory items
  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines)
  LOOP
    v_name      := btrim(v_line->>'name');
    v_item_type := v_line->>'item_type';
    v_qty       := (v_line->>'qty')::numeric;
    v_credit    := COALESCE((v_line->>'credit_cents')::integer, 0);

    INSERT INTO public.inventory_items (
      item_name, scientific_name, item_type,
      quantity_received, quantity_available, quantity_on_hold, quantity_sold, quantity_lost,
      pricing_status, availability_status, live_sale_status,
      location_id, wholesale_cost, retail_price, needs_photo,
      received_at, received_by, created_by, attrs
    ) VALUES (
      v_name,
      NULLIF(btrim(COALESCE(v_line->>'scientific_name','')), ''),
      v_item_type::public.item_type,
      v_qty, v_qty, 0, 0, 0,
      'not_priced'::public.inventory_pricing_status,
      'incoming'::public.inventory_availability_status,
      'not_eligible'::public.inventory_live_sale_status,
      _location_id,
      CASE WHEN v_qty > 0 THEN (v_credit::numeric / 100.0) / v_qty ELSE NULL END,
      NULL,
      true,
      now(), v_uid, v_uid,
      jsonb_build_object(
        'trade_in', jsonb_build_object(
          'customer_id', v_cust,
          'condition',   v_line->>'condition',
          'credit_cents', v_credit
        )
      )
    )
    RETURNING id INTO v_new_id;

    v_item_ids := v_item_ids || v_new_id;

    INSERT INTO public.inventory_activity_logs(inventory_item_id, actor_id, action, summary, detail)
    VALUES (v_new_id, v_uid, 'trade_in',
      'Trade-in intake: '||v_name||' x'||v_qty,
      jsonb_build_object(
        'customer_id', v_cust,
        'qty', v_qty,
        'credit_cents', v_credit,
        'condition', v_line->>'condition',
        'note', _note
      ));
  END LOOP;

  -- Grant store credit once for the total
  IF v_total > 0 THEN
    v_related_ref := v_item_ids[1]::text;
    INSERT INTO public.store_credit_ledger
      (customer_id, kind, amount_cents, source, related_ref, reason, created_by)
    VALUES
      (v_cust, 'grant', v_total, 'trade_in', v_related_ref,
       COALESCE(_note, 'Trade-in intake'), v_uid);
  END IF;

  SELECT balance_cents INTO v_balance FROM public.store_credit_summary(v_cust);

  RETURN jsonb_build_object(
    'customer_id',   v_cust,
    'item_ids',      to_jsonb(v_item_ids),
    'credit_cents',  v_total,
    'balance_cents', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_trade_in(uuid, jsonb, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_trade_in(uuid, jsonb, uuid, jsonb, text) TO authenticated;
