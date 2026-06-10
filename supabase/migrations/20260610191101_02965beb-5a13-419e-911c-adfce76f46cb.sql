-- Phase 1: vendor scrape sources + scraped items + Sea Dwelling seed

-- Allow vendor batches to be sourced from a scrape
ALTER TYPE public.vendor_batch_source_document_type ADD VALUE IF NOT EXISTS 'scrape';

-- ============================================================
-- vendor_scrape_sources: one row per scrapable URL per vendor
-- ============================================================
CREATE TABLE public.vendor_scrape_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- 'shopify_public' = anonymous Shopify /products.json
  -- future: 'shopify_auth', 'firecrawl', 'rss', 'html'
  kind text NOT NULL DEFAULT 'shopify_public'
    CHECK (kind IN ('shopify_public','shopify_auth','firecrawl','rss','html')),
  source_url text NOT NULL,
  cadence text NOT NULL DEFAULT 'manual'
    CHECK (cadence IN ('manual','daily','weekly','friday_night')),
  auth_method text NOT NULL DEFAULT 'none'
    CHECK (auth_method IN ('none','cookie','basic','bearer')),
  is_active boolean NOT NULL DEFAULT true,
  last_scraped_at timestamptz,
  last_scrape_status text,
  last_scrape_error text,
  last_item_count integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, source_url)
);
CREATE INDEX idx_vss_vendor ON public.vendor_scrape_sources(vendor_id);
CREATE INDEX idx_vss_active ON public.vendor_scrape_sources(is_active) WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_scrape_sources TO authenticated;
GRANT ALL ON public.vendor_scrape_sources TO service_role;

ALTER TABLE public.vendor_scrape_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vss select editor" ON public.vendor_scrape_sources FOR SELECT TO authenticated USING (can_edit_content(auth.uid()));
CREATE POLICY "vss insert admin" ON public.vendor_scrape_sources FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "vss update admin" ON public.vendor_scrape_sources FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "vss delete admin" ON public.vendor_scrape_sources FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER vss_touch_updated BEFORE UPDATE ON public.vendor_scrape_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- vendor_scrape_items: one row per distinct product seen at a source
-- ============================================================
CREATE TABLE public.vendor_scrape_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.vendor_scrape_sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,      -- vendor SKU or handle, stable key
  external_handle text,            -- url path component
  title text NOT NULL,
  product_url text,
  wholesale_cost numeric(12,2),
  vendor_currency text DEFAULT 'USD',
  photo_source_url text,           -- original cdn url
  photo_path text,                 -- inventory-media storage path once downloaded
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  available_at_source boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','imported','ignored','unavailable')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_available_at timestamptz,
  imported_at timestamptz,
  imported_by uuid,
  imported_vendor_line_item_id uuid REFERENCES public.vendor_line_items(id) ON DELETE SET NULL,
  imported_vendor_batch_id uuid REFERENCES public.vendor_batches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);
CREATE INDEX idx_vsi_source_status ON public.vendor_scrape_items(source_id, status);
CREATE INDEX idx_vsi_last_seen ON public.vendor_scrape_items(last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_scrape_items TO authenticated;
GRANT ALL ON public.vendor_scrape_items TO service_role;

ALTER TABLE public.vendor_scrape_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vsi select editor" ON public.vendor_scrape_items FOR SELECT TO authenticated USING (can_edit_content(auth.uid()));
CREATE POLICY "vsi insert editor" ON public.vendor_scrape_items FOR INSERT TO authenticated WITH CHECK (can_edit_content(auth.uid()));
CREATE POLICY "vsi update editor" ON public.vendor_scrape_items FOR UPDATE TO authenticated USING (can_edit_content(auth.uid()));
CREATE POLICY "vsi delete admin" ON public.vendor_scrape_items FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER vsi_touch_updated BEFORE UPDATE ON public.vendor_scrape_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- Seed: Sea Dwelling Creatures vendor + Furnace scrape source
-- ============================================================
INSERT INTO public.vendors (slug, name, website, notes)
VALUES (
  'sea-dwelling',
  'Sea Dwelling Creatures',
  'https://www.seadwelling.com',
  'Wholesale livestock; The Furnace is a weekly limited-drop WYSIWYG collection (updates Friday night).'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.vendor_scrape_sources (vendor_id, name, kind, source_url, cadence, notes)
SELECT id, 'The Furnace (WYSIWYG)', 'shopify_public',
       'https://shop.seadwelling.com/collections/the-furnace/products.json',
       'friday_night',
       'Limited WYSIWYG drops. Cadence is informational in Phase 1 (manual refresh only).'
FROM public.vendors WHERE slug = 'sea-dwelling'
ON CONFLICT (vendor_id, source_url) DO NOTHING;
