CREATE TABLE public.tracked_coral_types (
  coral_type text PRIMARY KEY,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.tracked_coral_types TO authenticated;
GRANT ALL ON public.tracked_coral_types TO service_role;

ALTER TABLE public.tracked_coral_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tct select editor" ON public.tracked_coral_types
  FOR SELECT TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "tct insert editor" ON public.tracked_coral_types
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "tct delete editor" ON public.tracked_coral_types
  FOR DELETE TO authenticated USING (public.can_edit_content(auth.uid()));