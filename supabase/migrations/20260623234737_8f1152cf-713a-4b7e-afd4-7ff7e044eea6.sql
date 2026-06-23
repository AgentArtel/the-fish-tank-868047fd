
-- 1) site_settings: add `data` jsonb for free-form public site config (serviceAreas, etc.)
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) inventory_items: SEO slug as a generated column (immutable derivation)
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS slug text GENERATED ALWAYS AS (
    btrim(
      regexp_replace(lower(coalesce(item_name, 'item')), '[^a-z0-9]+', '-', 'g'),
      '-'
    ) || '-' || substr(id::text, 1, 8)
  ) STORED;

CREATE INDEX IF NOT EXISTS inventory_items_slug_idx ON public.inventory_items (slug);

-- 3) Expose slug on the public inventory view
DROP VIEW IF EXISTS public.v_public_inventory;
CREATE VIEW public.v_public_inventory
WITH (security_invoker = true)
AS
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
  pm.id           AS primary_media_id,
  pm.storage_path AS primary_media_path,
  pm.view         AS primary_media_view
FROM public.inventory_items i
LEFT JOIN LATERAL (
  SELECT m.id, m.storage_path, m.view
  FROM public.inventory_media m
  WHERE m.inventory_item_id = i.id
    AND m.tag = 'website'::public.inventory_media_tag
  ORDER BY m.is_primary DESC, m.created_at
  LIMIT 1
) pm ON true
WHERE i.is_website_ready = true
  AND i.availability_status IN ('available'::public.inventory_availability_status,
                                'on_hold'::public.inventory_availability_status);

GRANT SELECT ON public.v_public_inventory TO anon, authenticated;

-- 4) clover_item_links: enrichment columns from per-category Clover import
ALTER TABLE public.clover_item_links
  ADD COLUMN IF NOT EXISTS clover_category_id    text,
  ADD COLUMN IF NOT EXISTS clover_category_name  text,
  ADD COLUMN IF NOT EXISTS clover_code           text,
  ADD COLUMN IF NOT EXISTS clover_price_type     text,
  ADD COLUMN IF NOT EXISTS clover_modified_time  bigint;

CREATE INDEX IF NOT EXISTS clover_item_links_category_idx
  ON public.clover_item_links (clover_category_id);
CREATE INDEX IF NOT EXISTS clover_item_links_code_idx
  ON public.clover_item_links (clover_code) WHERE clover_code IS NOT NULL;
