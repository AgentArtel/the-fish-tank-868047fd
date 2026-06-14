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
// without the photo-on-file review (the DB trigger also enforces that). Re-running
// only refreshes name/price on already-linked items — the workspace is the source
// of truth and we never overwrite workspace retail on re-sync.
export const importCloverCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const db = context.supabase as any;
    const { cloverListItems, requireCloverCreds } = await import("@/lib/clover.api");
    const creds = await requireCloverCreds();
    const items = await cloverListItems(creds);

    const { data: existingLinks } = await db
      .from("clover_item_links")
      .select("clover_item_id, inventory_item_id, link_status");
    const linkByClover = new Map<string, any>(
      (existingLinks ?? []).map((r: any) => [r.clover_item_id, r]),
    );

    // Pre-existing workspace items, for name auto-match (so we link instead of
    // creating a duplicate when the admin already catalogued an item by hand).
    const { data: inv } = await db.from("inventory_items").select("id, item_name");
    const invByName = new Map<string, string>();
    for (const it of inv ?? []) {
      const key = (it.item_name ?? "").trim().toLowerCase();
      if (key && !invByName.has(key)) invByName.set(key, it.id);
    }

    const linksToInsert: any[] = [];
    // Clover items needing a freshly-created workspace item. `existed` marks rows
    // whose clover_item_link already exists but is still unlinked (from an earlier
    // import) — we create the item and UPGRADE that link rather than insert a new one.
    const toCreate: { ci: (typeof items)[number]; existed: boolean }[] = [];
    let updated = 0;
    let autoLinked = 0; // linked to a pre-existing workspace item by name
    const nowIso = new Date().toISOString();

    for (const ci of items) {
      const existing = linkByClover.get(ci.id);
      if (existing) {
        if (existing.inventory_item_id) {
          // Already linked — just refresh the Clover-side name/price.
          await db
            .from("clover_item_links")
            .update({ clover_name: ci.name, clover_price_cents: ci.priceCents, last_synced_at: nowIso })
            .eq("clover_item_id", ci.id);
          updated++;
        } else {
          // Existing but unlinked (e.g. the first read-only import) — self-heal by
          // creating a workspace item and upgrading this link below.
          toCreate.push({ ci, existed: true });
        }
        continue;
      }
      const match = invByName.get(ci.name.trim().toLowerCase()) ?? null;
      if (match) {
        autoLinked++;
        linksToInsert.push({
          clover_item_id: ci.id,
          inventory_item_id: match,
          clover_name: ci.name,
          clover_price_cents: ci.priceCents,
          link_status: "linked",
          last_synced_at: nowIso,
        });
      } else {
        toCreate.push({ ci, existed: false });
      }
    }

    // Bulk-create draft workspace items for the unmatched Clover items, then link
    // each to the row we just made (mapped back via attrs.clover_item_id).
    let created = 0;
    for (let i = 0; i < toCreate.length; i += 500) {
      const chunk = toCreate.slice(i, i + 500);
      const rows = chunk.map(({ ci }) => {
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
      for (const { ci, existed } of chunk) {
        const invId = idByClover.get(ci.id) ?? null;
        if (existed) {
          // Upgrade the pre-existing unlinked link in place.
          await db
            .from("clover_item_links")
            .update({
              inventory_item_id: invId,
              clover_name: ci.name,
              clover_price_cents: ci.priceCents,
              link_status: invId ? "linked" : "unlinked",
              last_synced_at: nowIso,
            })
            .eq("clover_item_id", ci.id);
        } else {
          linksToInsert.push({
            clover_item_id: ci.id,
            inventory_item_id: invId,
            clover_name: ci.name,
            clover_price_cents: ci.priceCents,
            link_status: invId ? "linked" : "unlinked",
            last_synced_at: nowIso,
          });
        }
        if (invId) created++;
      }
    }

    if (linksToInsert.length) {
      const { error } = await db.from("clover_item_links").insert(linksToInsert);
      if (error) throw new Error(error.message);
    }
    await db
      .from("clover_connection")
      .update({ connected: true, last_import_at: nowIso })
      .eq("id", true);

    return {
      fetched: items.length,
      created, // new workspace items created + linked
      updated, // already-linked items refreshed
      autoLinked, // linked to a pre-existing workspace item by name
      unlinkedNew: linksToInsert.length - created - autoLinked,
    };
  });
