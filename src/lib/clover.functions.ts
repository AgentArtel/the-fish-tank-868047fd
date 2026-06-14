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
export const syncCloverSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { ingestCloverSales } = await import("@/lib/clover.ingest.server");
    return await ingestCloverSales(context.supabase as any, { userId: context.userId });
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

// ---------- import Clover catalog → inventory_items + clover_item_links (admin) ----------
// Creates a workspace inventory item for every Clover item and links them, so the
// whole catalog lands in the workspace ready to track. Created items are DRAFTS:
// quantity 0 (the admin sets real stock during manual inventory), retail price =
// the live Clover/POS price, and availability `not_for_sale` so nothing goes live
// without the photo-on-file review (the DB trigger also enforces that).
//
// Fully bulk (no per-row round-trips — that timed out at ~1258 items) and
// idempotent/orphan-safe: items are matched back to Clover by attrs.clover_item_id,
// so a re-run (or a partial run that created items but didn't finish linking)
// re-links the existing rows instead of creating duplicates. Re-running never
// overwrites workspace retail — the workspace is the source of truth.
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

    // Existing workspace items, indexed by Clover id (provenance, for orphan-safe
    // re-link) and by name (so a hand-catalogued item links instead of duplicating).
    const { data: inv } = await db.from("inventory_items").select("id, item_name, attrs");
    const invByName = new Map<string, string>();
    const invByCloverId = new Map<string, string>();
    for (const it of inv ?? []) {
      const nm = (it.item_name ?? "").trim().toLowerCase();
      if (nm && !invByName.has(nm)) invByName.set(nm, it.id);
      const cid = (it.attrs as any)?.clover_item_id;
      if (cid && !invByCloverId.has(cid)) invByCloverId.set(cid, it.id);
    }

    // Build the full set of link rows to upsert (insert-or-update on clover_item_id),
    // creating workspace items only for Clover items that don't have one yet.
    const linkRows: any[] = [];
    const toCreate: (typeof items) = [];
    let updated = 0; // already linked → refresh name/price
    let autoLinked = 0; // linked to a pre-existing workspace item by name
    let relinked = 0; // re-linked to an item created by an earlier (partial) run

    const pushLink = (cloverId: string, invId: string | null, ci: any) =>
      linkRows.push({
        clover_item_id: cloverId,
        inventory_item_id: invId,
        clover_name: ci.name,
        clover_price_cents: ci.priceCents,
        link_status: invId ? "linked" : "unlinked",
        last_synced_at: nowIso,
      });

    for (const ci of items) {
      const existingInvId = linkByClover.get(ci.id)?.inventory_item_id ?? null;
      if (existingInvId) {
        pushLink(ci.id, existingInvId, ci);
        updated++;
        continue;
      }
      const byClover = invByCloverId.get(ci.id);
      if (byClover) {
        pushLink(ci.id, byClover, ci);
        relinked++;
        continue;
      }
      const byName = invByName.get(ci.name.trim().toLowerCase());
      if (byName) {
        pushLink(ci.id, byName, ci);
        autoLinked++;
        continue;
      }
      toCreate.push(ci);
    }

    // Bulk-create draft workspace items, then push their links. Link rows for each
    // created batch are upserted immediately after creation so a later failure can't
    // orphan an already-created batch (the next run re-links it via attrs).
    let created = 0;
    for (let i = 0; i < toCreate.length; i += 500) {
      const chunk = toCreate.slice(i, i + 500);
      const rows = chunk.map((ci) => {
        const hasPrice = typeof ci.priceCents === "number";
        return {
          item_name: ci.name,
          // Only tag corals we're confident about; everything else stays null for
          // the admin to set during manual inventory (the classifier is conservative).
          item_type: classifyCoralType(ci.name) ? "coral" : null,
          quantity_received: 0,
          quantity_available: 0,
          wholesale_cost: null,
          retail_price: hasPrice ? (ci.priceCents as number) / 100 : null,
          // The Clover price is the real, live POS retail price (admin-run import).
          pricing_status: hasPrice ? "approved" : "not_priced",
          availability_status: "not_for_sale", // never auto-live; no photo yet
          live_sale_status: "not_eligible",
          needs_photo: true,
          notes: "Imported from Clover POS",
          attrs: { source: "clover", clover_item_id: ci.id },
          created_by: context.userId,
        };
      });
      const { data: createdRows, error } = await db
        .from("inventory_items")
        .insert(rows)
        .select("id, attrs");
      if (error) throw new Error(error.message);
      const idByClover = new Map<string, string>();
      for (const r of createdRows ?? []) {
        const cid = (r.attrs as any)?.clover_item_id;
        if (cid) idByClover.set(cid, r.id);
      }
      const batchLinks: any[] = [];
      for (const ci of chunk) {
        const invId = idByClover.get(ci.id) ?? null;
        batchLinks.push({
          clover_item_id: ci.id,
          inventory_item_id: invId,
          clover_name: ci.name,
          clover_price_cents: ci.priceCents,
          link_status: invId ? "linked" : "unlinked",
          last_synced_at: nowIso,
        });
        if (invId) created++;
      }
      const { error: le } = await db
        .from("clover_item_links")
        .upsert(batchLinks, { onConflict: "clover_item_id" });
      if (le) throw new Error(le.message);
    }

    // Upsert the rest (already-linked refresh + name/provenance matches) in bulk.
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

    const linkedNow = created + relinked + autoLinked;
    return {
      fetched: items.length,
      created, // brand-new workspace items created this run
      relinked, // re-linked to items from an earlier (partial) run
      autoLinked, // linked to a pre-existing workspace item by name
      updated, // already-linked items refreshed
      linkedNow,
      stillUnlinked: toCreate.length - created,
    };
  });
