ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS attrs jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.vendor_line_items
  ADD COLUMN IF NOT EXISTS attrs jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_inv_attrs_gin ON public.inventory_items USING gin (attrs);
CREATE INDEX IF NOT EXISTS idx_vli_attrs_gin ON public.vendor_line_items USING gin (attrs);