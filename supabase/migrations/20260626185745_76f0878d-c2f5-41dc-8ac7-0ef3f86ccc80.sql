
-- 1. clover_push_queue
CREATE TABLE public.clover_push_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  op text NOT NULL CHECK (op IN ('create_item','update_item')),
  payload jsonb NOT NULL,
  content_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  origin text NOT NULL DEFAULT 'app',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);

CREATE INDEX clover_push_queue_status_created_idx
  ON public.clover_push_queue (status, created_at);

-- Coalesce rapid edits: at most one in-flight row per (item, op).
CREATE UNIQUE INDEX clover_push_queue_active_uniq
  ON public.clover_push_queue (inventory_item_id, op)
  WHERE status IN ('pending','in_progress');

GRANT SELECT, INSERT ON public.clover_push_queue TO authenticated;
GRANT ALL ON public.clover_push_queue TO service_role;

ALTER TABLE public.clover_push_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors can view queue"
  ON public.clover_push_queue FOR SELECT
  TO authenticated
  USING (public.is_floor_staff_or_above(auth.uid()));

CREATE POLICY "Editors can enqueue"
  ON public.clover_push_queue FOR INSERT
  TO authenticated
  WITH CHECK (public.is_floor_staff_or_above(auth.uid()));

CREATE POLICY "Admins can update queue"
  ON public.clover_push_queue FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_dev(auth.uid()))
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

CREATE POLICY "Admins can delete queue"
  ON public.clover_push_queue FOR DELETE
  TO authenticated
  USING (public.is_admin_or_dev(auth.uid()));

CREATE TRIGGER clover_push_queue_touch
  BEFORE UPDATE ON public.clover_push_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. clover_item_links: track last successful push for skip-if-unchanged
ALTER TABLE public.clover_item_links
  ADD COLUMN IF NOT EXISTS last_pushed_hash text,
  ADD COLUMN IF NOT EXISTS last_pushed_at timestamptz;

-- 3. pg_cron: invoke clover-push every 3 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_jobid bigint;
  v_secret text;
BEGIN
  -- Remove any prior schedule
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'clover-push';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule('clover-push');
  END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'SCRAPE_CRON_SECRET'
    LIMIT 1;

  PERFORM cron.schedule(
    'clover-push',
    '*/3 * * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://trdxopfgtxhjaqcfrylt.supabase.co/functions/v1/clover-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer %s'
        ),
        body := '{}'::jsonb
      );
    $job$, v_secret)
  );
END $$;
