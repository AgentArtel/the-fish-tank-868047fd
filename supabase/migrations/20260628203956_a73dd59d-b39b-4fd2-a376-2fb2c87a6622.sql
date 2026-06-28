
-- 1) sourceable flag
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS sourceable boolean;

COMMENT ON COLUMN public.inventory_items.sourceable IS
  'Can we re-order this? NULL = auto (derived from NOT is_wysiwyg). Effective value: COALESCE(sourceable, NOT is_wysiwyg).';

-- 2) RPC
CREATE OR REPLACE FUNCTION public.set_inventory_sourceable(_item_id uuid, _value boolean)
RETURNS public.inventory_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.inventory_items;
BEGIN
  IF v_uid IS NULL OR NOT public.is_floor_staff_or_above(v_uid) THEN
    RAISE EXCEPTION 'Forbidden: floor-staff role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.inventory_items
     SET sourceable = _value
   WHERE id = _item_id
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory item % not found', _item_id;
  END IF;

  INSERT INTO public.inventory_activity_logs(inventory_item_id, actor_id, action, summary, detail)
  VALUES (_item_id, v_uid, 'sourceable_change',
    'Sourceable set to '||COALESCE(_value::text,'auto'),
    jsonb_build_object('value', _value));

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_inventory_sourceable(uuid, boolean) TO authenticated;

-- 3) v_public_inventory: drop & recreate so we can change column shape
DROP VIEW IF EXISTS public.v_public_inventory;
CREATE VIEW public.v_public_inventory AS
SELECT i.id,
    i.slug,
    i.item_name,
    i.scientific_name,
    i.item_type,
    i.availability_status,
    i.retail_price,
    i.compare_at_price,
    i.is_wysiwyg,
    i.is_house_line,
    i.specimen_notes,
    i.product_id,
    i.location_id,
    i.attrs,
    i.updated_at,
    p.care_notes,
    p.description,
    pm.id AS primary_media_id,
    pm.storage_path AS primary_media_path,
    pm.view AS primary_media_view,
    COALESCE(i.sourceable, NOT i.is_wysiwyg) AS sourceable
FROM public.inventory_items i
LEFT JOIN public.products p ON p.id = i.product_id
LEFT JOIN LATERAL (
  SELECT m.id, m.storage_path, m.view
  FROM public.inventory_media m
  WHERE m.inventory_item_id = i.id AND m.tag = 'website'::inventory_media_tag
  ORDER BY m.is_primary DESC, m.created_at
  LIMIT 1
) pm ON true
WHERE i.is_website_ready = true
  AND (
    i.availability_status IN ('available'::inventory_availability_status, 'on_hold'::inventory_availability_status)
    OR (
      i.availability_status = 'sold_out'::inventory_availability_status
      AND COALESCE(i.sourceable, NOT i.is_wysiwyg) = true
    )
  );

GRANT SELECT ON public.v_public_inventory TO anon, authenticated;

-- 4) order_cycle setting + projection
UPDATE public.site_settings
   SET data = COALESCE(data, '{}'::jsonb) ||
              jsonb_build_object('order_cycle',
                COALESCE(data->'order_cycle',
                         '{"cutoff_day":"Sunday","ready_day":"Wednesday"}'::jsonb))
 WHERE id = true;

DROP VIEW IF EXISTS public.v_public_site_settings;
CREATE VIEW public.v_public_site_settings AS
SELECT site_title,
    tagline,
    default_og_image_path,
    social,
    announcement,
    storage_base,
    COALESCE(data -> 'serviceAreas'::text, '[]'::jsonb) AS service_areas,
    COALESCE(data -> 'order_cycle'::text,
             '{"cutoff_day":"Sunday","ready_day":"Wednesday"}'::jsonb) AS order_cycle,
    COALESCE(data, '{}'::jsonb) AS data,
    updated_at
FROM public.site_settings
WHERE id = true;

GRANT SELECT ON public.v_public_site_settings TO anon, authenticated;
