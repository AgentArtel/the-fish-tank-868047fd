-- Step 1: extend the role enum (must be in its own migration before values can be referenced)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';

-- Locations: sort order + denormalised primary photo for fast thumbnails
ALTER TABLE public.store_locations
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS primary_photo_url TEXT;

CREATE INDEX IF NOT EXISTS idx_store_locations_sort
  ON public.store_locations(parent_location_id, sort_order, name);

-- Photo gallery per location
CREATE TABLE IF NOT EXISTS public.store_location_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.store_locations(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_location_media TO authenticated;
GRANT ALL ON public.store_location_media TO service_role;

ALTER TABLE public.store_location_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loc media read auth"
  ON public.store_location_media FOR SELECT TO authenticated USING (true);
CREATE POLICY "loc media insert editor"
  ON public.store_location_media FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "loc media update editor"
  ON public.store_location_media FOR UPDATE TO authenticated
  USING (public.can_edit_content(auth.uid()))
  WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "loc media delete editor"
  ON public.store_location_media FOR DELETE TO authenticated
  USING (public.can_edit_content(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_store_location_media_location
  ON public.store_location_media(location_id, sort_order);

CREATE TRIGGER trg_store_location_media_touch
  BEFORE UPDATE ON public.store_location_media
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage RLS for the existing `media` bucket: allow authenticated reads + editor writes
-- under the `store-locations/` prefix
CREATE POLICY "media read auth store-locations"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = 'store-locations');
CREATE POLICY "media insert editor store-locations"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = 'store-locations' AND public.can_edit_content(auth.uid()));
CREATE POLICY "media update editor store-locations"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = 'store-locations' AND public.can_edit_content(auth.uid()));
CREATE POLICY "media delete editor store-locations"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = 'store-locations' AND public.can_edit_content(auth.uid()));