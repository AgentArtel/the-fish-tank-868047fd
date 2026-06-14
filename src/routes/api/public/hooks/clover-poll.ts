import { createFileRoute } from "@tanstack/react-router";
import { ingestCloverSales } from "@/lib/clover.ingest.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ============================================================================
// Clover sale-ingest hook — the service-role entry path for the cron.
//
// pg_cron POSTs here on a cadence with `Authorization: Bearer <SCRAPE_CRON_SECRET>`
// (the same machine-cron secret the scrape refresh uses — one shared cron token).
// We authenticate the caller, then run the SAME idempotent `ingestCloverSales`
// the admin "Sync sales now" button uses. Read-only against Clover; the only
// writes are inventory_sale_events + stock decrements in the workspace.
//
// Optional body: { sinceMs? } to override the polling window (epoch ms). Empty
// body → resume from clover_connection.last_sale_synced_at (with a 1h overlap).
// ============================================================================

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/clover-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SCRAPE_CRON_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        if (!secret || auth !== `Bearer ${secret}`) {
          return json({ error: "unauthorized" }, 401);
        }

        let body: { sinceMs?: number } = {};
        try {
          const text = await request.text();
          if (text) body = JSON.parse(text);
        } catch {
          return json({ error: "bad json body" }, 400);
        }

        try {
          const result = await ingestCloverSales(supabaseAdmin, { sinceMs: body.sinceMs });
          return json({ ok: true, ...result });
        } catch (e: any) {
          return json({ ok: false, error: e?.message ?? String(e) }, 500);
        }
      },
    },
  },
});
