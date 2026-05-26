
-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE public.vendor_batch_source_document_type AS ENUM ('invoice','order_sheet','packing_list','manual_entry','other');
CREATE TYPE public.vendor_batch_intake_status AS ENUM ('draft','uploaded','parsing','review','approved','converted','archived');
CREATE TYPE public.vendor_batch_extraction_status AS ENUM ('not_started','manual','ai_pending','ai_done','failed');
CREATE TYPE public.vendor_line_review_status AS ENUM ('pending','approved','rejected','needs_info');
CREATE TYPE public.vendor_line_pricing_status AS ENUM ('not_priced','suggested','approved');
CREATE TYPE public.vendor_line_kind AS ENUM ('sellable','charge');
CREATE TYPE public.vendor_batch_charge_type AS ENUM ('freight','packaging','heat_pack','box','fuel_surcharge','discount','credit','tax','other');
CREATE TYPE public.inventory_availability_status AS ENUM ('incoming','quarantine','needs_id','available','on_hold','sold_out','not_for_sale','dead_lost');
CREATE TYPE public.inventory_pricing_status AS ENUM ('not_priced','approved');
CREATE TYPE public.inventory_live_sale_status AS ENUM ('not_eligible','eligible','staged','live','ended');
CREATE TYPE public.store_location_kind AS ENUM ('display_tank','coral_flat','live_sale_tank','quarantine','holding','dry_goods','back_of_house','other');
CREATE TYPE public.inventory_media_tag AS ENUM ('internal','social','website','live_sale');
CREATE TYPE public.inventory_activity_action AS ENUM ('created','updated','status_change','location_change','quantity_change','pricing_change','converted_from_line','note');

-- ============================================================
-- vendors
-- ============================================================
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  address TEXT,
  default_terms TEXT,
  default_carrier TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors select active" ON public.vendors FOR SELECT TO authenticated USING (is_active_user(auth.uid()));
CREATE POLICY "vendors insert editor" ON public.vendors FOR INSERT TO authenticated WITH CHECK (can_edit_content(auth.uid()));
CREATE POLICY "vendors update editor" ON public.vendors FOR UPDATE TO authenticated USING (can_edit_content(auth.uid()));
CREATE POLICY "vendors delete admin" ON public.vendors FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER vendors_touch_updated BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- store_locations
-- ============================================================
CREATE TABLE public.store_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind public.store_location_kind NOT NULL DEFAULT 'display_tank',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_live_sale BOOLEAN NOT NULL DEFAULT false,
  capacity_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_locations TO authenticated;
GRANT ALL ON public.store_locations TO service_role;
ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loc select active" ON public.store_locations FOR SELECT TO authenticated USING (is_active_user(auth.uid()));
CREATE POLICY "loc insert editor" ON public.store_locations FOR INSERT TO authenticated WITH CHECK (can_edit_content(auth.uid()));
CREATE POLICY "loc update editor" ON public.store_locations FOR UPDATE TO authenticated USING (can_edit_content(auth.uid()));
CREATE POLICY "loc delete admin" ON public.store_locations FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER loc_touch_updated BEFORE UPDATE ON public.store_locations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- vendor_batches
-- ============================================================
CREATE TABLE public.vendor_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  source_document_type public.vendor_batch_source_document_type NOT NULL DEFAULT 'invoice',
  invoice_number TEXT,
  order_number TEXT,
  po_number TEXT,
  sales_order_number TEXT,
  customer_number TEXT,
  invoice_date DATE,
  ship_date DATE,
  arrival_date DATE,
  tracking_number TEXT,
  awb_number TEXT,
  carrier TEXT,
  terms TEXT,
  pdf_storage_path TEXT,
  pdf_file_name TEXT,
  invoice_subtotal NUMERIC(12,2),
  invoice_discount NUMERIC(12,2),
  invoice_total NUMERIC(12,2),
  balance_due NUMERIC(12,2),
  intake_status public.vendor_batch_intake_status NOT NULL DEFAULT 'draft',
  extraction_status public.vendor_batch_extraction_status NOT NULL DEFAULT 'not_started',
  notes TEXT,
  created_by UUID,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vb_vendor ON public.vendor_batches(vendor_id);
