# Hand-off — Vendor Watch: ENABLE the scheduled refresh (for Lovable / DB owner)

Date: 2026-06-12 · Author: Claude Code. This is the final step that turns the
linchpin on. **Do the steps below only after the smoke-test in §0 passes.**

## Where we are

Both halves of the linchpin are live on `main` and deployed:
- **Append-only refresh** — `runScrapeForSource` in `src/lib/scrape.functions.ts`
  appends to `vendor_scrape_snapshots` and never overwrites history. Verified in
  preview (384 Furnace items baselined).
- **Service-role cron hook** — `POST /api/public/hooks/refresh-scrape-sources`
  (`src/routes/api/public/hooks/refresh-scrape-sources.ts`). It validates
  `Authorization: Bearer <SCRAPE_CRON_SECRET>`, selects active + **due** sources
  (cadence throttle, incl. `friday_night` in ET), and runs the same append-only
  scrape as `service_role`.

> ⚠️ The endpoint URL is **`/api/public/hooks/refresh-scrape-sources`** — exactly
> what the commented cron in migration `20260612215611_...sql` already targets.
> Do **not** create a second route at `/api/hooks/...`; that path does not exist.

## 0. Precondition — smoke-test the deployed endpoint first

The boss (or you) runs this once against prod and confirms a 200 + JSON summary:

```bash
curl -X POST https://the-fish-tank.lovable.app/api/public/hooks/refresh-scrape-sources \
  -H "Authorization: Bearer <SCRAPE_CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"force":true}'
```

- Expect `{ checked, ran, results: [{ snapshots, added, updated, gone, ... }] }`.
- `401` → the app-runtime `SCRAPE_CRON_SECRET` isn't wired; fix that before going on.
- Because the data was just refreshed, `snapshots` should be ~0 (change-log
  working — proof we're not re-writing unchanged rows).

Only proceed once this returns 200.

## 1. Put the secret in Vault

The cron reads the bearer from Vault via `vault.decrypted_secrets`. Create a Vault
secret named **exactly** `SCRAPE_CRON_SECRET`, with the **same value already set in
the app runtime env** (do not invent a new one — they must match, or the hook
returns 401). Don't paste the literal value into a committed migration; set it via
the Vault UI or a one-off statement you don't commit, e.g.:

```sql
-- run once, not committed; value must equal the app-env SCRAPE_CRON_SECRET
select vault.create_secret('<same value as app env>', 'SCRAPE_CRON_SECRET');
```

## 2. Schedule the job (this is the "flip on")

The statement is already sitting commented in `20260612215611_...sql`. Ship it as a
**new migration** (don't edit the old one). Exact statement:

```sql
SELECT cron.schedule(
  'vendor-watch-refresh',
  '0 * * * *', -- hourly; the app route decides which sources are due
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
```

Note: body is `{}` (not `force`), so the **app route's cadence throttle** decides
what actually runs. Most hourly ticks will be cheap no-ops (`ran: 0`); the Furnace
`friday_night` source fires on the first tick at/after 22:00 ET Friday.

## 3. Verify + kill-switch

- Confirm the job exists: `SELECT jobid, schedule, jobname FROM cron.job WHERE jobname = 'vendor-watch-refresh';`
- After the next top-of-hour, check `cron.job_run_details` for a 200 from `net.http_post`,
  and confirm new `vendor_scrape_snapshots` rows appear **only** when something
  changed at the vendor.
- Disable anytime: `SELECT cron.unschedule('vendor-watch-refresh');`

## Confirm back to Claude

Once scheduled, tell me and I'll watch the first few runs' snapshot deltas to make
sure the change-log behaves (no row-floods on no-change ticks). After that the
linchpin is fully done and we move to the in-app feed.

## Not in scope

No retail/×3 logic; no batch/inventory creation; no Firecrawl (Shopify
`products.json` direct fetch only). The hook is read-and-record only.
