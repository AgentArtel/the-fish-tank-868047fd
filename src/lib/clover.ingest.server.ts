// Clover sale ingest (server-only). Pulls recent Clover orders and turns each
// line item into an inventory_sale_events row — decrementing stock through the
// shared `applyInventorySale` when the Clover item is linked to a workspace item.
//
// Idempotent: each Clover line item is recorded at most once
// (UNIQUE(clover_order_id, clover_line_item_id) + an up-front dedupe query), so
// re-polling the overlapping window never double-counts.
//
// Per the domain decision, refunds/voids and unmatched (unlinked) line items do
// NOT touch stock — they land as `needs_review` for a human to reconcile.
//
// Used by the admin "Sync sales now" button (user-scoped client) and the
// scheduled /api/public/hooks/clover-poll cron (service-role client).
import { applyInventorySale } from "@/lib/ops.functions";
import { cloverListRecentOrders, requireCloverCreds } from "@/lib/clover.api";

const DEFAULT_LOOKBACK_DAYS = 7;
const OVERLAP_MS = 60 * 60 * 1000; // re-scan the last hour to catch late-edited orders

export type CloverIngestResult = {
  ordersScanned: number;
  lineItemsSeen: number;
  applied: number; // linked sales (stock decremented / colony frag-off logged)
  needsReview: number; // refunds, voids, and unmatched line items
  unmatched: number; // subset of needsReview with no linked workspace item
  skippedDuplicates: number;
  customersSeen: number; // distinct customers attached to orders this run
  customersUpserted: number; // customers written/refreshed in the workspace
  errors: { lineItemId: string; error: string }[];
  syncedThroughIso: string;
};

