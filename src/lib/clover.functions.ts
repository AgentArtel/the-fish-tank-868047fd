import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin, requireEditor } from "@/lib/auth-guards";

// Run a count-only (head) query and return the count.
async function countRows(q: any): Promise<number> {
  return (await q).count ?? 0;
}

// ---------- connection status + counts (editor) ----------
// DB-only read — stays app-side. The external work (test/import/sync) now lives in
// the clover-* Supabase Edge Functions; this just reports the table state they write.
export const getCloverOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;

    // "Configured" = a token + merchant id are on file. Read via the admin client so
    // editors see the configured state without RLS-reading the secret token itself.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: creds } = await supabaseAdmin
      .from("clover_credentials")
      .select("api_token, merchant_id")
      .maybeSingle();
    const configured = !!(creds as any)?.api_token?.trim() && !!(creds as any)?.merchant_id?.trim();

    const { data: conn } = await db
      .from("clover_connection")
      .select("connected, last_import_at, last_sale_synced_at")
      .maybeSingle();
    const total = await countRows(
      db.from("clover_item_links").select("id", { count: "exact", head: true }),
    );
    const linked = await countRows(
      db
        .from("clover_item_links")
        .select("id", { count: "exact", head: true })
        .eq("link_status", "linked"),
    );
    const salesNeedingReview = await countRows(
      db
        .from("inventory_sale_events")
        .select("id", { count: "exact", head: true })
        .eq("source", "clover")
        .eq("status", "needs_review"),
    );
    return {
      configured,
      connected: !!conn?.connected,
      lastImportAt: conn?.last_import_at ?? null,
      lastSaleSyncedAt: conn?.last_sale_synced_at ?? null,
      total,
      linked,
      unlinked: total - linked,
      salesNeedingReview,
    };
  });

// ---------- admin settings: read non-secret fields only ----------
// Returns merchant id + base URL + whether a token is on file (boolean only —
// never the token itself).
export const getCloverSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("clover_credentials")
      .select("merchant_id, base_url, api_token, updated_at")
      .maybeSingle();
    return {
      merchantId: (data as any)?.merchant_id ?? "",
      baseUrl: (data as any)?.base_url ?? "https://api.clover.com",
      hasToken: !!(data as any)?.api_token,
      updatedAt: (data as any)?.updated_at ?? null,
    };
  });

// ---------- admin settings: save creds (admin) ----------
// Empty/blank apiToken leaves the existing token in place — admins can update
// merchant id / base URL without re-typing the token.
export const saveCloverSettings = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        merchantId: z.string().trim().max(120),
        baseUrl: z.string().trim().url().max(300),
        apiToken: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, any> = {
      merchant_id: data.merchantId.trim() || null,
      base_url: (data.baseUrl.trim() || "https://api.clover.com").replace(/\/$/, ""),
      updated_by: context.userId,
    };
    if (data.apiToken && data.apiToken.trim().length > 0) {
      patch.api_token = data.apiToken.trim();
    }
    const { error } = await supabaseAdmin
      .from("clover_credentials")
      .update(patch as any)
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
