ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS source_colony_id uuid
    REFERENCES public.inventory_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inv_source_colony
  ON public.inventory_items(source_colony_id) WHERE source_colony_id IS NOT NULL;