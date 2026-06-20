
-- Add species_key to media_assets for upload-once, reuse-across-posts species images.
ALTER TABLE public.media_assets ADD COLUMN IF NOT EXISTS species_key TEXT;
CREATE INDEX IF NOT EXISTS idx_media_assets_species_key ON public.media_assets (species_key) WHERE species_key IS NOT NULL;

-- Drop the scraper table (cascades policies). No data is preserved.
DROP TABLE IF EXISTS public.species_image_candidates CASCADE;
