INSERT INTO public.vendors (slug, name, website, notes) VALUES
  ('reef-lounge-coral', 'Reef Lounge Coral', 'https://reefloungecoral.com',
   'Official image source — owner has written permission to reuse product images. Permissioned 2026-06-30.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.vendor_scrape_sources
  (vendor_id, name, kind, source_url, cadence, prefer_firecrawl, auth_method, notes)
SELECT v.id, 'Reef Lounge Coral — catalog', 'shopify_public',
       'https://reefloungecoral.com/products.json', 'weekly', true, 'none',
       'Official image source — owner has written permission to reuse product images. Permissioned 2026-06-30. Direct fetch 403s; Firecrawl required.'
FROM public.vendors v
WHERE v.slug = 'reef-lounge-coral'
ON CONFLICT (vendor_id, source_url) DO NOTHING;