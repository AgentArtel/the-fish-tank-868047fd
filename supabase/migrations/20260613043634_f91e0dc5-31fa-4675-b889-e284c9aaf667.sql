INSERT INTO public.vendors (slug, name, website, notes) VALUES
  ('world-wide-corals', 'World Wide Corals', 'https://worldwidecorals.com',
   'Shopify retailer (Orlando). WYSIWYG collection. Datacenter-blocked → Firecrawl.'),
  ('soflo-rubios-corals', 'SoFlo Rubio''s Corals', 'https://soflowrubioscorals.us',
   'Wholesale Shopify distributor (Miami). Weekly "album" drops. May be password-walled.'),
  ('top-shelf-aquatics', 'Top Shelf Aquatics', 'https://topshelfaquatics.com',
   'Coral retailer (Central FL). Platform unconfirmed (Shopify vs WooCommerce) — verify.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.vendor_scrape_sources
  (vendor_id, name, kind, source_url, cadence, prefer_firecrawl, auth_method, notes)
SELECT v.id, s.name, 'shopify_public', s.source_url, s.cadence, true, 'none', s.notes
FROM (VALUES
  ('world-wide-corals', 'WYSIWYG',
   'https://worldwidecorals.com/collections/wysiwyg/products.json', 'daily',
   'WYSIWYG drops; Firecrawl (datacenter-blocked).'),
  ('soflo-rubios-corals', 'Weekly album',
   'https://soflowrubioscorals.us/products.json', 'weekly',
   'Wholesale; weekly album. If products.json returns the password page, switch this source to authenticated.'),
  ('top-shelf-aquatics', 'Live corals',
   'https://topshelfaquatics.com/collections/live-corals-for-sale/products.json', 'daily',
   'Verify Shopify vs WooCommerce on first refresh.')
) AS s(vendor_slug, name, source_url, cadence, notes)
JOIN public.vendors v ON v.slug = s.vendor_slug
ON CONFLICT (vendor_id, source_url) DO NOTHING;