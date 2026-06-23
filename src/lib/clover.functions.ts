import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin, requireEditor } from "@/lib/auth-guards";
import { nameScore } from "@/lib/name-match";

// Availability states for inventory that could plausibly be a Clover product
// (live or about-to-be-live stock) — used to bound the match-candidate set.
const LINKABLE_AVAIL = ["available", "incoming", "quarantine", "needs_id", "on_hold"];

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

// ============================================================
// Clover reconcile (wizard 2) — link unlinked POS items, resolve
// needs-review sales, and surface in-store items Clover doesn't know about.
// All editor-gated (admin|dev); these touch stock + money. Tabs A/C use the
// user-scoped client (editor RLS covers them); Tab B's sale-event UPDATE is
// admin-only RLS, so it goes through supabaseAdmin after the requireEditor gate.
// ============================================================

// ---------- Tab A: unlinked Clover products + fuzzy suggestions ----------
export const getUnlinkedCloverItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;

    const { data: links } = await db
      .from("clover_item_links")
      .select("id, clover_item_id, clover_name, clover_price_cents, last_synced_at")
      .eq("link_status", "unlinked")
      .limit(500);
    const { data: items } = await db
      .from("inventory_items")
      .select("id, item_name, scientific_name, item_type, retail_price")
      .in("availability_status", LINKABLE_AVAIL)
      .limit(5000);
    const inv = items ?? [];

    const rows = (links ?? []).map((l: any) => {
      const cname = l.clover_name ?? "";
      const suggestions = inv
        .map((it: any) => {
          let s = nameScore(cname, it.item_name ?? "");
          if (it.scientific_name) s = Math.max(s, nameScore(cname, it.scientific_name));
          return {
            inventoryItemId: it.id,
            itemName: it.item_name,
            itemType: it.item_type,
            retailPrice: it.retail_price,
            score: Math.round(s * 100) / 100,
          };
        })
        .filter((x: any) => x.score >= 0.5)
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 5);
      return {
        cloverItemId: l.clover_item_id,
        cloverName: l.clover_name,
        cloverPriceCents: l.clover_price_cents,
        suggestions,
      };
    });
    return { rows, total: rows.length };
  });

// ---------- Tab A: link an existing inventory item to a Clover product ----------
export const linkCloverItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ cloverItemId: z.string().min(1), inventoryItemId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;

    const { data: item } = await db
      .from("inventory_items")
      .select("id")
      .eq("id", data.inventoryItemId)
      .maybeSingle();
    if (!item) throw new Error("Inventory item not found");

    const { data: updated, error } = await db
      .from("clover_item_links")
      .update({
        inventory_item_id: data.inventoryItemId,
        link_status: "linked",
        last_synced_at: new Date().toISOString(),
      })
      .eq("clover_item_id", data.cloverItemId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("Clover link not found");
    return { ok: true };
  });

// ---------- Tab A: create a draft inventory item from a Clover product, then link ----------
// Deliberately a NON-LIVE stub: qty 0 (no phantom sellable stock), not_for_sale,
// not_priced, needs_photo. Real stock/price/photo come through the normal flows.
export const createInventoryFromCloverLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cloverItemId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;

    const { data: link } = await db
      .from("clover_item_links")
      .select("clover_item_id, clover_name, clover_price_cents, link_status")
      .eq("clover_item_id", data.cloverItemId)
      .maybeSingle();
    if (!link) throw new Error("Clover link not found");
    if (link.link_status === "linked") throw new Error("This Clover item is already linked");

    const retail = link.clover_price_cents != null ? Number(link.clover_price_cents) / 100 : null;
    const { data: inserted, error: insErr } = await db
      .from("inventory_items")
      .insert({
        item_name: link.clover_name || "(Clover item)",
        item_type: "other",
        quantity_received: 0,
        quantity_available: 0,
        quantity_on_hold: 0,
        quantity_sold: 0,
        quantity_lost: 0,
        retail_price: retail,
        pricing_status: "not_priced",
        availability_status: "not_for_sale",
        live_sale_status: "not_eligible",
        needs_photo: true,
        attrs: { clover_item_id: link.clover_item_id, created_from: "clover_reconcile" },
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    const { error: linkErr } = await db
      .from("clover_item_links")
      .update({
        inventory_item_id: inserted.id,
        link_status: "linked",
        last_synced_at: new Date().toISOString(),
      })
      .eq("clover_item_id", data.cloverItemId);
    if (linkErr) throw new Error(linkErr.message);
    return { ok: true, inventoryItemId: inserted.id };
  });

