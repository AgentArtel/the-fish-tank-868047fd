import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadLoyaltyConfig, recordSaleEarn } from "@/lib/loyalty.server";
import { deriveTier, nextTier, normalizeTiers, passportBadges } from "@/lib/loyalty";
import { requireAdmin, requireEditor } from "@/lib/auth-guards";

const YEAR_MS = 365 * 86_400_000;

// ---------- config: read (editor) ----------
export const getLoyaltyConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireEditor(context.supabase, context.userId);
    const cfg = await loadLoyaltyConfig(context.supabase as any);
    return { enabled: cfg.enabled, earnPercent: cfg.earnPercent, tiers: cfg.tiers };
  });

// ---------- config: save (admin) ----------
// Upserts the single config row (id = true). Tiers are validated/normalized so a
// malformed paste can never break the earn path or the customer card.
export const saveLoyaltyConfig = createServerFn({ method: "POST" })
  .inputValidator((d: { enabled: boolean; earnPercent: number; tiers?: unknown }) =>
    z
      .object({
        enabled: z.boolean(),
        earnPercent: z.number().min(0).max(100),
        tiers: z.any().optional(),
      })
      .parse(d),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const db = context.supabase as any;
    const tiers = normalizeTiers(data.tiers);
    // Upsert (not update) so saving still persists if the seed row is ever missing
    // — an `.update().eq("id", true)` would silently no-op on zero rows.
    const { error } = await db.from("loyalty_config").upsert(
      {
        id: true,
        enabled: data.enabled,
        earn_percent: data.earnPercent,
        tiers,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, tiers };
  });

// ---------- customer membership snapshot (editor) ----------
// Everything the Reef Club card needs: balance, tier (rolling-12-mo spend),
// progress to next tier, Reef Passport badges, and recent ledger activity.
export const getCustomerLoyalty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;
    const cfg = await loadLoyaltyConfig(db);

    const { data: cust } = await db
      .from("customers")
      .select("reef_club_enrolled_at")
      .eq("id", data.id)
      .maybeSingle();

    // Balance + rolling-12-mo spend come from the DB-side aggregation RPC (no JS
    // sum, no row caps) — correct and cheap regardless of ledger/sale volume.
    const { data: summaryRows } = await db.rpc("customer_loyalty_summary", {
      _customer_id: data.id,
    });
    const summary = Array.isArray(summaryRows) ? summaryRows[0] : summaryRows;
    const balanceCents = Number(summary?.balance_cents ?? 0);
    const annualSpendCents = Number(summary?.annual_spend_cents ?? 0);

    // Recent activity for display (capped — display only, not used for the balance).
    const { data: ledgerRows } = await db
      .from("loyalty_ledger")
      .select("id, kind, amount_cents, channel, reason, created_at")
      .eq("customer_id", data.id)
      .order("created_at", { ascending: false })
      .limit(200);
    const ledger = (ledgerRows ?? []).map((r: any) => ({
      id: r.id,
      kind: r.kind as string,
      amountCents: Number(r.amount_cents ?? 0),
      channel: r.channel as string | null,
      reason: r.reason as string | null,
      createdAt: r.created_at as string,
    }));

    // Sale history (rolling 12 months) → Reef Passport labels only (spend now comes
    // from the RPC above). Bounded by the sold_at window; badges reflect the
    // member's last-12-months collection.
    const sinceIso = new Date(Date.now() - YEAR_MS).toISOString();
    const { data: events } = await db
      .from("inventory_sale_events")
      .select("clover_item_name, item:inventory_item_id(item_name)")
      .eq("customer_id", data.id)
      .eq("kind", "sale")
      .gte("sold_at", sinceIso)
      .order("sold_at", { ascending: false })
      .limit(2000);
    const labels: (string | null)[] = (events ?? []).map(
      (e: any) => e.item?.item_name ?? e.clover_item_name ?? null,
    );

    const tier = deriveTier(annualSpendCents, cfg.tiers);
    const next = nextTier(annualSpendCents, cfg.tiers);
    const badges = passportBadges(labels);

    return {
      enabled: cfg.enabled,
      earnPercent: cfg.earnPercent,
      enrolled: !!cust?.reef_club_enrolled_at || ledger.length > 0,
      enrolledAt: cust?.reef_club_enrolled_at ?? null,
      balanceCents,
      annualSpendCents,
      tier: { name: tier.name, earnMultiplier: tier.earn_multiplier, perks: tier.perks },
      nextTier: next ? { name: next.name, minAnnualCents: next.min_annual_cents } : null,
      badges,
      ledger,
    };
  });

