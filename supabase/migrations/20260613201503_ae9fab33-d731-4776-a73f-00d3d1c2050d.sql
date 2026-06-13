-- Phase 1a: per-coral colony "gone" toggle
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS colony_gone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS colony_gone_at timestamptz,
  ADD COLUMN IF NOT EXISTS colony_gone_by uuid;

-- Generalized sale ledger (all item types)
CREATE TABLE public.inventory_sale_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  qty numeric(12,2) NOT NULL,
  unit_price_cents integer,
  total_cents integer,
  sold_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','clover')),
  kind text NOT NULL DEFAULT 'sale' CHECK (kind IN ('sale','refund','void')),
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','needs_review','reversed')),
  clover_order_id text,
  clover_line_item_id text,
  clover_payment_id text,
  clover_item_name text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clover_order_id, clover_line_item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_sale_events TO authenticated;
GRANT ALL ON public.inventory_sale_events TO service_role;

ALTER TABLE public.inventory_sale_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors can view sale events"
  ON public.inventory_sale_events FOR SELECT
  TO authenticated
  USING (public.can_edit_content(auth.uid()));

CREATE POLICY "Editors can insert sale events"
  ON public.inventory_sale_events FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_content(auth.uid()));

CREATE POLICY "Admins can update sale events"
  ON public.inventory_sale_events FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete sale events"
  ON public.inventory_sale_events FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX inventory_sale_events_item_sold_at_idx
  ON public.inventory_sale_events (inventory_item_id, sold_at DESC);

CREATE INDEX inventory_sale_events_status_idx
  ON public.inventory_sale_events (status);