CREATE INDEX idx_vb_intake_status ON public.vendor_batches(intake_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_batches TO authenticated;
GRANT ALL ON public.vendor_batches TO service_role;
ALTER TABLE public.vendor_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vb select active" ON public.vendor_batches FOR SELECT TO authenticated USING (is_active_user(auth.uid()));
CREATE POLICY "vb insert editor" ON public.vendor_batches FOR INSERT TO authenticated WITH CHECK (can_edit_content(auth.uid()));
CREATE POLICY "vb update editor" ON public.vendor_batches FOR UPDATE TO authenticated USING (can_edit_content(auth.uid()));
CREATE POLICY "vb delete admin" ON public.vendor_batches FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER vb_touch_updated BEFORE UPDATE ON public.vendor_batches FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- vendor_batch_charges
-- ============================================================
CREATE TABLE public.vendor_batch_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_batch_id UUID NOT NULL REFERENCES public.vendor_batches(id) ON DELETE CASCADE,
  charge_type public.vendor_batch_charge_type NOT NULL DEFAULT 'other',
  label TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vbc_batch ON public.vendor_batch_charges(vendor_batch_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_batch_charges TO authenticated;
GRANT ALL ON public.vendor_batch_charges TO service_role;
ALTER TABLE public.vendor_batch_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vbc select active" ON public.vendor_batch_charges FOR SELECT TO authenticated USING (is_active_user(auth.uid()));
CREATE POLICY "vbc insert editor" ON public.vendor_batch_charges FOR INSERT TO authenticated WITH CHECK (can_edit_content(auth.uid()));
CREATE POLICY "vbc update editor" ON public.vendor_batch_charges FOR UPDATE TO authenticated USING (can_edit_content(auth.uid()));
CREATE POLICY "vbc delete admin" ON public.vendor_batch_charges FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER vbc_touch_updated BEFORE UPDATE ON public.vendor_batch_charges FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- vendor_line_items
-- ============================================================
CREATE TABLE public.vendor_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_batch_id UUID NOT NULL REFERENCES public.vendor_batches(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  kind public.vendor_line_kind NOT NULL DEFAULT 'sellable',
  vendor_item_id TEXT,
  line_number INTEGER,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  size TEXT,
  raw_description TEXT,
  clean_item_name TEXT,
  scientific_name TEXT,
  category TEXT,
  subcategory TEXT,
  origin_region TEXT,
  regular_price NUMERIC(12,2),
  wholesale_cost NUMERIC(12,2),
  vendor_sell_price NUMERIC(12,2),
  line_total NUMERIC(12,2),
  has_discount BOOLEAN NOT NULL DEFAULT false,
  review_status public.vendor_line_review_status NOT NULL DEFAULT 'pending',
  pricing_status public.vendor_line_pricing_status NOT NULL DEFAULT 'not_priced',
  suggested_retail_price NUMERIC(12,2),
  approved_retail_price NUMERIC(12,2),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  extraction_warning TEXT,
  extraction_confidence NUMERIC(5,4),
  notes TEXT,
  converted_inventory_item_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vli_batch ON public.vendor_line_items(vendor_batch_id, line_number);
CREATE INDEX idx_vli_vendor ON public.vendor_line_items(vendor_id);
CREATE INDEX idx_vli_review ON public.vendor_line_items(review_status);
CREATE INDEX idx_vli_pricing ON public.vendor_line_items(pricing_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_line_items TO authenticated;
GRANT ALL ON public.vendor_line_items TO service_role;
ALTER TABLE public.vendor_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vli select active" ON public.vendor_line_items FOR SELECT TO authenticated USING (is_active_user(auth.uid()));
CREATE POLICY "vli insert editor" ON public.vendor_line_items FOR INSERT TO authenticated WITH CHECK (can_edit_content(auth.uid()));
CREATE POLICY "vli update editor" ON public.vendor_line_items FOR UPDATE TO authenticated USING (can_edit_content(auth.uid()));
CREATE POLICY "vli delete admin" ON public.vendor_line_items FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER vli_touch_updated BEFORE UPDATE ON public.vendor_line_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Pricing-approval guard: only admins may set pricing approval columns
CREATE OR REPLACE FUNCTION public.guard_vli_pricing_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.pricing_status = 'approved' OR NEW.approved_retail_price IS NOT NULL
        OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL)
       AND NOT has_role(auth.uid(),'admin') THEN
      RAISE EXCEPTION 'Only admins can approve vendor line item pricing';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (NEW.pricing_status IS DISTINCT FROM OLD.pricing_status
        OR NEW.approved_retail_price IS DISTINCT FROM OLD.approved_retail_price
        OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
        OR NEW.approved_at IS DISTINCT FROM OLD.approved_at)
       AND NOT has_role(auth.uid(),'admin') THEN
      RAISE EXCEPTION 'Only admins can change vendor line item pricing approval';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER vli_guard_pricing BEFORE INSERT OR UPDATE ON public.vendor_line_items
FOR EACH ROW EXECUTE FUNCTION public.guard_vli_pricing_approval();

-- ============================================================
-- inventory_items
-- ============================================================
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_vendor_line_item_id UUID UNIQUE REFERENCES public.vendor_line_items(id) ON DELETE SET NULL,
  source_vendor_batch_id UUID REFERENCES public.vendor_batches(id) ON DELETE SET NULL,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  scientific_name TEXT,
  category TEXT,
  subcategory TEXT,
  origin_region TEXT,
  size TEXT,
  quantity_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_available NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_on_hold NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_sold NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_lost NUMERIC(12,2) NOT NULL DEFAULT 0,
  wholesale_cost NUMERIC(12,2),
  retail_price NUMERIC(12,2),
  pricing_status public.inventory_pricing_status NOT NULL DEFAULT 'not_priced',
  location_id UUID REFERENCES public.store_locations(id) ON DELETE SET NULL,
  availability_status public.inventory_availability_status NOT NULL DEFAULT 'incoming',
  live_sale_status public.inventory_live_sale_status NOT NULL DEFAULT 'not_eligible',
  needs_photo BOOLEAN NOT NULL DEFAULT true,
  website_ready_later BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_qty_balance CHECK (
    quantity_received >= quantity_available + quantity_on_hold + quantity_sold + quantity_lost
  )
);
CREATE INDEX idx_inv_batch ON public.inventory_items(source_vendor_batch_id);
CREATE INDEX idx_inv_vendor ON public.inventory_items(vendor_id);
CREATE INDEX idx_inv_location ON public.inventory_items(location_id);
CREATE INDEX idx_inv_avail ON public.inventory_items(availability_status);
CREATE INDEX idx_inv_pricing ON public.inventory_items(pricing_status);
CREATE INDEX idx_inv_live ON public.inventory_items(live_sale_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv select active" ON public.inventory_items FOR SELECT TO authenticated USING (is_active_user(auth.uid()));
CREATE POLICY "inv insert editor" ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (can_edit_content(auth.uid()));
CREATE POLICY "inv update editor" ON public.inventory_items FOR UPDATE TO authenticated USING (can_edit_content(auth.uid()));
CREATE POLICY "inv delete admin" ON public.inventory_items FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER inv_touch_updated BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Now add the back-ref FK on vendor_line_items (deferred to avoid circular ref at create time)
ALTER TABLE public.vendor_line_items
  ADD CONSTRAINT vli_converted_fk FOREIGN KEY (converted_inventory_item_id)
  REFERENCES public.inventory_items(id) ON DELETE SET NULL;

-- Inventory gates: availability + live-sale rules
CREATE OR REPLACE FUNCTION public.guard_inventory_gates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE loc_is_live BOOLEAN;
BEGIN
  IF NEW.availability_status = 'available' THEN
    IF NEW.pricing_status <> 'approved' OR NEW.retail_price IS NULL
       OR NEW.location_id IS NULL OR NEW.quantity_available <= 0 THEN
      RAISE EXCEPTION 'Inventory cannot be available without approved pricing, retail price, location, and quantity_available > 0';
    END IF;
  END IF;
  IF NEW.live_sale_status IN ('staged','live') THEN
    IF NEW.location_id IS NULL THEN
      RAISE EXCEPTION 'Live-sale status requires a location';
    END IF;
    SELECT is_live_sale INTO loc_is_live FROM public.store_locations WHERE id = NEW.location_id;
    IF COALESCE(loc_is_live,false) = false THEN
      RAISE EXCEPTION 'Live-sale staged/live requires assignment to a live-sale location';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inv_guard_gates BEFORE INSERT OR UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_gates();

-- ============================================================
-- inventory_media
-- ============================================================
CREATE TABLE public.inventory_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  tag public.inventory_media_tag NOT NULL DEFAULT 'internal',
  alt_text TEXT,
  uploader_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invmedia_item ON public.inventory_media(inventory_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_media TO authenticated;
GRANT ALL ON public.inventory_media TO service_role;
ALTER TABLE public.inventory_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invmedia select active" ON public.inventory_media FOR SELECT TO authenticated USING (is_active_user(auth.uid()));
CREATE POLICY "invmedia insert editor" ON public.inventory_media FOR INSERT TO authenticated WITH CHECK (can_edit_content(auth.uid()));
CREATE POLICY "invmedia update editor" ON public.inventory_media FOR UPDATE TO authenticated USING (can_edit_content(auth.uid()));
CREATE POLICY "invmedia delete admin" ON public.inventory_media FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER invmedia_touch_updated BEFORE UPDATE ON public.inventory_media FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- inventory_activity_logs
-- ============================================================
CREATE TABLE public.inventory_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  vendor_batch_id UUID REFERENCES public.vendor_batches(id) ON DELETE SET NULL,
  vendor_line_item_id UUID REFERENCES public.vendor_line_items(id) ON DELETE SET NULL,
  actor_id UUID,
  action public.inventory_activity_action NOT NULL,
  summary TEXT,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_actlog_item ON public.inventory_activity_logs(inventory_item_id, created_at DESC);
GRANT SELECT, INSERT ON public.inventory_activity_logs TO authenticated;
GRANT ALL ON public.inventory_activity_logs TO service_role;
ALTER TABLE public.inventory_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "actlog select active" ON public.inventory_activity_logs FOR SELECT TO authenticated USING (is_active_user(auth.uid()));
CREATE POLICY "actlog insert active" ON public.inventory_activity_logs FOR INSERT TO authenticated WITH CHECK (is_active_user(auth.uid()));

-- Activity-log trigger on inventory changes
CREATE OR REPLACE FUNCTION public.log_inventory_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.inventory_activity_logs(inventory_item_id, vendor_batch_id, vendor_line_item_id, actor_id, action, summary, detail)
    VALUES (NEW.id, NEW.source_vendor_batch_id, NEW.source_vendor_line_item_id, v_actor, 'created',
      'Inventory item created: '||NEW.item_name, to_jsonb(NEW));
    RETURN NEW;
  END IF;
  IF NEW.availability_status IS DISTINCT FROM OLD.availability_status THEN
    INSERT INTO public.inventory_activity_logs(inventory_item_id, actor_id, action, summary, detail)
    VALUES (NEW.id, v_actor, 'status_change',
      'Availability '||OLD.availability_status||' → '||NEW.availability_status,
      jsonb_build_object('from',OLD.availability_status,'to',NEW.availability_status));
  END IF;
  IF NEW.live_sale_status IS DISTINCT FROM OLD.live_sale_status THEN
    INSERT INTO public.inventory_activity_logs(inventory_item_id, actor_id, action, summary, detail)
    VALUES (NEW.id, v_actor, 'status_change',
      'Live-sale '||OLD.live_sale_status||' → '||NEW.live_sale_status,
      jsonb_build_object('from',OLD.live_sale_status,'to',NEW.live_sale_status));
  END IF;
  IF NEW.location_id IS DISTINCT FROM OLD.location_id THEN
    INSERT INTO public.inventory_activity_logs(inventory_item_id, actor_id, action, summary, detail)
    VALUES (NEW.id, v_actor, 'location_change', 'Location changed',
      jsonb_build_object('from',OLD.location_id,'to',NEW.location_id));
  END IF;
  IF NEW.quantity_available IS DISTINCT FROM OLD.quantity_available
     OR NEW.quantity_on_hold IS DISTINCT FROM OLD.quantity_on_hold
     OR NEW.quantity_sold IS DISTINCT FROM OLD.quantity_sold
     OR NEW.quantity_lost IS DISTINCT FROM OLD.quantity_lost
     OR NEW.quantity_received IS DISTINCT FROM OLD.quantity_received THEN
    INSERT INTO public.inventory_activity_logs(inventory_item_id, actor_id, action, summary, detail)
    VALUES (NEW.id, v_actor, 'quantity_change', 'Quantities updated',
      jsonb_build_object(
        'received',jsonb_build_object('from',OLD.quantity_received,'to',NEW.quantity_received),
        'available',jsonb_build_object('from',OLD.quantity_available,'to',NEW.quantity_available),
        'on_hold',jsonb_build_object('from',OLD.quantity_on_hold,'to',NEW.quantity_on_hold),
        'sold',jsonb_build_object('from',OLD.quantity_sold,'to',NEW.quantity_sold),
        'lost',jsonb_build_object('from',OLD.quantity_lost,'to',NEW.quantity_lost)
      ));
  END IF;
  IF NEW.pricing_status IS DISTINCT FROM OLD.pricing_status
     OR NEW.retail_price IS DISTINCT FROM OLD.retail_price THEN
    INSERT INTO public.inventory_activity_logs(inventory_item_id, actor_id, action, summary, detail)
    VALUES (NEW.id, v_actor, 'pricing_change', 'Pricing updated',
      jsonb_build_object(
        'pricing_status',jsonb_build_object('from',OLD.pricing_status,'to',NEW.pricing_status),
        'retail_price',jsonb_build_object('from',OLD.retail_price,'to',NEW.retail_price)
      ));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inv_activity_log AFTER INSERT OR UPDATE ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.log_inventory_activity();

-- ============================================================
-- Storage buckets + policies
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('vendor-invoices','vendor-invoices', false)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('inventory-media','inventory-media', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "vendor-invoices select editor" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vendor-invoices' AND can_edit_content(auth.uid()));
CREATE POLICY "vendor-invoices insert editor" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-invoices' AND can_edit_content(auth.uid()));
CREATE POLICY "vendor-invoices update editor" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'vendor-invoices' AND can_edit_content(auth.uid()));
CREATE POLICY "vendor-invoices delete admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vendor-invoices' AND has_role(auth.uid(),'admin'));

CREATE POLICY "inventory-media select editor" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inventory-media' AND can_edit_content(auth.uid()));
CREATE POLICY "inventory-media insert editor" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'inventory-media' AND can_edit_content(auth.uid()));
CREATE POLICY "inventory-media update editor" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'inventory-media' AND can_edit_content(auth.uid()));
CREATE POLICY "inventory-media delete admin" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'inventory-media' AND has_role(auth.uid(),'admin'));