// ---------- Tab B: Clover sales stuck in needs_review (+ suggestions for unmatched) ----------
export const getCloverReviewSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;

    const { data: events } = await db
      .from("inventory_sale_events")
      .select(
        "id, inventory_item_id, qty, unit_price_cents, total_cents, kind, clover_order_id, clover_item_name, sold_at",
      )
      .eq("source", "clover")
      .eq("status", "needs_review")
      .order("sold_at", { ascending: false })
      .limit(500);

    const { data: items } = await db
      .from("inventory_items")
      .select("id, item_name, scientific_name, item_type")
      .in("availability_status", LINKABLE_AVAIL)
      .limit(5000);
    const inv = items ?? [];
    const byId = new Map(inv.map((it: any) => [it.id, it]));

    const rows = (events ?? []).map((e: any) => {
      const cname = e.clover_item_name ?? "";
      // Already-linked event (e.g. a refund on a known item) → show the item; no suggest needed.
      const linked = e.inventory_item_id ? byId.get(e.inventory_item_id) : null;
      const suggestions = e.inventory_item_id
        ? []
        : inv
            .map((it: any) => {
              let s = nameScore(cname, it.item_name ?? "");
              if (it.scientific_name) s = Math.max(s, nameScore(cname, it.scientific_name));
              return {
                inventoryItemId: it.id,
                itemName: it.item_name,
                score: Math.round(s * 100) / 100,
              };
            })
            .filter((x: any) => x.score >= 0.5)
            .sort((a: any, b: any) => b.score - a.score)
            .slice(0, 5);
      return {
        id: e.id,
        kind: e.kind,
        qty: Number(e.qty ?? 1),
        unitPriceCents: e.unit_price_cents,
        totalCents: e.total_cents,
        cloverItemName: e.clover_item_name,
        cloverOrderId: e.clover_order_id,
        soldAt: e.sold_at,
        inventoryItemId: e.inventory_item_id,
        linkedItemName: (linked as any)?.item_name ?? null,
        suggestions,
      };
    });
    return { rows, total: rows.length };
  });

// ---------- Tab B: resolve one needs-review sale (apply decrements; acknowledge is terminal) ----------
export const resolveReviewSaleEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        saleEventId: z.string().uuid(),
        action: z.enum(["apply", "acknowledge"]),
        inventoryItemId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: row, error: readErr } = await db
      .from("inventory_sale_events")
      .select("id, inventory_item_id, qty, kind, source, status")
      .eq("id", data.saleEventId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row) throw new Error("Sale event not found");
    if (row.source !== "clover" || row.status !== "needs_review")
      throw new Error("This sale is no longer awaiting review");

    // Acknowledge — no stock moves (standing "no auto-reverse" policy). Terminal = reversed.
    if (data.action === "acknowledge") {
      const { data: upd, error } = await admin
        .from("inventory_sale_events")
        .update({ status: "reversed" })
        .eq("id", data.saleEventId)
        .eq("status", "needs_review")
        .select("id");
      if (error) throw new Error(error.message);
      if (!upd || upd.length === 0) throw new Error("Already resolved");
      return { ok: true, newStatus: "reversed", stockMoved: false };
    }

    // Apply — sales only, decrements stock exactly once.
    if (row.kind !== "sale")
      throw new Error("Only sales can be applied — acknowledge refunds/voids instead");
    const targetItemId = row.inventory_item_id ?? data.inventoryItemId;
    if (!targetItemId) throw new Error("Pick an inventory item to apply this sale to");

    // Verify the target exists BEFORE the status flip, so we never flip-without-decrement.
    const { data: target } = await db
      .from("inventory_items")
      .select("id")
      .eq("id", targetItemId)
      .maybeSingle();
    if (!target) throw new Error("Inventory item not found");

    // Status-flip-as-lock: flip needs_review→applied first; only the caller that
    // actually flips it (1 row) proceeds to decrement, so stock can't double-count.
    const { data: upd, error: updErr } = await admin
      .from("inventory_sale_events")
      .update({ status: "applied", inventory_item_id: targetItemId })
      .eq("id", data.saleEventId)
      .eq("status", "needs_review")
      .select("id, qty");
    if (updErr) throw new Error(updErr.message);
    if (!upd || upd.length === 0) throw new Error("Already resolved");

    const { error: decErr } = await admin.rpc("decrement_inventory_stock", {
      _id: targetItemId,
      _qty: Number(row.qty ?? 1),
    });
    if (decErr) throw new Error(`Marked applied, but stock decrement failed: ${decErr.message}`);
    return { ok: true, newStatus: "applied", stockMoved: true };
  });

// ---------- Tab C: in-store inventory that has no Clover link ----------
export const getInStoreNotInClover = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;

    const { data: links } = await db
      .from("clover_item_links")
      .select("inventory_item_id")
      .not("inventory_item_id", "is", null)
      .limit(10000);
    const linkedIds = new Set((links ?? []).map((l: any) => l.inventory_item_id));

    const { data: items } = await db
      .from("inventory_items")
      .select("id, item_name, item_type, retail_price, availability_status")
      .in("availability_status", ["available", "on_hold"])
      .order("item_name")
      .limit(2000);

    const rows = (items ?? [])
      .filter((it: any) => !linkedIds.has(it.id))
      .map((it: any) => ({
        id: it.id,
        itemName: it.item_name,
        itemType: it.item_type,
        retailPrice: it.retail_price,
        availabilityStatus: it.availability_status,
      }));
    return { rows, total: rows.length };
  });
