import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin, requireFloorStaff } from "@/lib/auth-guards";

// Store credit = real money we owe a customer (trade-ins, returns, refunds) —
// a separate ledger from loyalty/Reef Credit. All mutations go through the
// SECURITY DEFINER RPCs Lovable shipped (grant/redeem/adjust); direct table
// writes are blocked by RLS. Balance is the ledger sum from store_credit_summary.
// Casts to `any` because these RPCs/tables aren't in the generated types yet.

const SOURCES = ["trade_in", "return", "refund", "manual", "goodwill"] as const;

// ---------- balance + recent activity (floor staff+) ----------
export const getStoreCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ customerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireFloorStaff(context.supabase, context.userId);
    const db = context.supabase as any;

    // Balance from the DB-side aggregate (no JS sum, no row cap).
    const { data: summaryRows } = await db.rpc("store_credit_summary", {
      _customer_id: data.customerId,
    });
    const summary = Array.isArray(summaryRows) ? summaryRows[0] : summaryRows;
    const balanceCents = Number(summary?.balance_cents ?? 0);

    // Recent activity (display only — never used for the balance).
    const { data: ledgerRows } = await db
      .from("store_credit_ledger")
      .select("id, kind, amount_cents, source, reason, created_at")
      .eq("customer_id", data.customerId)
      .order("created_at", { ascending: false })
      .limit(200);
    const ledger = (ledgerRows ?? []).map((r: any) => ({
      id: r.id,
      kind: r.kind as string,
      amountCents: Number(r.amount_cents ?? 0),
      source: r.source as string | null,
      reason: r.reason as string | null,
      createdAt: r.created_at as string,
    }));

    return { balanceCents, ledger };
  });

// ---------- grant credit (floor staff+) ----------
// Trade-ins / returns / refunds / goodwill all add credit here. Positive only;
// the RPC validates source + re-checks the role server-side.
export const grantStoreCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        customerId: z.string().uuid(),
        amountCents: z.number().int().positive().max(1_000_000_00),
        source: z.enum(SOURCES),
        reason: z.string().max(500).optional(),
        relatedRef: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFloorStaff(context.supabase, context.userId);
    const db = context.supabase as any;
    const { error } = await db.rpc("grant_store_credit", {
      _customer_id: data.customerId,
      _amount_cents: data.amountCents,
      _source: data.source,
      _reason: data.reason?.trim() || null,
      _related_ref: data.relatedRef ?? null,
    });
    if (error) throw new Error(error.message);
    return fetchBalance(db, data.customerId);
  });

// ---------- redeem credit (floor staff+) ----------
// Atomic in the RPC: row-locks the customer, re-checks balance, rejects overdraw.
export const redeemStoreCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        customerId: z.string().uuid(),
        amountCents: z.number().int().positive().max(1_000_000_00),
        reason: z.string().max(500).optional(),
        relatedRef: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFloorStaff(context.supabase, context.userId);
    const db = context.supabase as any;
    const { error } = await db.rpc("redeem_store_credit", {
      _customer_id: data.customerId,
      _amount_cents: data.amountCents,
      _reason: data.reason?.trim() || null,
      _related_ref: data.relatedRef ?? null,
    });
    if (error) throw new Error(error.message);
    return fetchBalance(db, data.customerId);
  });

// ---------- adjust / write-off (admin/dev only) ----------
// Signed amount: positive credits, negative debits (overdraw-checked in the RPC).
// Reason is required — every hand-correction is auditable.
export const adjustStoreCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        customerId: z.string().uuid(),
        amountCents: z
          .number()
          .int()
          .refine((n) => n !== 0, "Amount cannot be zero")
          .refine((n) => Math.abs(n) <= 1_000_000_00, "Amount too large"),
        reason: z.string().trim().min(1, "Reason is required").max(500),
        relatedRef: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const db = context.supabase as any;
    const { error } = await db.rpc("adjust_store_credit", {
      _customer_id: data.customerId,
      _amount_cents: data.amountCents,
      _reason: data.reason.trim(),
      _related_ref: data.relatedRef ?? null,
    });
    if (error) throw new Error(error.message);
    return fetchBalance(db, data.customerId);
  });

async function fetchBalance(db: any, customerId: string) {
  const { data: summaryRows } = await db.rpc("store_credit_summary", {
    _customer_id: customerId,
  });
  const summary = Array.isArray(summaryRows) ? summaryRows[0] : summaryRows;
  return { ok: true, balanceCents: Number(summary?.balance_cents ?? 0) };
}
