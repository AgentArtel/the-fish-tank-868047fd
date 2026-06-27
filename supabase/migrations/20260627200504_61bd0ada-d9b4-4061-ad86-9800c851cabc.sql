
INSERT INTO public.store_locations (
  slug, name, kind, is_active, is_public,
  address_line1, city, region, postal_code, country,
  phone, hours, sort_order
) VALUES (
  'sandy',
  'The Fish Tank',
  'other'::store_location_kind,
  true, true,
  '8371 700 W', 'Sandy', 'UT', '84070', 'US',
  '(801) 887-7000',
  jsonb_build_array(
    jsonb_build_object('day','Mon','open','11:30','close','20:00'),
    jsonb_build_object('day','Tue','open','11:30','close','20:00'),
    jsonb_build_object('day','Wed','open','11:30','close','20:00'),
    jsonb_build_object('day','Thu','open','11:30','close','20:00'),
    jsonb_build_object('day','Fri','open','11:30','close','20:00'),
    jsonb_build_object('day','Sat','open','11:00','close','18:00'),
    jsonb_build_object('day','Sun','open','11:00','close','16:00')
  ),
  -1000
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  is_public = true,
  address_line1 = EXCLUDED.address_line1,
  city = EXCLUDED.city,
  region = EXCLUDED.region,
  postal_code = EXCLUDED.postal_code,
  country = EXCLUDED.country,
  phone = EXCLUDED.phone,
  hours = EXCLUDED.hours,
  sort_order = EXCLUDED.sort_order;

UPDATE public.store_locations
   SET is_public = false
 WHERE slug <> 'sandy' AND is_public = true;

UPDATE public.site_settings
   SET data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
     'serviceAreas', jsonb_build_array(
       'Sandy, UT','Draper, UT','South Jordan, UT','West Jordan, UT',
       'Midvale, UT','Murray, UT','Cottonwood Heights, UT','Riverton, UT',
       'Salt Lake City, UT'
     )
   )
 WHERE id = true;

DROP VIEW IF EXISTS public.v_public_site_settings;
CREATE VIEW public.v_public_site_settings
WITH (security_invoker = on) AS
SELECT
  site_title,
  tagline,
  default_og_image_path,
  social,
  announcement,
  storage_base,
  COALESCE(data->'serviceAreas', '[]'::jsonb) AS service_areas,
  COALESCE(data, '{}'::jsonb) AS data,
  updated_at
FROM public.site_settings
WHERE id = true;

GRANT SELECT ON public.v_public_site_settings TO anon, authenticated;

DROP VIEW IF EXISTS public.v_public_inventory;
CREATE VIEW public.v_public_inventory
WITH (security_invoker = on) AS
SELECT
  i.id,
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
  p.care_notes  AS care_notes,
  p.description AS description,
  pm.id           AS primary_media_id,
  pm.storage_path AS primary_media_path,
  pm.view         AS primary_media_view
FROM public.inventory_items i
LEFT JOIN public.products p ON p.id = i.product_id
LEFT JOIN LATERAL (
  SELECT m.id, m.storage_path, m.view
    FROM public.inventory_media m
   WHERE m.inventory_item_id = i.id
     AND m.tag = 'website'::inventory_media_tag
   ORDER BY m.is_primary DESC, m.created_at
   LIMIT 1
) pm ON true
WHERE i.is_website_ready = true
  AND i.availability_status IN (
    'available'::inventory_availability_status,
    'on_hold'::inventory_availability_status
  );

GRANT SELECT ON public.v_public_inventory TO anon, authenticated;
