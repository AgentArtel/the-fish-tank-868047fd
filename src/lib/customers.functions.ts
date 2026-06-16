import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- guards ----------
async function requireEditor(supabase: any, userId: string) {
  const { data: prof } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!prof?.is_active) throw new Error("Forbidden: account pending approval");
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some(
    (r: any) => r.role === "admin" || r.role === "creator" || r.role === "reviewer",
  );
  if (!ok) throw new Error("Forbidden: editor role required");
}

const displayName = (c: any) =>
  [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
  c.email ||
  c.phone ||
  "Unnamed customer";

// ---------- customer list with lifetime spend + visit counts (editor) ----------
// Prefers the DB-side `customers_with_spend` RPC (search + aggregation + sort in SQL).
// Falls back to the bounded JS aggregation if the RPC isn't deployed yet, so this is
// non-breaking and auto-upgrades when the migration lands.
export const listCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().max(200).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;

    const { data: rpcRows, error: rpcErr } = await db.rpc("customers_with_spend", {
      _q: data.q ?? null,
      _limit: 1000,
    });
    if (!rpcErr && Array.isArray(rpcRows)) {
      const rows = rpcRows.map((c: any) => ({
        id: c.id,
        name: displayName(c),
        email: c.email,
        phone: c.phone,
        marketingConsent: c.marketing_consent,
        lifetimeSpendCents: Number(c.spend_cents ?? 0),
        orderCount: Number(c.order_count ?? 0),
        lastPurchaseAt: c.last_purchase_at ?? c.last_seen_at ?? null,
      }));
      return { rows, total: rows.length };
    }

    // Fallback (RPC not deployed): read customers + their sale events and aggregate
    // in JS. Bounded by .limit() — see handoff-customers-aggregation.md.
    let q = db
      .from("customers")
      .select(
        "id, first_name, last_name, email, phone, marketing_consent, first_seen_at, last_seen_at",
      )
      .limit(1000);
    if (data.q) {
      const like = `%${data.q}%`;
      q = q.or(
        `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`,
      );
    }
    const { data: customers, error } = await q;
    if (error) throw new Error(error.message);

    // Aggregate spend/orders per customer from the sale ledger.
    const { data: events } = await db
      .from("inventory_sale_events")
      .select("customer_id, total_cents, kind, clover_order_id, sold_at")
      .not("customer_id", "is", null)
      .limit(50000);
    const agg = new Map<string, { spendCents: number; orders: Set<string>; last: string | null }>();
    for (const e of events ?? []) {
      if (e.kind !== "sale") continue;
      const a = agg.get(e.customer_id) ?? { spendCents: 0, orders: new Set<string>(), last: null };
      a.spendCents += Number(e.total_cents ?? 0);
      if (e.clover_order_id) a.orders.add(e.clover_order_id);
      if (!a.last || e.sold_at > a.last) a.last = e.sold_at;
      agg.set(e.customer_id, a);
    }

    const rows = (customers ?? [])
      .map((c: any) => {
        const a = agg.get(c.id);
        return {
          id: c.id,
          name: displayName(c),
          email: c.email,
          phone: c.phone,
          marketingConsent: c.marketing_consent,
          lifetimeSpendCents: a?.spendCents ?? 0,
          orderCount: a?.orders.size ?? 0,
          lastPurchaseAt: a?.last ?? c.last_seen_at ?? null,
        };
      })
      .sort((a: any, b: any) => b.lifetimeSpendCents - a.lifetimeSpendCents);

    return { rows, total: rows.length };
  });

// ---------- single customer + purchase history (editor) ----------
export const getCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;

    const { data: c, error } = await db
      .from("customers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Customer not found");

    const { data: events } = await db
      .from("inventory_sale_events")
      .select(
        "id, qty, total_cents, sold_at, kind, status, clover_item_name, clover_order_id, item:inventory_item_id(item_name, item_type)",
      )
      .eq("customer_id", data.id)
      .order("sold_at", { ascending: false })
      .limit(2000);

    const sales = (events ?? []).filter((e: any) => e.kind === "sale");
    const lifetimeSpendCents = sales.reduce(
      (n: number, e: any) => n + Number(e.total_cents ?? 0),
      0,
    );
    const orderIds = new Set(sales.map((e: any) => e.clover_order_id).filter(Boolean));

    const history = (events ?? []).map((e: any) => ({
      id: e.id,
      label: e.item?.item_name ?? e.clover_item_name ?? "(item)",
      itemType: e.item?.item_type ?? null,
      qty: Number(e.qty ?? 0),
      totalCents: Number(e.total_cents ?? 0),
      soldAt: e.sold_at,
      kind: e.kind,
      status: e.status,
    }));

    return {
      customer: {
        id: c.id,
        name: displayName(c),
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone,
        marketingConsent: c.marketing_consent,
        notes: c.notes,
        firstSeenAt: c.first_seen_at,
        lastSeenAt: c.last_seen_at,
      },
      lifetimeSpendCents,
      orderCount: orderIds.size,
      history,
    };
  });
