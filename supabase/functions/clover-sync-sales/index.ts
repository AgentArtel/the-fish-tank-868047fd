// Edge function: clover-sync-sales
// Pulls recent Clover orders (overlap window) → writes inventory_sale_events.
// Linked, non-refund lines call the shared apply_inventory_sale RPC (which
// inserts the event, decrements stock, and awards Reef Credit). Refunds and
// unmatched lines land as `needs_review` for a human.
//
// Invoked by pg_cron every 10 min (service-role JWT) AND by the admin "Sync
// sales now" button. Idempotent via UNIQUE(clover_order_id, clover_line_item_id)
// inside the RPC + dedupe inserts here.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  corsHeaders,
  json,
  requireAdminCaller,
  requireCloverCreds,
  cloverListRecentOrders,
  type CloverOrder,
} from "../_shared/clover.ts";

const DEFAULT_LOOKBACK_DAYS = 7;
const OVERLAP_MS = 60 * 60 * 1000; // 1h re-scan to catch late-edited orders

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { admin, userId, error } = await requireAdminCaller(req);
  if (error) return error;

  let body: { sinceMs?: number } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return json({ error: "bad json body" }, 400);
  }

  try {
    const runStart = Date.now();
    let sinceMs = body.sinceMs ?? null;
    if (sinceMs == null) {
      const { data: conn } = await admin
        .from("clover_connection")
        .select("last_sale_synced_at")
        .maybeSingle();
      sinceMs = (conn as any)?.last_sale_synced_at
        ? new Date((conn as any).last_sale_synced_at).getTime() - OVERLAP_MS
        : runStart - DEFAULT_LOOKBACK_DAYS * 86_400_000;
    }

    const creds = await requireCloverCreds(admin);
    const orders = await cloverListRecentOrders(creds, sinceMs);
    const saleOrders = orders.filter((o) => o.paid);

    const counts = await processSaleOrders(admin, saleOrders, {
      userId,
      runStartMs: runStart,
    });

    const syncedThroughIso = new Date(runStart).toISOString();
    await admin
      .from("clover_connection")
      .update({ last_sale_synced_at: syncedThroughIso })
      .eq("id", true);

    return json({ ok: true, ordersScanned: saleOrders.length, ...counts, syncedThroughIso });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? String(e) }, 500);
  }
});

async function processSaleOrders(
  admin: SupabaseClient,
  saleOrders: CloverOrder[],
  opts: { userId: string | null; runStartMs: number },
) {
  // Upsert customers attached to any order in this batch.
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
      last_seen_at: new Date(opts.runStartMs).toISOString(),
    }));
    const { data: up, error: ce } = await admin
      .from("customers")
      .upsert(rows, { onConflict: "clover_customer_id" })
      .select("id, clover_customer_id");
    if (ce) throw new Error(ce.message);
    for (const r of (up as any[]) ?? []) customerIdByClover.set(r.clover_customer_id, r.id);
    customersUpserted = up?.length ?? 0;

    // Backfill customer_id onto already-ingested events for these orders.
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
        await admin
          .from("inventory_sale_events")
          .update({ customer_id: cid })
          .in("clover_order_id", oids.slice(i, i + 100))
          .is("customer_id", null);
      }
    }
  }

  // Resolve clover_item_id → workspace inventory_item_id for this batch.
  const pageCloverItemIds = [
    ...new Set(
      saleOrders.flatMap((o) =>
        o.lineItems.map((li) => li.cloverItemId).filter((x): x is string => !!x),
      ),
    ),
  ];
  const invByClover = new Map<string, string | null>();
  for (let i = 0; i < pageCloverItemIds.length; i += 200) {
    const chunk = pageCloverItemIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const { data: links } = await admin
      .from("clover_item_links")
      .select("clover_item_id, inventory_item_id")
      .in("clover_item_id", chunk);
    for (const l of (links as any[]) ?? [])
      invByClover.set(l.clover_item_id, l.inventory_item_id ?? null);
  }

  // Up-front dedupe against the composite UNIQUE.
  const dedupeKey = (orderId: string, lineId: string) => `${orderId}::${lineId}`;
  const allLineIds = saleOrders.flatMap((o) => o.lineItems.map((li) => li.id));
  const seen = new Set<string>();
  for (let i = 0; i < allLineIds.length; i += 200) {
    const chunk = allLineIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const { data: existing } = await admin
      .from("inventory_sale_events")
      .select("clover_order_id, clover_line_item_id")
      .in("clover_line_item_id", chunk);
    for (const e of (existing as any[]) ?? [])
      if (e.clover_order_id && e.clover_line_item_id)
        seen.add(dedupeKey(e.clover_order_id, e.clover_line_item_id));
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
      const key = dedupeKey(o.id, li.id);
      if (seen.has(key)) {
        skippedDuplicates++;
        continue;
      }
      seen.add(key);

      const invId = li.cloverItemId ? (invByClover.get(li.cloverItemId) ?? null) : null;
      const kind: "sale" | "refund" = li.refunded ? "refund" : "sale";

      try {
        if (invId && kind === "sale") {
          // Single money path — RPC handles event + decrement + loyalty atomically.
          const { data: r, error: rpcErr } = await admin.rpc("apply_inventory_sale", {
            _inventory_item_id: invId,
            _qty: 1,
            _unit_price_cents: li.priceCents,
            _source: "clover",
            _kind: "sale",
            _clover_order_id: o.id,
            _clover_line_item_id: li.id,
            _clover_payment_id: o.paymentId,
            _clover_item_name: li.name,
            _customer_id: customerId,
            _user_id: opts.userId,
          });
          if (rpcErr) throw new Error(rpcErr.message);
          const row = Array.isArray(r) ? r[0] : r;
          if (row?.duplicate) skippedDuplicates++;
          else applied++;
        } else {
          // Unmatched item or refund/void → review queue, no stock change.
          const { error: insErr } = await admin.from("inventory_sale_events").insert({
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
            created_by: opts.userId,
          });
          if (insErr && !/duplicate key|unique/i.test(insErr.message))
            throw new Error(insErr.message);
          if (insErr) skippedDuplicates++;
          else {
            needsReview++;
            if (!invId) unmatched++;
          }
        }
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        if (/duplicate key|unique/i.test(msg)) skippedDuplicates++;
        else errors.push({ lineItemId: li.id, error: msg });
      }
    }
  }

  return {
    lineItemsSeen,
    applied,
    needsReview,
    unmatched,
    skippedDuplicates,
    customersSeen,
    customersUpserted,
    errors,
  };
}
