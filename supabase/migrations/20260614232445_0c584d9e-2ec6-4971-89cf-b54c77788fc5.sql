CREATE TABLE public.loyalty_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  earn_percent numeric NOT NULL DEFAULT 5,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('earn','redeem','doa','bonus','adjust','expire')),
  amount_cents integer NOT NULL,
  channel text,
  reason text,
  sale_event_id uuid REFERENCES public.inventory_sale_events(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_event_id, kind)
);

CREATE INDEX loyalty_ledger_customer_idx ON public.loyalty_ledger (customer_id, created_at DESC);

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reef_club_enrolled_at timestamptz;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_ledger TO authenticated;
GRANT ALL ON public.loyalty_ledger TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.loyalty_config TO authenticated;
GRANT ALL ON public.loyalty_config TO service_role;

ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors view loyalty_ledger"   ON public.loyalty_ledger FOR SELECT TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors insert loyalty_ledger" ON public.loyalty_ledger FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Admins update loyalty_ledger"  ON public.loyalty_ledger FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete loyalty_ledger"  ON public.loyalty_ledger FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Editors view loyalty_config"   ON public.loyalty_config FOR SELECT TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "Admins insert loyalty_config"  ON public.loyalty_config FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update loyalty_config"  ON public.loyalty_config FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.loyalty_config (id, enabled) VALUES (true, false) ON CONFLICT DO NOTHING;