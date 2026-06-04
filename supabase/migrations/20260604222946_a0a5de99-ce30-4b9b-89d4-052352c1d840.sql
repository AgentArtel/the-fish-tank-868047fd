
ALTER TABLE public.vendor_line_items ADD COLUMN IF NOT EXISTS override_retail_price numeric(12,2);

CREATE TABLE public.vendor_line_receive_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_line_item_id uuid NOT NULL REFERENCES public.vendor_line_items(id) ON DELETE CASCADE,
  vendor_batch_id uuid NOT NULL REFERENCES public.vendor_batches(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  received_quantity numeric(12,2),
  lost_quantity numeric(12,2),
  loss_reason text,
  assigned_location_id uuid REFERENCES public.store_locations(id) ON DELETE SET NULL,
  override_retail_price numeric(12,2),
  prev_received_quantity numeric(12,2),
  prev_lost_quantity numeric(12,2),
  prev_loss_reason text,
  prev_assigned_location_id uuid,
  prev_override_retail_price numeric(12,2),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vlrl_line ON public.vendor_line_receive_logs(vendor_line_item_id, created_at DESC);
CREATE INDEX idx_vlrl_batch ON public.vendor_line_receive_logs(vendor_batch_id, created_at DESC);

GRANT SELECT, INSERT ON public.vendor_line_receive_logs TO authenticated;
GRANT ALL ON public.vendor_line_receive_logs TO service_role;
ALTER TABLE public.vendor_line_receive_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "receive logs select active" ON public.vendor_line_receive_logs
  FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "receive logs insert editor" ON public.vendor_line_receive_logs
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));

CREATE TABLE public.vendor_line_doa_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_line_item_id uuid NOT NULL REFERENCES public.vendor_line_items(id) ON DELETE CASCADE,
  vendor_batch_id uuid NOT NULL REFERENCES public.vendor_batches(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('in_bag','on_lid')),
  storage_path text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_line_item_id, kind)
);
CREATE INDEX idx_doa_line ON public.vendor_line_doa_photos(vendor_line_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_line_doa_photos TO authenticated;
GRANT ALL ON public.vendor_line_doa_photos TO service_role;
ALTER TABLE public.vendor_line_doa_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doa photos select active" ON public.vendor_line_doa_photos
  FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "doa photos insert editor" ON public.vendor_line_doa_photos
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "doa photos update editor" ON public.vendor_line_doa_photos
  FOR UPDATE TO authenticated USING (public.can_edit_content(auth.uid())) WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "doa photos delete admin" ON public.vendor_line_doa_photos
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
