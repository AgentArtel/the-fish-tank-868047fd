
-- Phase 1b: Clover item ↔ inventory mapping
CREATE TABLE public.clover_item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  clover_item_id text NOT NULL UNIQUE,
  clover_name text,
  clover_price_cents integer,
  link_status text NOT NULL DEFAULT 'linked' CHECK (link_status IN ('linked','unlinked')),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clover_item_links TO authenticated;
GRANT ALL ON public.clover_item_links TO service_role;

ALTER TABLE public.clover_item_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editors_select_clover_item_links" ON public.clover_item_links
  FOR SELECT TO authenticated
  USING (public.can_edit_content(auth.uid()));

CREATE POLICY "editors_insert_clover_item_links" ON public.clover_item_links
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_content(auth.uid()));

CREATE POLICY "editors_update_clover_item_links" ON public.clover_item_links
  FOR UPDATE TO authenticated
  USING (public.can_edit_content(auth.uid()))
  WITH CHECK (public.can_edit_content(auth.uid()));

CREATE POLICY "admins_delete_clover_item_links" ON public.clover_item_links
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_clover_item_links_inventory ON public.clover_item_links(inventory_item_id);
CREATE INDEX idx_clover_item_links_status ON public.clover_item_links(link_status);

CREATE TRIGGER trg_clover_item_links_updated_at
  BEFORE UPDATE ON public.clover_item_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Phase 1b: Clover connection status (single row; no credentials)
CREATE TABLE public.clover_connection (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  merchant_id text,
  base_url text DEFAULT 'https://api.clover.com',
  connected boolean NOT NULL DEFAULT false,
  last_import_at timestamptz,
  last_sale_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.clover_connection TO authenticated;
GRANT ALL ON public.clover_connection TO service_role;

ALTER TABLE public.clover_connection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editors_select_clover_connection" ON public.clover_connection
  FOR SELECT TO authenticated
  USING (public.can_edit_content(auth.uid()));

CREATE POLICY "admins_insert_clover_connection" ON public.clover_connection
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins_update_clover_connection" ON public.clover_connection
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_clover_connection_updated_at
  BEFORE UPDATE ON public.clover_connection
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed the single connection row (disconnected) so the app can read/update it
INSERT INTO public.clover_connection (id, connected) VALUES (true, false);
