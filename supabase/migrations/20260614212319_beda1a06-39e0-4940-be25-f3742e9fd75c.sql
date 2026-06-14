CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clover_customer_id text UNIQUE,
  first_name text,
  last_name text,
  email text,
  phone text,
  marketing_consent boolean NOT NULL DEFAULT false,
  notes text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors can view customers"   ON public.customers FOR SELECT
  TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors can insert customers" ON public.customers FOR INSERT
  TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors can update customers" ON public.customers FOR UPDATE
  TO authenticated USING (public.can_edit_content(auth.uid()))
  WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Admins can delete customers"  ON public.customers FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.inventory_sale_events
  ADD COLUMN IF NOT EXISTS customer_id uuid
    REFERENCES public.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inventory_sale_events_customer_idx
  ON public.inventory_sale_events (customer_id, sold_at DESC);