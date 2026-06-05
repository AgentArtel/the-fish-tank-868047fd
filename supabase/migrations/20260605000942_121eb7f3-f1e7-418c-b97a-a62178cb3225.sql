-- Sprint 1.6: PO-against-Quick-Add reconciliation

ALTER TABLE public.vendor_batches
  ADD COLUMN IF NOT EXISTS is_quick_add boolean NOT NULL DEFAULT false;

-- Mark existing quick-add batches retroactively
UPDATE public.vendor_batches vb
SET is_quick_add = true
FROM public.vendors v
WHERE vb.vendor_id = v.id AND v.slug = 'quick-add';

ALTER TABLE public.vendor_line_items
  ADD COLUMN IF NOT EXISTS reconciliation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reconciled_inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reconciliation_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_line_items_reconciliation_status_chk'
  ) THEN
    ALTER TABLE public.vendor_line_items
      ADD CONSTRAINT vendor_line_items_reconciliation_status_chk
      CHECK (reconciliation_status IN ('pending','matched','short','accepted','missing','extra','skipped'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS vendor_line_items_reconciled_inv_idx
  ON public.vendor_line_items(reconciled_inventory_item_id);

-- pg_trgm for fuzzy matching in reconciliation
CREATE EXTENSION IF NOT EXISTS pg_trgm;