
CREATE TABLE public.workspace_ai_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'lovable' CHECK (provider IN ('lovable','openai','gemini')),
  openai_api_key text,
  openai_model_pro text DEFAULT 'gpt-5',
  openai_model_flash text DEFAULT 'gpt-5-mini',
  gemini_api_key text,
  gemini_model_pro text DEFAULT 'gemini-2.5-pro',
  gemini_model_flash text DEFAULT 'gemini-2.5-flash',
  fallback_to_lovable boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  last_used_provider text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_ai_settings TO authenticated;
GRANT ALL ON public.workspace_ai_settings TO service_role;

ALTER TABLE public.workspace_ai_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only direct access; non-admins get masked view via server fn.
CREATE POLICY "was admin all" ON public.workspace_ai_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_was BEFORE UPDATE ON public.workspace_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed singleton row so the app always has settings to read/update.
INSERT INTO public.workspace_ai_settings (provider) VALUES ('lovable');
