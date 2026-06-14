import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadLoyaltyConfig } from "@/lib/loyalty.server";
import { deriveTier, nextTier, normalizeTiers, passportBadges } from "@/lib/loyalty";

// ---------- guards (mirror clover.functions.ts) ----------
async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => r.role === "admin");
}
async function requireActive(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();
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
    const { error } = await db
      .from("loyalty_config")
      .update({
        enabled: data.enabled,
        earn_percent: data.earnPercent,
        tiers,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
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
    const balanceCents = ledger.reduce((n: number, r: any) => n + r.amountCents, 0);

    // Sale history → rolling-12-mo spend (tier) + item labels (passport).
    const { data: events } = await db
      .from("inventory_sale_events")
      .select("total_cents, sold_at, kind, clover_item_name, item:inventory_item_id(item_name)")
      .eq("customer_id", data.id)
      .eq("kind", "sale")
      .limit(2000);
    const cutoff = Date.now() - YEAR_MS;
    let annualSpendCents = 0;
    const labels: (string | null)[] = [];
    for (const e of events ?? []) {
      labels.push(e.item?.item_name ?? e.clover_item_name ?? null);
      if (e.sold_at && new Date(e.sold_at).getTime() >= cutoff) {
        annualSpendCents += Number(e.total_cents ?? 0);
      }
    }

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
// approve a DOA replacement credit. `earn` is system-only (sync path) and not
// allowed here. amountCents is always positive; the sign follows the kind.
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

    // Current balance — used to block over-redemption.
    const { data: rows } = await db
      .from("loyalty_ledger")
      .select("amount_cents")
      .eq("customer_id", data.customerId);
    const balanceCents = (rows ?? []).reduce(
      (n: number, r: any) => n + Number(r.amount_cents ?? 0),
      0,
    );

    if (data.kind === "redeem" && data.amountCents > balanceCents) {
      throw new Error(
        `Redemption exceeds available Reef Credit ($${(balanceCents / 100).toFixed(2)}).`,
      );
    }

    const signed = data.kind === "redeem" ? -data.amountCents : data.amountCents;
    const { error } = await db.from("loyalty_ledger").insert({
      customer_id: data.customerId,
      kind: data.kind,
      amount_cents: signed,
      channel: data.channel ?? null,
      reason: data.reason?.trim() || null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);

    // First manual entry marks the explicit "joined the club" moment.
    await db
      .from("customers")
      .update({ reef_club_enrolled_at: new Date().toISOString() })
      .eq("id", data.customerId)
      .is("reef_club_enrolled_at", null);

    return { ok: true, balanceCents: balanceCents + signed };
  });
