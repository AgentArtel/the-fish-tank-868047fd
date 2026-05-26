import { Badge } from "@/components/ui/badge";

type Tone = "neutral" | "info" | "warn" | "success" | "danger" | "muted";

const TONE_CLASS: Record<Tone,string> = {
  neutral: "bg-slate-100 text-slate-700",
  info:    "bg-blue-100 text-blue-800",
  warn:    "bg-amber-100 text-amber-900",
  success: "bg-emerald-100 text-emerald-800",
  danger:  "bg-red-100 text-red-800",
  muted:   "bg-slate-200 text-slate-600",
};

export function OpsBadge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <Badge variant="secondary" className={`${TONE_CLASS[tone]} border-0 font-medium`}>{label}</Badge>;
}

// Tone mappers for common enums
export const availabilityTone = (s: string): Tone =>
  s === "available" ? "success" :
  s === "on_hold" ? "info" :
  s === "needs_id" || s === "quarantine" ? "warn" :
  s === "dead_lost" ? "danger" :
  s === "sold_out" || s === "not_for_sale" ? "muted" : "neutral";

export const pricingTone = (s: string): Tone =>
  s === "approved" ? "success" : s === "suggested" ? "info" : "warn";

export const reviewTone = (s: string): Tone =>
  s === "approved" ? "success" : s === "rejected" ? "danger" : s === "needs_info" ? "warn" : "neutral";

export const liveSaleTone = (s: string): Tone =>
  s === "live" ? "success" : s === "staged" ? "info" : s === "eligible" ? "neutral" : s === "ended" ? "muted" : "muted";

export const intakeTone = (s: string): Tone =>
  s === "converted" ? "success" : s === "approved" ? "info" : s === "review" ? "warn" : s === "archived" ? "muted" : "neutral";
