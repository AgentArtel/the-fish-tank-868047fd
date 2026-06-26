# Handoff → Lovable: Fix + automate the inbound Clover sales sync

> **TL;DR:** Sales sync *is* already on a 10-min `pg_cron` job (`clover-poll`), but it POSTs to a
> **Lovable app route that doesn't exist** (`https://the-fish-tank.lovable.app/api/public/hooks/clover-poll`)
> — so it's been **silently 404-ing every 10 minutes**. The manual button works; the cron doesn't.
> Fix: **re-point the cron straight at the `clover-sync-sales` edge function** (it already accepts the
> service-role caller). Small, safe migration. No edge-fn code change.

## Confirm first
- Check `SELECT * FROM cron.job_run_details WHERE jobname='clover-poll' ORDER BY start_time DESC LIMIT 20;`
  — expect non-2xx (the target route 404s). That confirms the diagnosis.
- The broken job is in migration `20260615194426_4ad43f9d-…`. The target route only exists in abandoned
  worktrees, not in deployed `src/routes/api/public/hooks/`.

## Why direct-to-edge-function works
`_shared/clover.ts → requireAdminCaller` already bypasses the user check for a service-role bearer
(lines 42-45): `if (jwt === serviceKey) return { admin, userId: null }`. So `pg_cron` can POST straight
to the function with the service-role key as the bearer — no app route needed.

## The migration (Lovable)
Project ref `trdxopfgtxhjaqcfrylt` → function URL
`https://trdxopfgtxhjaqcfrylt.supabase.co/functions/v1/clover-sync-sales`.

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Service-role key in Vault (NOT a random secret — the edge fn checks jwt === SERVICE_ROLE_KEY).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='CLOVER_SYNC_SERVICE_KEY') THEN
    PERFORM vault.create_secret('<SERVICE_ROLE_KEY>', 'CLOVER_SYNC_SERVICE_KEY');
  END IF;
END $$;

-- Drop the broken job that targets the nonexistent app route.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='clover-poll') THEN
    PERFORM cron.unschedule('clover-poll');
  END IF;
END $$;

SELECT cron.schedule(
  'clover-sync-sales', '*/10 * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://trdxopfgtxhjaqcfrylt.supabase.co/functions/v1/clover-sync-sales',
    headers := jsonb_build_object(
                 'Content-Type','application/json',
                 'Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='CLOVER_SYNC_SERVICE_KEY')),
    body    := '{}'::jsonb
  );
  $cron$
);
```

## Why this is safe (already verified in the edge fn)
- **Empty `body '{}'`** makes the fn self-derive `sinceMs` from `clover_connection.last_sale_synced_at`
  minus a **1h overlap window** (so nothing is missed between runs).
- **Idempotent:** `inventory_sale_events` has `UNIQUE(clover_order_id, clover_line_item_id)` and
  `apply_inventory_sale` early-returns duplicates — re-scanning the overlap can't double-decrement.
- **Failure-safe:** on error the fn returns 500 and does **not** advance the watermark, so the next run
  re-scans the same window. No data loss.

## Frequency
- **Sales: every 10 min** (matches the fn's own design + the old cadence; 1h overlap absorbs it).
- **Catalog import: keep manual** (heavy full-catalog pass, low urgency). Optional later: nightly
  `0 7 * * *` pointed at `…/functions/v1/clover-import-catalog`, same Vault/key pattern.

## Lane split
- **Lovable:** the migration above (Vault secret w/ service-role key, unschedule `clover-poll`, schedule
  the new job), confirm `pg_net` egress to `*.supabase.co/functions/v1/`, confirm via `cron.job_run_details`.
- **Claude (app, optional polish):** Settings → Clover already shows "Last sale sync {rel}". I'll add a
  **stale badge** (amber if the watermark is >~30 min old) so a stalled sync is visible, and re-label the
  manual button as a "sync now" override. No DB work from me.

## Reply with
Confirmation the new job is scheduled + the old one removed (and what `cron.job_run_details` showed for
`clover-poll`), and whether you want the nightly catalog import too.
