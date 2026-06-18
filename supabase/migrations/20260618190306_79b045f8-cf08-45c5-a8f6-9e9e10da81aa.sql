-- =========================================================================
-- Phase 2 CMS new-arrivals: image sourcing
-- =========================================================================

-- 1) content_items <-> vendor_batches FK (replaces text link in notes)
ALTER TABLE public.content_items
  ADD COLUMN source_vendor_batch_id uuid
  REFERENCES public.vendor_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_content_items_source_vendor_batch
  ON public.content_items(source_vendor_batch_id)
  WHERE source_vendor_batch_id IS NOT NULL;

-- 2) species_image_candidates
CREATE TABLE public.species_image_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  species_key text,
  vendor_line_item_id uuid REFERENCES public.vendor_line_items(id) ON DELETE SET NULL,
  source text NOT NULL,                       -- 'vendor:<name>' | 'wikimedia' | 'inaturalist'
  source_url text NOT NULL,                   -- page the image was discovered on
  image_url text NOT NULL,                    -- direct image URL from Firecrawl
  storage_path text,                          -- set on approve (downloaded into bucket)
  license text,
  attribution text,
  commercial_ok boolean,
  ai_match_confidence numeric,
  approved boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (species_key IS NOT NULL OR vendor_line_item_id IS NOT NULL)
);

CREATE INDEX idx_sic_species_key ON public.species_image_candidates(species_key)
  WHERE species_key IS NOT NULL;
CREATE INDEX idx_sic_line ON public.species_image_candidates(vendor_line_item_id)
  WHERE vendor_line_item_id IS NOT NULL;
CREATE INDEX idx_sic_approved ON public.species_image_candidates(approved);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.species_image_candidates TO authenticated;
GRANT ALL ON public.species_image_candidates TO service_role;
ALTER TABLE public.species_image_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sic select active" ON public.species_image_candidates
  FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "sic insert editor" ON public.species_image_candidates
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "sic update editor" ON public.species_image_candidates
  FOR UPDATE TO authenticated
  USING (public.can_edit_content(auth.uid()))
  WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "sic delete editor" ON public.species_image_candidates
  FOR DELETE TO authenticated USING (public.can_edit_content(auth.uid()));

CREATE TRIGGER touch_sic BEFORE UPDATE ON public.species_image_candidates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) workspace_content_settings — singleton, admin-only
CREATE TABLE public.workspace_content_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_photos_ok boolean NOT NULL DEFAULT false,
  vendor_photos_ok_attested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vendor_photos_ok_attested_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_content_settings TO authenticated;
GRANT ALL ON public.workspace_content_settings TO service_role;
ALTER TABLE public.workspace_content_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wcs admin all" ON public.workspace_content_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_wcs BEFORE UPDATE ON public.workspace_content_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.workspace_content_settings (vendor_photos_ok) VALUES (false);