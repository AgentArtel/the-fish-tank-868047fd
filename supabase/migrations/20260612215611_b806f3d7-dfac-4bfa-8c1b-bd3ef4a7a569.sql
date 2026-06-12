
-- Ensure scheduling extensions are available (no job is scheduled in this migration)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- 1. Append-only snapshots table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vendor_scrape_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrape_item_id uuid NOT NULL REFERENCES public.vendor_scrape_items(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES public.vendor_scrape_sources(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL DEFAULT now(),
  wholesale_cost numeric(12,2),
  compare_at_price numeric(12,2),
  available boolean NOT NULL,
  vendor_currency text DEFAULT 'USD',
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vss_item_time
  ON public.vendor_scrape_snapshots(scrape_item_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_vss_source_time
  ON public.vendor_scrape_snapshots(source_id, observed_at DESC);

-- 2. GRANTs (no UPDATE / DELETE for authenticated — append-only)
GRANT SELECT, INSERT ON public.vendor_scrape_snapshots TO authenticated;
GRANT ALL ON public.vendor_scrape_snapshots TO service_role;

-- 3. RLS
ALTER TABLE public.vendor_scrape_snapshots ENABLE ROW LEVEL SECURITY;

-- 4. Policies (deliberately no update/delete policy — invariant: append-only)
DROP POLICY IF EXISTS "vss_snap select editor" ON public.vendor_scrape_snapshots;
CREATE POLICY "vss_snap select editor"
  ON public.vendor_scrape_snapshots
  FOR SELECT TO authenticated
  USING (public.can_edit_content(auth.uid()));

DROP POLICY IF EXISTS "vss_snap insert editor" ON public.vendor_scrape_snapshots;
CREATE POLICY "vss_snap insert editor"
  ON public.vendor_scrape_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_content(auth.uid()));

-- ============================================================
-- New columns on vendor_scrape_items
-- ============================================================
ALTER TABLE public.vendor_scrape_items
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS last_price_change_at timestamptz;

-- ============================================================
-- Scheduled-refresh scaffold — DEPLOYED BUT DISABLED
-- ============================================================
-- The cron job below is intentionally LEFT COMMENTED OUT. Do not enable
-- until the append-only refreshScrapeSource rewrite has been merged. Enabling
-- this against the current overwrite logic would automate the destruction
-- of price/availability history on a timer.
--
-- When ready, store SCRAPE_CRON_SECRET in Vault, then schedule:
--
-- SELECT cron.schedule(
--   'vendor-watch-refresh',
--   '0 * * * *', -- hourly; the app route decides which sources are due
--   $$
--   SELECT net.http_post(
--     url     := 'https://the-fish-tank.lovable.app/api/public/hooks/refresh-scrape-sources',
--     headers := jsonb_build_object(
--                  'Content-Type', 'application/json',
--                  'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SCRAPE_CRON_SECRET')
--                ),
--     body    := '{}'::jsonb
--   );
--   $$
-- );
--
-- To disable later: SELECT cron.unschedule('vendor-watch-refresh');
