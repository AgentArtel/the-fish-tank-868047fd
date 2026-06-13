-- Enable the Vendor Watch scheduled refresh.
-- Pairs with the commented block in 20260612215611_*.sql (shipped disabled);
-- this is the deliberate "flip on" as a new migration.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotent: unschedule any prior copy before re-scheduling.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vendor-watch-refresh') THEN
    PERFORM cron.unschedule('vendor-watch-refresh');
  END IF;
END $$;

SELECT cron.schedule(
  'vendor-watch-refresh',
  '0 * * * *', -- hourly; the app route decides which sources are actually due
  $$
  SELECT net.http_post(
    url     := 'https://the-fish-tank.lovable.app/api/public/hooks/refresh-scrape-sources',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SCRAPE_CRON_SECRET')
               ),
    body    := '{}'::jsonb
  );
  $$
);