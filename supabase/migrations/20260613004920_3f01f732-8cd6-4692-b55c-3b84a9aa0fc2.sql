ALTER TABLE public.vendor_scrape_sources
  ADD COLUMN IF NOT EXISTS prefer_firecrawl boolean NOT NULL DEFAULT false;

UPDATE public.vendor_scrape_sources
  SET prefer_firecrawl = true
  WHERE name = 'The Furnace (WYSIWYG)';