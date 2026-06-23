
-- =========================================================================
-- 2026_website_enablement.sql
-- =========================================================================

-- ---------- 1. Enum additions -------------------------------------------------
ALTER TYPE public.inventory_activity_action ADD VALUE IF NOT EXISTS 'media_change';
ALTER TYPE public.inventory_activity_action ADD VALUE IF NOT EXISTS 'website_ready_change';

DO $$ BEGIN
  CREATE TYPE public.media_view AS ENUM ('daylight','actinic','video_still','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- 2. inventory_items columns ---------------------------------------
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS is_wysiwyg boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS specimen_notes text,
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS is_house_line boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_website_ready boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_inventory_items_product_id ON public.inventory_items(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_website_ready
  ON public.inventory_items(is_website_ready) WHERE is_website_ready;

-- ---------- 3. inventory_media columns ---------------------------------------
ALTER TABLE public.inventory_media
  ADD COLUMN IF NOT EXISTS view public.media_view,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventory_media_primary
  ON public.inventory_media(inventory_item_id) WHERE is_primary;

-- ---------- 5. store_locations NAP + hours -----------------------------------
ALTER TABLE public.store_locations
  ADD COLUMN IF NOT EXISTS is_public        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS address_line1    text,
  ADD COLUMN IF NOT EXISTS address_line2    text,
  ADD COLUMN IF NOT EXISTS city             text,
  ADD COLUMN IF NOT EXISTS region           text,
  ADD COLUMN IF NOT EXISTS postal_code      text,
  ADD COLUMN IF NOT EXISTS country          text DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS phone            text,
  ADD COLUMN IF NOT EXISTS public_email     text,
  ADD COLUMN IF NOT EXISTS hours            jsonb,
  ADD COLUMN IF NOT EXISTS lat              double precision,
  ADD COLUMN IF NOT EXISTS lng              double precision;

-- ---------- 6. collections ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.collections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,
  title           text NOT NULL,
  description     text,
  hero_media_id   uuid REFERENCES public.inventory_media(id) ON DELETE SET NULL,
  sort_order      integer NOT NULL DEFAULT 0,
  is_published    boolean NOT NULL DEFAULT false,
  filter          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT ALL ON public.collections TO service_role;

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collections read (authenticated)"
  ON public.collections FOR SELECT TO authenticated
  USING (public.is_active_user(auth.uid()));

CREATE POLICY "collections write (admin/dev)"
  ON public.collections FOR ALL TO authenticated
  USING (public.is_admin_or_dev(auth.uid()))
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

CREATE TRIGGER trg_collections_touch
  BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- 7. site_settings (singleton) -------------------------------------
CREATE TABLE IF NOT EXISTS public.site_settings (
  id                       boolean PRIMARY KEY DEFAULT true CHECK (id),
  site_title               text,
  tagline                  text,
  default_og_image_path    text,
  social                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  announcement             text,
  storage_base             text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;
GRANT ALL ON public.site_settings TO service_role;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_settings read (authenticated)"
  ON public.site_settings FOR SELECT TO authenticated
  USING (public.is_active_user(auth.uid()));

CREATE POLICY "site_settings write (admin/dev)"
  ON public.site_settings FOR ALL TO authenticated
  USING (public.is_admin_or_dev(auth.uid()))
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

CREATE TRIGGER trg_site_settings_touch
  BEFORE UPDATE ON public.site_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.site_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------- 9. is_website_ready trigger --------------------------------------
CREATE OR REPLACE FUNCTION public.compute_inventory_website_ready(_item public.inventory_items)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _item.pricing_status = 'approved'
    AND _item.retail_price IS NOT NULL
    AND COALESCE(_item.needs_photo, false) = false
    AND _item.item_name IS NOT NULL
    AND length(btrim(_item.item_name)) > 0
    AND EXISTS (
      SELECT 1 FROM public.inventory_media m
      WHERE m.inventory_item_id = _item.id AND m.tag = 'website'
    );
$$;

CREATE OR REPLACE FUNCTION public.set_inventory_website_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new boolean;
BEGIN
  v_new := public.compute_inventory_website_ready(NEW);
  IF NEW.is_website_ready IS DISTINCT FROM v_new THEN
    NEW.is_website_ready := v_new;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_items_website_ready ON public.inventory_items;
CREATE TRIGGER trg_inventory_items_website_ready
  BEFORE INSERT OR UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_inventory_website_ready();

CREATE OR REPLACE FUNCTION public.recompute_item_website_ready_from_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
  v_item public.inventory_items%ROWTYPE;
  v_new boolean;
  v_actor uuid := auth.uid();
BEGIN
  v_item_id := COALESCE(NEW.inventory_item_id, OLD.inventory_item_id);
  IF v_item_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT * INTO v_item FROM public.inventory_items WHERE id = v_item_id;
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_new := public.compute_inventory_website_ready(v_item);

  IF v_item.is_website_ready IS DISTINCT FROM v_new THEN
    UPDATE public.inventory_items
       SET is_website_ready = v_new
     WHERE id = v_item_id;

    INSERT INTO public.inventory_activity_logs(inventory_item_id, actor_id, action, summary, detail)
    VALUES (v_item_id, v_actor, 'website_ready_change',
      'Website-ready '||v_item.is_website_ready::text||' → '||v_new::text||' (media change)',
      jsonb_build_object('from', v_item.is_website_ready, 'to', v_new, 'trigger', 'media'));
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_media_recompute_ready ON public.inventory_media;
CREATE TRIGGER trg_inventory_media_recompute_ready
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_media
  FOR EACH ROW EXECUTE FUNCTION public.recompute_item_website_ready_from_media();

-- ---------- 10. Public read views --------------------------------------------
CREATE OR REPLACE VIEW public.v_public_inventory AS
SELECT
  i.id, i.item_name, i.scientific_name, i.item_type,
  i.availability_status, i.retail_price, i.compare_at_price,
  i.is_wysiwyg, i.is_house_line, i.specimen_notes,
  i.product_id, i.location_id, i.attrs, i.updated_at,
  pm.id           AS primary_media_id,
  pm.storage_path AS primary_media_path,
  pm.view         AS primary_media_view
FROM public.inventory_items i
LEFT JOIN LATERAL (
  SELECT m.id, m.storage_path, m.view
  FROM public.inventory_media m
  WHERE m.inventory_item_id = i.id AND m.tag = 'website'
  ORDER BY m.is_primary DESC, m.created_at ASC
  LIMIT 1
) pm ON true
WHERE i.is_website_ready = true
  AND i.availability_status IN ('available','on_hold');

GRANT SELECT ON public.v_public_inventory TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_public_media AS
SELECT m.id, m.inventory_item_id, m.storage_path, m.view, m.is_primary, m.created_at
FROM public.inventory_media m
JOIN public.inventory_items i ON i.id = m.inventory_item_id
WHERE m.tag = 'website'
  AND i.is_website_ready = true
  AND i.availability_status IN ('available','on_hold');

GRANT SELECT ON public.v_public_media TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_public_collections AS
SELECT c.id, c.slug, c.title, c.description, c.sort_order, c.filter,
       c.hero_media_id, hm.storage_path AS hero_media_path, c.updated_at
FROM public.collections c
LEFT JOIN public.inventory_media hm ON hm.id = c.hero_media_id
WHERE c.is_published = true;

GRANT SELECT ON public.v_public_collections TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_public_locations AS
SELECT id, name, slug, kind,
       address_line1, address_line2, city, region, postal_code, country,
       phone, public_email, hours, lat, lng, primary_photo_url
FROM public.store_locations
WHERE is_public = true AND is_active = true;

GRANT SELECT ON public.v_public_locations TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_public_site_settings AS
SELECT site_title, tagline, default_og_image_path, social, announcement, storage_base, updated_at
FROM public.site_settings WHERE id = true;

GRANT SELECT ON public.v_public_site_settings TO anon, authenticated;

-- ---------- 11. Backfill -----------------------------------------------------
UPDATE public.inventory_items i
   SET is_website_ready = public.compute_inventory_website_ready(i)
 WHERE i.is_website_ready IS DISTINCT FROM public.compute_inventory_website_ready(i);
