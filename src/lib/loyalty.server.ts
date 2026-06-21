// Reef Club — server-only DB helpers shared by the sale-earn path
// (the apply_inventory_sale RPC) and the loyalty server fns.

import {
  DEFAULT_EARN_PERCENT,
  computeEarnCents,
  normalizeTiers,
  type LoyaltyTier,
} from "@/lib/loyalty";

export type LoyaltyConfig = {
  enabled: boolean;
  earnPercent: number;
  tiers: LoyaltyTier[];
};

// Read the single-row loyalty_config (id = true). Defaults applied when the row
// is missing/blank so callers never have to special-case it.
export async function loadLoyaltyConfig(db: any): Promise<LoyaltyConfig> {
  const { data } = await db
    .from("loyalty_config")
    .select("enabled, earn_percent, tiers")
    .eq("id", true)
    .maybeSingle();
  return {
    enabled: !!data?.enabled,
    earnPercent: Number(data?.earn_percent ?? DEFAULT_EARN_PERCENT),
    tiers: normalizeTiers(data?.tiers),
  };
}

// Write the `earn` ledger row for one linked member sale. Single source of truth
// for earning, used by both the sale path (the apply_inventory_sale RPC) and retroactive
// attribution (attachSaleToCustomer). Idempotent: the ledger's
// UNIQUE(sale_event_id, kind) means a repeat is swallowed, never double-credited.
// Returns the cents credited, or 0 when nothing was written (no value, or already
// earned for this sale).
export async function recordSaleEarn(
  db: any,
  opts: {
    customerId: string;
    saleEventId: string;
    totalCents: number | null | undefined;
    earnPercent: number;
    channel?: string;
    userId?: string | null;
  },
): Promise<number> {
  const earnCents = computeEarnCents(opts.totalCents ?? 0, opts.earnPercent);
  if (earnCents <= 0) return 0;
  const { error } = await db.from("loyalty_ledger").insert({
    customer_id: opts.customerId,
    kind: "earn",
    amount_cents: earnCents,
    channel: opts.channel ?? "in_store",
    reason: `${opts.earnPercent}% Reef Credit on purchase`,
    sale_event_id: opts.saleEventId,
    created_by: opts.userId ?? null,
  });
  if (error) {
    // Already earned for this sale (idempotent re-run) → no-op.
    if (/duplicate key|unique/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return earnCents;
}
