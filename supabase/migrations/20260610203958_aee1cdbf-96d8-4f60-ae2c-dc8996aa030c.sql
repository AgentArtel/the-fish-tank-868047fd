CREATE TABLE public.vendor_line_item_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_line_item_id uuid NOT NULL REFERENCES public.vendor_line_items(id) ON DELETE CASCADE,
  vendor_batch_id uuid NOT NULL REFERENCES public.vendor_batches(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('bag','tag')),
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vli_photos_line ON public.vendor_line_item_photos(vendor_line_item_id);
CREATE INDEX idx_vli_photos_batch ON public.vendor_line_item_photos(vendor_batch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_line_item_photos TO authenticated;
GRANT ALL ON public.vendor_line_item_photos TO service_role;
ALTER TABLE public.vendor_line_item_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vli photos select active" ON public.vendor_line_item_photos
  FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "vli photos insert editor" ON public.vendor_line_item_photos
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "vli photos update editor" ON public.vendor_line_item_photos
  FOR UPDATE TO authenticated USING (public.can_edit_content(auth.uid())) WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "vli photos delete editor" ON public.vendor_line_item_photos
  FOR DELETE TO authenticated USING (public.can_edit_content(auth.uid()));