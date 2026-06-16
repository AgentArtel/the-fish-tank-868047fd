import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireEditor } from "@/lib/auth-guards";

// ============================================================================
// Sales report — one read of the sale ledger + catalog, aggregated in JS (mirrors
// getCoralSalesByType). A single server fn (one round-trip) keeps it inside the
// Cloudflare Worker budget. READ-ONLY insight only — it never changes pricing,
// availability, or inventory (CLAUDE.md invariant).
//
// Honesty caveats baked into the numbers:
//  - Revenue / orders / AOV count ALL kind='sale' rows (no join needed) → complete today.
//  - Item / type breakdowns only cover rows linked to an inventory_item → partial
//    until Clover linking is complete; we return `unlinkedSales` so the UI discloses it.
// ============================================================================
export const getSalesReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;
    const cutoff = new Date(Date.now() - data.days * 86_400_000).toISOString();

    const { data: events, error } = await db
      .from("inventory_sale_events")
      .select(
        "qty, total_cents, sold_at, kind, status, clover_order_id, clover_item_name, inventory_item_id",
      )
      .gte("sold_at", cutoff)
      .limit(20000);
    if (error) throw new Error(error.message);

    const { data: catalog } = await db
      .from("inventory_items")
      .select(
        "id, item_name, item_type, retail_price, availability_status, created_at, quantity_available",
      )
      .limit(5000);
    const itemById = new Map<string, any>();
    for (const it of catalog ?? []) itemById.set(it.id, it);

    const rows = events ?? [];
    const sales = rows.filter((r: any) => r.kind === "sale");

    // ---- summary (complete — no join needed) ----
    let revenueCents = 0;
    let unitsSold = 0;
    const orderKeys = new Set<string>();
    let looseLines = 0; // sale lines with no order id (manual)
    for (const r of sales) {
      revenueCents += Number(r.total_cents ?? 0);
      unitsSold += Number(r.qty ?? 0);
      if (r.clover_order_id) orderKeys.add(r.clover_order_id);
      else looseLines++;
    }
    const orderCount = orderKeys.size + looseLines;
    const needsReview = rows.filter((r: any) => r.status === "needs_review").length;
    const refunds = rows.filter((r: any) => r.kind === "refund" || r.kind === "void").length;
    const unlinkedSales = sales.filter((r: any) => !r.inventory_item_id).length;

    // ---- revenue over time (daily ≤45d, else weekly) ----
    const weekly = data.days > 45;
    const bucketMs = weekly ? 7 * 86_400_000 : 86_400_000;
    const start = Date.now() - data.days * 86_400_000;
    const buckets = new Map<number, number>();
    for (const r of sales) {
      const t = new Date(r.sold_at).getTime();
      const idx = Math.floor((t - start) / bucketMs);
      buckets.set(idx, (buckets.get(idx) ?? 0) + Number(r.total_cents ?? 0));
    }
    const nBuckets = Math.ceil(data.days / (weekly ? 7 : 1));
    const revenueOverTime: { label: string; revenueCents: number }[] = [];
    for (let i = 0; i < nBuckets; i++) {
      const d = new Date(start + i * bucketMs);
      revenueOverTime.push({
        label: weekly
          ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
        revenueCents: buckets.get(i) ?? 0,
      });
    }

    // ---- top sellers (label falls back to clover name for unlinked rows) ----
    const sellerMap = new Map<string, { label: string; qty: number; revenueCents: number }>();
    for (const r of sales) {
      const item = r.inventory_item_id ? itemById.get(r.inventory_item_id) : null;
      const label = item?.item_name ?? r.clover_item_name ?? "(unknown)";
      const key = r.inventory_item_id ?? `name:${label.toLowerCase()}`;
      const agg = sellerMap.get(key) ?? { label, qty: 0, revenueCents: 0 };
      agg.qty += Number(r.qty ?? 0);
      agg.revenueCents += Number(r.total_cents ?? 0);
      sellerMap.set(key, agg);
    }
    const topSellers = [...sellerMap.values()]
      .sort((a, b) => b.revenueCents - a.revenueCents || b.qty - a.qty)
      .slice(0, 15);

    // ---- sales by item type (linked rows only) ----
    const typeMap = new Map<string, { qty: number; revenueCents: number }>();
    for (const r of sales) {
      const item = r.inventory_item_id ? itemById.get(r.inventory_item_id) : null;
      if (!item?.item_type) continue;
      const agg = typeMap.get(item.item_type) ?? { qty: 0, revenueCents: 0 };
      agg.qty += Number(r.qty ?? 0);
      agg.revenueCents += Number(r.total_cents ?? 0);
      typeMap.set(item.item_type, agg);
    }
    const byItemType = [...typeMap.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.revenueCents - a.revenueCents);

    // ---- slow / no movers: available items with zero sales in window ----
    const soldIds = new Set<string>(sales.map((r: any) => r.inventory_item_id).filter(Boolean));
    const slowMovers = (catalog ?? [])
      .filter((it: any) => it.availability_status === "available" && !soldIds.has(it.id))
      .map((it: any) => ({
        id: it.id,
        name: it.item_name,
        type: it.item_type,
        retailCents: it.retail_price != null ? Math.round(Number(it.retail_price) * 100) : null,
        quantityAvailable: Number(it.quantity_available ?? 0),
        daysListed: Math.floor((Date.now() - new Date(it.created_at).getTime()) / 86_400_000),
      }))
      .sort((a: any, b: any) => b.daysListed - a.daysListed)
      .slice(0, 20);

    return {
      days: data.days,
      summary: {
        revenueCents,
        unitsSold,
        lineCount: sales.length,
        orderCount,
        aovCents: orderCount ? Math.round(revenueCents / orderCount) : 0,
        needsReview,
        refunds,
        unlinkedSales,
      },
      revenueOverTime,
      topSellers,
      byItemType,
      slowMovers,
    };
  });
