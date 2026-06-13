import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { data: conn } = await db.from("clover_connection").select("*").maybeSingle();
    const count = async (q: any) => (await q).count ?? 0;
    const total = await count(db.from("clover_item_links").select("id", { count: "exact", head: true }));
    const linked = await count(
      db.from("clover_item_links").select("id", { count: "exact", head: true }).eq("link_status", "linked"),
    );
    return {
      configured: !!process.env.CLOVER_MERCHANT_ID,
      connected: !!conn?.connected,
      lastImportAt: conn?.last_import_at ?? null,
      lastSaleSyncedAt: conn?.last_sale_synced_at ?? null,
      total,
      linked,
      unlinked: total - linked,
    };
  });

// ---------- test the API token/merchant (admin) ----------
export const testCloverConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { cloverTestConnection } = await import("@/lib/clover.api");
    const merchant = await cloverTestConnection();
    await (context.supabase as any)
      .from("clover_connection")
      .update({ connected: true })
      .eq("id", true);
    return { merchant };
  });

// ---------- import Clover catalog → clover_item_links (admin) ----------
// Pulls every Clover item, upserts the mapping, and auto-links to an existing
// inventory item by exact (case-insensitive) name. Unmatched items stay
// `unlinked` for manual mapping. Read-only against Clover.
export const importCloverCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const db = context.supabase as any;
    const { cloverListItems } = await import("@/lib/clover.api");
    const items = await cloverListItems();

    // existing links keyed by clover item id
    const { data: existingLinks } = await db
      .from("clover_item_links")
      .select("clover_item_id, inventory_item_id, link_status");
    const linkByClover = new Map<string, any>(
      (existingLinks ?? []).map((r: any) => [r.clover_item_id, r]),
    );

    // inventory items for name auto-match (first match per lowercased name)
    const { data: inv } = await db.from("inventory_items").select("id, item_name");
    const invByName = new Map<string, string>();
    for (const it of inv ?? []) {
      const key = (it.item_name ?? "").trim().toLowerCase();
      if (key && !invByName.has(key)) invByName.set(key, it.id);
    }

    const toInsert: any[] = [];
    let updated = 0;
    let newlyMatched = 0;
    const nowIso = new Date().toISOString();

    for (const ci of items) {
      const existing = linkByClover.get(ci.id);
      if (existing) {
        await db
          .from("clover_item_links")
          .update({ clover_name: ci.name, clover_price_cents: ci.priceCents, last_synced_at: nowIso })
          .eq("clover_item_id", ci.id);
        updated++;
        continue;
      }
      const match = invByName.get(ci.name.trim().toLowerCase()) ?? null;
      if (match) newlyMatched++;
      toInsert.push({
        clover_item_id: ci.id,
        inventory_item_id: match,
        clover_name: ci.name,
        clover_price_cents: ci.priceCents,
        link_status: match ? "linked" : "unlinked",
        last_synced_at: nowIso,
      });
    }

    if (toInsert.length) {
      const { error } = await db.from("clover_item_links").insert(toInsert);
      if (error) throw new Error(error.message);
    }
    await db
      .from("clover_connection")
      .update({ connected: true, last_import_at: nowIso })
      .eq("id", true);

    return {
      fetched: items.length,
      created: toInsert.length,
      updated,
      autoLinked: newlyMatched,
      unlinkedNew: toInsert.length - newlyMatched,
    };
  });
