
-- Phase 0 v2: non-destructive enum migration + helpers + record_inventory_loss

-- 1. Backfill user_roles to target set BEFORE renaming 'staff' so collapsed rows land cleanly.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

UPDATE public.user_roles SET role = 'admin'::public.app_role
  WHERE role::text IN ('manager','reviewer','creator');
UPDATE public.user_roles SET role = 'staff'::public.app_role
  WHERE role::text = 'viewer';

DELETE FROM public.user_roles a
  USING public.user_roles b
  WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.role = b.role;

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- 2. Enum: rename staff→floor_staff, add dev. (Deprecated labels stay; not assigned to anyone.)
ALTER TYPE public.app_role RENAME VALUE 'staff' TO 'floor_staff';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dev';

-- 3. Helpers — text-compared so we don't reference the freshly-added 'dev' literal in this txn.
CREATE OR REPLACE FUNCTION public.is_admin_or_dev(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_user(_user_id)
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role::text IN ('admin','dev')
    )
$$;

CREATE OR REPLACE FUNCTION public.is_floor_staff_or_above(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_user(_user_id)
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role::text IN ('admin','dev','floor_staff')
    )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_content(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin_or_dev(_user_id)
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_dev(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_floor_staff_or_above(uuid) TO authenticated;

-- 4. record_inventory_loss — atomic mortality/loss for floor staff.
CREATE OR REPLACE FUNCTION public.record_inventory_loss(
  _inventory_item_id uuid,
  _qty numeric,
  _reason text,
  _note text DEFAULT NULL
) RETURNS TABLE(
  quantity_available numeric,
  quantity_lost numeric,
  availability_status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_item public.inventory_items%ROWTYPE;
  v_loss numeric;
  v_new_avail numeric;
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

  v_new_status := v_item.availability_status;
  IF v_new_avail = 0 AND v_item.availability_status = 'available' THEN
    IF COALESCE(v_item.quantity_sold, 0) = 0
       AND COALESCE(v_item.quantity_on_hold, 0) = 0 THEN
      v_new_status := 'dead_lost';
    ELSE
      v_new_status := 'sold_out';
    END IF;
  END IF;

  UPDATE public.inventory_items
     SET quantity_available = v_new_avail,
         quantity_lost = COALESCE(quantity_lost, 0) + v_loss,
         availability_status = v_new_status
   WHERE id = _inventory_item_id;

  INSERT INTO public.inventory_activity_logs(inventory_item_id, actor_id, action, summary, detail)
  VALUES (_inventory_item_id, v_uid, 'loss',
    'Loss recorded: '||v_loss||' ('||_reason||')',
    jsonb_build_object('qty', v_loss, 'reason', _reason, 'note', _note));

  quantity_available := v_new_avail;
  quantity_lost := COALESCE(v_item.quantity_lost, 0) + v_loss;
  availability_status := v_new_status::text;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_loss(uuid, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_inventory_loss(uuid, numeric, text, text) TO authenticated;
