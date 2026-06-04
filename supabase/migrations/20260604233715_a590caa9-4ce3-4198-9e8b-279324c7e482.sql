ALTER TABLE public.inventory_media
  ADD COLUMN IF NOT EXISTS ocr_text text,
  ADD COLUMN IF NOT EXISTS ocr_extracted_at timestamptz;
