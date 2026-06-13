import { createFileRoute } from "@tanstack/react-router";
import { runScrapeForSource } from "@/lib/scrape.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ============================================================================
// Scheduled-refresh hook — the service-role entry path for the cron.
//
// pg_cron (in supabase/migrations/...) POSTs here hourly with
// `Authorization: Bearer <SCRAPE_CRON_SECRET>`. We authenticate the machine
// caller against SCRAPE_CRON_SECRET (so it doesn't need a user / requireAdmin),
// then run the SAME append-only `runScrapeForSource` the admin "Refresh now"
// button uses — there is exactly one scrape implementation.
//
// The cron is shipped DISABLED; nothing calls this until the append-only
// rewrite is live and the schedule is deliberately enabled.
// ============================================================================

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ET (America/New_York) wall-clock weekday + hour, for friday_night cadence.
function etWeekdayHour(at: number): { weekday: number; hour: number } {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = f.formatToParts(new Date(at));
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let weekday = 0;
  let hour = 0;
  for (const p of parts) {
    if (p.type === "weekday") weekday = wd[p.value] ?? 0;
    if (p.type === "hour") hour = p.value === "24" ? 0 : Number(p.value);
  }
  return { weekday, hour };
}

// Cadence throttle lives here (the app owns due-ness; the cron is a dumb timer).
function isDue(source: any, nowMs: number): boolean {
  if (!source.is_active) return false;
  const last = source.last_scraped_at ? new Date(source.last_scraped_at).getTime() : 0;
  const hours = (nowMs - last) / 3_600_000;
  switch (source.cadence) {
    case "daily":
      return hours >= 20;
    case "weekly":
      return hours >= 24 * 6.5;
    case "friday_night": {
      // Furnace drops Friday night ET. Fire on the first hourly tick at/after
      // 22:00 ET on Friday; the 12h guard stops it re-firing the same night.
      const { weekday, hour } = etWeekdayHour(nowMs);
      return weekday === 5 && hour >= 22 && hours >= 12;
    }
    case "manual":
    default:
      return false;
  }
}

export const Route = createFileRoute("/api/public/hooks/refresh-scrape-sources")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SCRAPE_CRON_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        if (!secret || auth !== `Bearer ${secret}`) {
          return json({ error: "unauthorized" }, 401);
        }

        // Optional body: { sourceId? } refresh one (ignores cadence);
        // { force?: true } refresh all active now; empty → all active + due.
        let body: { sourceId?: string; force?: boolean } = {};
        try {
          const text = await request.text();
          if (text) body = JSON.parse(text);
        } catch {
          return json({ error: "bad json body" }, 400);
        }

        const { data: sources, error } = await supabaseAdmin
          .from("vendor_scrape_sources")
          .select("id, kind, source_url, cadence, is_active, last_scraped_at, prefer_firecrawl, vendors:vendor_id(slug)")
          .eq("is_active", true);
        if (error) return json({ error: error.message }, 500);

        const nowMs = Date.now();
        const targets = (sources ?? []).filter((s: any) => {
          if (body.sourceId) return s.id === body.sourceId;
          if (body.force) return true;
          return isDue(s, nowMs);
        });

        const ran: any[] = [];
        const errors: any[] = [];
        for (const s of targets) {
          try {
            const summary = await runScrapeForSource(supabaseAdmin, s as any);
            ran.push({ sourceId: s.id, ...summary });
          } catch (e: any) {
            errors.push({ sourceId: s.id, error: e?.message ?? String(e) });
          }
        }

        return json({
          checked: sources?.length ?? 0,
          ran: ran.length,
          skipped: (sources?.length ?? 0) - targets.length,
          errors: errors.length,
          results: ran,
          failures: errors,
        });
      },
    },
  },
});