// ---------- manual ledger entry (admin) ----------
// Add credit, record a redemption (e.g. against a coral won at a live sale), or
// approve a DOA replacement credit. `earn` is system-only and not allowed here.
// Redemptions go through the atomic `loyalty_redeem` RPC, which re-checks the
// balance under a row lock so concurrent redemptions can't overdraw; other kinds
// are positive credits inserted directly (admin-gated by RLS + the sign CHECK).
export const recordLoyaltyEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        customerId: z.string().uuid(),
        kind: z.enum(["bonus", "redeem", "doa", "adjust"]),
        amountCents: z.number().int().positive().max(100_000_00),
        channel: z.enum(["live_sale", "in_store", "online"]).optional(),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const db = context.supabase as any;

    if (data.kind === "redeem") {
      // Atomic: the RPC locks the customer row, re-checks balance, and rejects
      // overdraw in-transaction (no read-then-write race).
      const { error } = await db.rpc("loyalty_redeem", {
        _customer_id: data.customerId,
        _amount_cents: data.amountCents,
        _channel: data.channel ?? "in_store",
        _reason: data.reason?.trim() || null,
      });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("loyalty_ledger").insert({
        customer_id: data.customerId,
        kind: data.kind,
        amount_cents: data.amountCents, // positive credit (bonus/doa/adjust)
        channel: data.channel ?? null,
        reason: data.reason?.trim() || null,
        created_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }

    // First manual entry marks the explicit "joined the club" moment.
    await db
      .from("customers")
      .update({ reef_club_enrolled_at: new Date().toISOString() })
      .eq("id", data.customerId)
      .is("reef_club_enrolled_at", null);

    // Return the fresh balance from the DB aggregate.
    const { data: summaryRows } = await db.rpc("customer_loyalty_summary", {
      _customer_id: data.customerId,
    });
    const summary = Array.isArray(summaryRows) ? summaryRows[0] : summaryRows;
    return { ok: true, balanceCents: Number(summary?.balance_cents ?? 0) };
  });

// ---------- attribution: recent sales with no buyer attached (editor) ----------
// The attribution gap: most walk-in Clover sales are anonymous, so they never
// earn. This lists recent unattributed sales (grouped by order) so staff can
// attach the member who actually bought them. Bounded by a time window + row cap.
export const listUnattributedSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        days: z.number().int().min(1).max(365).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;
    const sinceIso = new Date(Date.now() - (data.days ?? 60) * 86_400_000).toISOString();

    const { data: events } = await db
      .from("inventory_sale_events")
      .select(
        "id, total_cents, sold_at, clover_order_id, clover_item_name, item:inventory_item_id(item_name)",
      )
      .is("customer_id", null)
      .eq("kind", "sale")
      .gte("sold_at", sinceIso)
      .order("sold_at", { ascending: false })
      .limit(data.limit ?? 100);

    // Group line items into their order (standalone manual sales keep their own id).
    type OrderAcc = {
      key: string;
      soldAt: string;
      totalCents: number;
      lines: { id: string; label: string }[];
    };
    const orders = new Map<string, OrderAcc>();
    for (const e of events ?? []) {
      const key = e.clover_order_id ?? `sale:${e.id}`;
      const o: OrderAcc = orders.get(key) ?? { key, soldAt: e.sold_at, totalCents: 0, lines: [] };
      o.totalCents += Number(e.total_cents ?? 0);
      o.lines.push({ id: e.id, label: e.item?.item_name ?? e.clover_item_name ?? "(item)" });
      if (e.sold_at > o.soldAt) o.soldAt = e.sold_at;
      orders.set(key, o);
    }
    const rows = [...orders.values()].sort((a, b) => (a.soldAt < b.soldAt ? 1 : -1));
    return { orders: rows };
  });

// ---------- attribution: attach a buyer to unattributed sales (editor) ----------
// Stamps customer_id onto the given sale events (only those still unattributed,
// so we never steal a sale from another customer) and retro-earns Reef Credit for
// each, idempotently via the shared helper. Doubles as the earn-backfill recovery
// path for sales whose live earn was missed.
export const attachSaleToCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        customerId: z.string().uuid(),
        saleEventIds: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;
    const cfg = await loadLoyaltyConfig(db);

    // Only touch sales that are still unattributed (guards against races / re-tags).
    const { data: targets } = await db
      .from("inventory_sale_events")
      .select("id, total_cents, kind")
      .in("id", data.saleEventIds)
      .is("customer_id", null)
      .eq("kind", "sale");
    const ids = (targets ?? []).map((t: any) => t.id);
    if (ids.length === 0) return { attached: 0, earnedCents: 0 };

    const { error: ue } = await db
      .from("inventory_sale_events")
      .update({ customer_id: data.customerId })
      .in("id", ids)
      .is("customer_id", null);
    if (ue) throw new Error(ue.message);

    let earnedCents = 0;
    if (cfg.enabled && cfg.earnPercent > 0) {
      for (const t of targets ?? []) {
        earnedCents += await recordSaleEarn(db, {
          customerId: data.customerId,
          saleEventId: t.id,
          totalCents: t.total_cents,
          earnPercent: cfg.earnPercent,
          userId: context.userId,
        });
      }
    }

    await db
      .from("customers")
      .update({ reef_club_enrolled_at: new Date().toISOString() })
      .eq("id", data.customerId)
      .is("reef_club_enrolled_at", null);

    return { attached: ids.length, earnedCents };
  });
