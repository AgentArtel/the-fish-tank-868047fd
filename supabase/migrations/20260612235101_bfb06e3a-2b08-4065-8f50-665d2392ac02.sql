DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'SCRAPE_CRON_SECRET') THEN
    PERFORM vault.create_secret('Copperband24!', 'SCRAPE_CRON_SECRET');
  END IF;
END $$;