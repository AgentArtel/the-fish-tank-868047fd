
CREATE TABLE public.clover_credentials (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  api_token text,
  merchant_id text,
  base_url text DEFAULT 'https://api.clover.com',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clover_credentials TO authenticated;
GRANT ALL ON public.clover_credentials TO service_role;

ALTER TABLE public.clover_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_select_clover_credentials ON public.clover_credentials
  FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY admins_insert_clover_credentials ON public.clover_credentials
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY admins_update_clover_credentials ON public.clover_credentials
  FOR UPDATE USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_clover_credentials_updated_at
  BEFORE UPDATE ON public.clover_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.clover_credentials (id) VALUES (true) ON CONFLICT DO NOTHING;
