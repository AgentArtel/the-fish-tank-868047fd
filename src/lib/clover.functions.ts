import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyCoralType } from "@/lib/coral-type";

// ---------- guards (mirror ops.functions.ts) ----------
async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => r.role === "admin");
}
async function requireActive(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("is_active").eq("id", userId).maybeSingle();
  if (!data?.is_active) throw new Error("Forbidden: account pending approval");
}
async function requireAdmin(supabase: any, userId: string) {
  await requireActive(supabase, userId);
  if (!(await isAdmin(supabase, userId))) throw new Error("Forbidden: admin role required");
}
async function requireEditor(supabase: any, userId: string) {
  await requireActive(supabase, userId);
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some(
    (r: any) => r.role === "admin" || r.role === "creator" || r.role === "reviewer",
  );
  if (!ok) throw new Error("Forbidden: editor role required");
}

// Run a count-only (head) query and return the count.
async function countRows(q: any): Promise<number> {
  return (await q).count ?? 0;
}

// ---------- connection status + counts (editor) ----------
export const getCloverOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;

    // Load creds via admin client so editors can see "configured" state
    // without RLS-reading the token.
    const { loadCloverCreds } = await import("@/lib/clover.api");
    const creds = await loadCloverCreds();

    const { data: conn } = await db.from("clover_connection").select("*").maybeSingle();
    const count = async (q: any) => (await q).count ?? 0;
    const total = await count(db.from("clover_item_links").select("id", { count: "exact", head: true }));
    const linked = await count(
      db.from("clover_item_links").select("id", { count: "exact", head: true }).eq("link_status", "linked"),
    );
    const salesNeedingReview = await count(
      db
        .from("inventory_sale_events")
        .select("id", { count: "exact", head: true })
        .eq("source", "clover")
        .eq("status", "needs_review"),
    );
    return {
      configured: !!creds,
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
  .inputValidator((d: { merchantId: string; baseUrl: string; apiToken?: string }) => d)
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

// ---------- pull recent Clover sales → inventory_sale_events (admin) ----------
// The manual button re-scans a wide window (default 30d) so it both catches any
// missed sales and backfills customers onto already-ingested orders. Idempotent —
// re-scanning never double-counts. (The cron uses the tight overlap window instead.)
export const syncCloverSales = createServerFn({ method: "POST" })
  .inputValidator((d: { lookbackDays?: number }) => ({
    lookbackDays: Math.min(Math.max(Math.floor(d?.lookbackDays ?? 30), 1), 365),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { ingestCloverSales } = await import("@/lib/clover.ingest.server");
    const sinceMs = Date.now() - data.lookbackDays * 86_400_000;
    return await ingestCloverSales(context.supabase as any, {
      userId: context.userId,
      sinceMs,
    });
  });

// ---------- test the API token/merchant (admin) ----------
export const testCloverConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { cloverTestConnection, requireCloverCreds } = await import("@/lib/clover.api");
    const creds = await requireCloverCreds();
    const merchant = await cloverTestConnection(creds);
    await (context.supabase as any)
      .from("clover_connection")
      .update({ connected: true })
      .eq("id", true);
    return { merchant };
  });

// ---------- import Clover catalog → clover_item_links (admin) ----------
// STEP 1 of the import. Fetches every Clover item and upserts the link rows ONLY
// (no inventory item creation here). This is cheap — a few bulk upserts — so it
// stays well inside the Cloudflare Worker request budget. Item creation is done
// separately in small, browser-driven chunks (`createWorkspaceItemsFromClover`)
// because creating ~1258 items in one request blows the Worker time limit and the
// runtime kills it with no catchable error. Links carry the Clover name/price and
// auto-link to a pre-existing workspace item (by Clover-id provenance or by name).
export const importCloverCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const db = context.supabase as any;
    const { cloverListItems, requireCloverCreds } = await import("@/lib/clover.api");
    const creds = await requireCloverCreds();
    const items = await cloverListItems(creds);
    const nowIso = new Date().toISOString();

    const { data: existingLinks } = await db
      .from("clover_item_links")
      .select("clover_item_id, inventory_item_id");
    const linkByClover = new Map<string, any>(
      (existingLinks ?? []).map((r: any) => [r.clover_item_id, r]),
    );

    // Pre-existing workspace items, indexed by Clover-id provenance and by name, so
    // an item that already exists links instead of getting duplicated later.
    const { data: inv } = await db.from("inventory_items").select("id, item_name, attrs");
    const invByName = new Map<string, string>();
    const invByCloverId = new Map<string, string>();
    for (const it of inv ?? []) {
      const nm = (it.item_name ?? "").trim().toLowerCase();
      if (nm && !invByName.has(nm)) invByName.set(nm, it.id);
      const cid = (it.attrs as any)?.clover_item_id;
      if (cid && !invByCloverId.has(cid)) invByCloverId.set(cid, it.id);
    }

    const linkRows: any[] = [];
    let alreadyLinked = 0;
    for (const ci of items) {
      const invId =
        linkByClover.get(ci.id)?.inventory_item_id ??
        invByCloverId.get(ci.id) ??
        invByName.get(ci.name.trim().toLowerCase()) ??
        null;
      if (invId) alreadyLinked++;
      linkRows.push({
        clover_item_id: ci.id,
        inventory_item_id: invId,
        clover_name: ci.name,
        clover_price_cents: ci.priceCents,
        link_status: invId ? "linked" : "unlinked",
        last_synced_at: nowIso,
      });
    }

    for (let i = 0; i < linkRows.length; i += 500) {
      const { error } = await db
        .from("clover_item_links")
        .upsert(linkRows.slice(i, i + 500), { onConflict: "clover_item_id" });
      if (error) throw new Error(error.message);
    }

    await db
      .from("clover_connection")
      .update({ connected: true, last_import_at: nowIso })
      .eq("id", true);

    return {
      fetched: items.length,
      alreadyLinked,
      remainingToCreate: items.length - alreadyLinked,
    };
  });

