// Reef Club — server-only DB helpers shared by the earn-on-sync path
// (ops.functions.ts / clover.ingest.server.ts) and the loyalty server fns.

import { DEFAULT_EARN_PERCENT, normalizeTiers, type LoyaltyTier } from "@/lib/loyalty";

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