export async function ingestCloverSales(
  db: any,
  opts: { sinceMs?: number; userId?: string } = {},
): Promise<CloverIngestResult> {
  const runStart = Date.now();

  // Window start: explicit override → last successful sync (minus overlap) →
  // first-run lookback.
  let sinceMs = opts.sinceMs ?? null;
  if (sinceMs == null) {
    const { data: conn } = await db
      .from("clover_connection")
      .select("last_sale_synced_at")
      .maybeSingle();
    sinceMs = conn?.last_sale_synced_at
      ? new Date(conn.last_sale_synced_at).getTime() - OVERLAP_MS
      : runStart - DEFAULT_LOOKBACK_DAYS * 86_400_000;
  }

  const creds = await requireCloverCreds();
  const orders = await cloverListRecentOrders(creds, sinceMs);
  const saleOrders = orders.filter((o) => o.paid); // completed sales only

  // Capture the buyer where an order has one (most are anonymous walk-ins → null).
  // Upsert each distinct Clover customer once, then map order → workspace customer id.
  const distinctCustomers = new Map<string, any>();
  for (const o of saleOrders)
    if (o.customer) distinctCustomers.set(o.customer.cloverId, o.customer);
  const customersSeen = distinctCustomers.size;
  const customerIdByClover = new Map<string, string>();
  let customersUpserted = 0;
  if (distinctCustomers.size) {
    const rows = [...distinctCustomers.values()].map((c) => ({
      clover_customer_id: c.cloverId,
      first_name: c.firstName,
      last_name: c.lastName,
      email: c.email,
      phone: c.phone,
      last_seen_at: new Date(runStart).toISOString(),
    }));
    const { data: up, error: ce } = await db
      .from("customers")
      .upsert(rows, { onConflict: "clover_customer_id" })
      .select("id, clover_customer_id");
    if (ce) throw new Error(ce.message);
    for (const r of up ?? []) customerIdByClover.set(r.clover_customer_id, r.id);
    customersUpserted = up?.length ?? 0;

    // Backfill customer_id onto any already-ingested sale events for these orders,
    // so a re-sync attaches the buyer to sales whose line items were recorded
    // before customer capture existed (one update per customer; idempotent).
    const orderIdsByCustomer = new Map<string, string[]>();
    for (const o of saleOrders) {
      const cid = o.customer ? customerIdByClover.get(o.customer.cloverId) : null;
      if (cid) {
        const arr = orderIdsByCustomer.get(cid) ?? [];
        arr.push(o.id);
        orderIdsByCustomer.set(cid, arr);
      }
    }
    for (const [cid, oids] of orderIdsByCustomer) {
      for (let i = 0; i < oids.length; i += 100) {
        await db
          .from("inventory_sale_events")
          .update({ customer_id: cid })
          .in("clover_order_id", oids.slice(i, i + 100))
          .is("customer_id", null);
      }
    }
  }

  // clover item id → linked workspace inventory item id (null when unlinked)
  const { data: links } = await db
    .from("clover_item_links")
    .select("clover_item_id, inventory_item_id");
  const invByClover = new Map<string, string | null>();
  for (const l of links ?? []) invByClover.set(l.clover_item_id, l.inventory_item_id ?? null);

  // Reef Club: load loyalty config once for the whole batch. When enabled, each
  // linked member sale earns store credit via applyInventorySale (idempotent).
  const { loadLoyaltyConfig } = await import("@/lib/loyalty.server");
  const loyaltyCfg = await loadLoyaltyConfig(db);
  const loyalty = loyaltyCfg.enabled ? { earnPercent: loyaltyCfg.earnPercent } : null;

  // Dedupe up front: which line items are already recorded?
  const allLineIds = saleOrders.flatMap((o) => o.lineItems.map((li) => li.id));
  const seen = new Set<string>();
  for (let i = 0; i < allLineIds.length; i += 200) {
    const chunk = allLineIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const { data: existing } = await db
      .from("inventory_sale_events")
      .select("clover_line_item_id")
      .in("clover_line_item_id", chunk);
    for (const e of existing ?? []) if (e.clover_line_item_id) seen.add(e.clover_line_item_id);
  }

  let lineItemsSeen = 0;
  let applied = 0;
  let needsReview = 0;
  let unmatched = 0;
  let skippedDuplicates = 0;
  const errors: { lineItemId: string; error: string }[] = [];

  for (const o of saleOrders) {
    const customerId = o.customer ? (customerIdByClover.get(o.customer.cloverId) ?? null) : null;
    for (const li of o.lineItems) {
      lineItemsSeen++;
      if (seen.has(li.id)) {
        skippedDuplicates++;
        continue;
      }
      seen.add(li.id); // guard against duplicate ids within the same batch

      const invId = li.cloverItemId ? (invByClover.get(li.cloverItemId) ?? null) : null;
      const kind: "sale" | "refund" = li.refunded ? "refund" : "sale";
      const refs = {
        orderId: o.id,
        lineItemId: li.id,
        paymentId: o.paymentId ?? undefined,
        itemName: li.name ?? undefined,
      };

      try {
        if (invId && kind === "sale") {
          // Linked sale → decrement stock (or log colony frag-off) via the
          // shared apply helper, which also writes the ledger row.
          await applyInventorySale(db, {
            inventoryItemId: invId,
            qty: 1,
            unitPriceCents: li.priceCents,
            source: "clover",
            kind: "sale",
            cloverRefs: refs,
            customerId,
            userId: opts.userId,
            loyalty,
          });
          applied++;
        } else {
          // Unmatched item, or a refund/void → review queue, no stock change.
          const { error } = await db.from("inventory_sale_events").insert({
            inventory_item_id: invId,
            qty: 1,
            unit_price_cents: li.priceCents,
            total_cents: li.priceCents,
            source: "clover",
            kind,
            status: "needs_review",
            clover_order_id: o.id,
            clover_line_item_id: li.id,
            clover_payment_id: o.paymentId,
            clover_item_name: li.name,
            customer_id: customerId,
            created_by: opts.userId ?? null,
          });
          // A concurrent run may have inserted the same (order, line) pair.
          if (error && !/duplicate key|unique/i.test(error.message)) throw new Error(error.message);
          if (error) {
            skippedDuplicates++;
          } else {
            needsReview++;
            if (!invId) unmatched++;
          }
        }
      } catch (e: any) {
        // A unique violation here means it was already ingested — treat as a dup.
        if (/duplicate key|unique/i.test(e?.message ?? "")) {
          skippedDuplicates++;
        } else {
          errors.push({ lineItemId: li.id, error: e?.message ?? String(e) });
        }
      }
    }
  }

  const syncedThroughIso = new Date(runStart).toISOString();
  await db
    .from("clover_connection")
    .update({ last_sale_synced_at: syncedThroughIso })
    .eq("id", true);

  return {
    ordersScanned: saleOrders.length,
    lineItemsSeen,
    applied,
    needsReview,
    unmatched,
    skippedDuplicates,
    customersSeen,
    customersUpserted,
    errors,
    syncedThroughIso,
  };
}