// ---------- create workspace items for unlinked Clover items (admin, CHUNKED) ----------
// STEP 2 of the import, called repeatedly by the browser until `done`. Each call
// processes up to `limit` still-unlinked links — small enough to finish inside the
// Cloudflare Worker budget. Items are created as DRAFTS (qty 0, retail = Clover/POS
// price, `not_for_sale` so nothing goes live without a photo; the admin sets real
// stock during manual inventory). Idempotent + orphan-safe: a link whose item was
// already created by a prior (possibly half-finished) call is re-linked via
// attrs.clover_item_id rather than duplicated.
export const createWorkspaceItemsFromClover = createServerFn({ method: "POST" })
  .inputValidator((d: { limit?: number }) => ({
    limit: Math.min(Math.max(Math.floor(d?.limit ?? 200), 1), 500),
  }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const db = context.supabase as any;
    const nowIso = new Date().toISOString();

    // Next slice of links that still have no workspace item.
    const { data: pending } = await db
      .from("clover_item_links")
      .select("clover_item_id, clover_name, clover_price_cents")
      .is("inventory_item_id", null)
      .order("clover_item_id")
      .limit(data.limit);
    const batch = pending ?? [];

    if (batch.length === 0) {
      return { processed: 0, created: 0, relinked: 0, remaining: 0, done: true };
    }

    // Orphan-safety: some of these Clover items may already have an inventory item
    // from an earlier interrupted run — re-link those instead of duplicating.
    const cloverIds = batch.map((b: any) => b.clover_item_id);
    const { data: orphans } = await db
      .from("inventory_items")
      .select("id, attrs")
      .in("attrs->>clover_item_id", cloverIds);
    const itemByClover = new Map<string, string>();
    for (const it of orphans ?? []) {
      const cid = (it.attrs as any)?.clover_item_id;
      if (cid && !itemByClover.has(cid)) itemByClover.set(cid, it.id);
    }

    const toCreate = batch.filter((b: any) => !itemByClover.has(b.clover_item_id));
    let created = 0;
    if (toCreate.length) {
      const rows = toCreate.map((b: any) => {
        const hasPrice = typeof b.clover_price_cents === "number";
        return {
          item_name: b.clover_name ?? "(unnamed)",
          item_type: classifyCoralType(b.clover_name ?? "") ? "coral" : null,
          quantity_received: 0,
          quantity_available: 0,
          wholesale_cost: null,
          retail_price: hasPrice ? b.clover_price_cents / 100 : null,
          pricing_status: hasPrice ? "approved" : "not_priced",
          availability_status: "not_for_sale",
          live_sale_status: "not_eligible",
          needs_photo: true,
          notes: "Imported from Clover POS",
          attrs: { source: "clover", clover_item_id: b.clover_item_id },
          created_by: context.userId,
        };
      });
      const { data: createdRows, error } = await db
        .from("inventory_items")
        .insert(rows)
        .select("id, attrs");
      if (error) throw new Error(error.message);
      for (const r of createdRows ?? []) {
        const cid = (r.attrs as any)?.clover_item_id;
        if (cid) {
          itemByClover.set(cid, r.id);
          created++;
        }
      }
    }

    // Link every item in this batch (created + re-linked orphans).
    const linkUpserts = batch
      .map((b: any) => {
        const invId = itemByClover.get(b.clover_item_id) ?? null;
        if (!invId) return null;
        return {
          clover_item_id: b.clover_item_id,
          inventory_item_id: invId,
          clover_name: b.clover_name,
          clover_price_cents: b.clover_price_cents,
          link_status: "linked",
          last_synced_at: nowIso,
        };
      })
      .filter(Boolean);
    if (linkUpserts.length) {
      const { error } = await db
        .from("clover_item_links")
        .upsert(linkUpserts, { onConflict: "clover_item_id" });
      if (error) throw new Error(error.message);
    }

    // Checkpoint progress on every chunk so a stop mid-import is never silent.
    await db.from("clover_connection").update({ last_import_at: nowIso }).eq("id", true);

    const remaining = await countRows(
      db.from("clover_item_links").select("id", { count: "exact", head: true }).is("inventory_item_id", null),
    );

    return {
      processed: batch.length,
      created,
      relinked: linkUpserts.length - created,
      remaining,
      done: remaining === 0,
    };
  });
