// Reef Club loyalty — pure helpers (tiers, earn math, passport badges).
// No DB calls: safe to import on both the server (earn-on-sync) and the
// client (customer profile card). DB access lives in loyalty.server.ts;
// server fns in loyalty.functions.ts.

import { classifyCoralType, coralTypeLabel } from "@/lib/coral-type";

export type LoyaltyTier = {
  name: string;
  min_annual_cents: number; // rolling-12-month spend to reach this tier
  earn_multiplier: number; // advertised earn rate vs base (display/perk for v1)
  perks: string[];
};

// Baseline earn: 5% of qualifying spend → Reef Credit (owner-locked, 2026-06-14).
export const DEFAULT_EARN_PERCENT = 5;

// Three reef-themed starter tiers. Thresholds/perks are placeholders the owner
// tunes in Settings → Reef Club (loyalty_config.tiers). The research thesis is
// "compete on status & access, not discounts" — so the higher tiers lead with
// live-sale access/priority, not bigger percentages.
export const DEFAULT_TIERS: LoyaltyTier[] = [
  {
    name: "Tide Pool",
    min_annual_cents: 0,
    earn_multiplier: 1,
    perks: ["Earn Reef Credit on every purchase", "Birthday Reef Credit"],
  },
  {
    name: "Reef Builder",
    min_annual_cents: 100_000, // $1,000 / rolling year
    earn_multiplier: 1.25,
    perks: ["Early access to live-sale drops", "Member-only frag swaps"],
  },
  {
    name: "Apex Reefer",
    min_annual_cents: 300_000, // $3,000 / rolling year
    earn_multiplier: 1.5,
    perks: ["VIP live-sale priority bidding", "Priority Arrive-Alive replacements"],
  },
];

// Accept whatever is stored in loyalty_config.tiers (jsonb) and coerce to a
// clean, ascending-by-threshold list. Falls back to the defaults when empty or
// malformed so the UI/earn path always has something sane.
export function normalizeTiers(raw: unknown): LoyaltyTier[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_TIERS;
  const cleaned = raw
    .map((t: any) => ({
      name: String(t?.name ?? "").trim(),
      min_annual_cents: Math.max(0, Math.round(Number(t?.min_annual_cents ?? 0)) || 0),
      earn_multiplier: Number(t?.earn_multiplier) > 0 ? Number(t.earn_multiplier) : 1,
      perks: Array.isArray(t?.perks) ? t.perks.map((p: any) => String(p)).filter(Boolean) : [],
    }))
    .filter((t) => t.name.length > 0)
    .sort((a, b) => a.min_annual_cents - b.min_annual_cents);
  return cleaned.length ? cleaned : DEFAULT_TIERS;
}

// Highest tier whose threshold the member has reached (tiers sorted ascending).
export function deriveTier(annualSpendCents: number, tiers: LoyaltyTier[]): LoyaltyTier {
  const sorted = [...tiers].sort((a, b) => a.min_annual_cents - b.min_annual_cents);
  let current = sorted[0] ?? DEFAULT_TIERS[0];
  for (const t of sorted) if (annualSpendCents >= t.min_annual_cents) current = t;
  return current;
}

// The next tier up (for a progress bar), or null if already at the top.
export function nextTier(annualSpendCents: number, tiers: LoyaltyTier[]): LoyaltyTier | null {
  const sorted = [...tiers].sort((a, b) => a.min_annual_cents - b.min_annual_cents);
  return sorted.find((t) => t.min_annual_cents > annualSpendCents) ?? null;
}

// Base Reef Credit earned on a sale total, in cents. Multiplier defaults to 1
// (v1 earns at the base rate; tier multiplier is advertised as a perk).
export function computeEarnCents(totalCents: number, earnPercent: number, multiplier = 1): number {
  if (!totalCents || totalCents <= 0 || earnPercent <= 0) return 0;
  return Math.round(((totalCents * earnPercent) / 100) * multiplier);
}

// Reef Passport: distinct coral types a member has bought, derived from sale
// item names (no storage). Reuses the existing coral-type classifier.
export function passportBadges(
  labels: (string | null | undefined)[],
): Array<{ slug: string; label: string }> {
  const slugs = new Set<string>();
  for (const l of labels) {
    const s = classifyCoralType(l);
    if (s) slugs.add(s);
  }
  return [...slugs].map((slug) => ({ slug, label: coralTypeLabel(slug) }));
}
