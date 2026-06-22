import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireFloorStaff } from "@/lib/auth-guards";

// Trade-in intake (wizard 11): a customer brings in fish/coral, gets store credit,
// and the stock lands as draft inventory pending admin review/pricing. Floor staff
// can't write inventory_items / customers directly (editor-only RLS), so both calls
// go through Lovable's SECURITY DEFINER RPCs. Casts to `any` — the RPCs aren't in
// the generated types yet (same pattern as record_inventory_loss / store credit).

const ITEM_TYPES = [
  "fish",
  "coral",
  "invert",
  "dry_good",
  "live_rock",
  "equipment",
  "other",
] as const;

// ---------- customer lookup for the picker (floor staff+) ----------
// Narrow read: returns only what the picker needs (no spend, no notes).
export const searchTradeInCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().max(200).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireFloorStaff(context.supabase, context.userId);
    const db = context.supabase as any;
    const { data: rows, error } = await db.rpc("search_customers_for_staff", {
      _q: data.q?.trim() || null,
    });
    if (error) throw new Error(error.message);
    const name = (c: any) =>
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      c.email ||
      c.phone ||
      "Unnamed customer";
    return {
      rows: (rows ?? []).map((c: any) => ({
        id: c.id as string,
        name: name(c),
        email: (c.email as string | null) ?? null,
        phone: (c.phone as string | null) ?? null,
      })),
    };
  });

// ---------- record the trade-in (floor staff+) ----------
// Atomic in the RPC: resolve/create customer → N draft inventory rows → grant
// store credit → activity logs. Either customerId or newCustomer must be present.
const lineSchema = z.object({
  name: z.string().trim().min(1).max(200),
  itemType: z.enum(ITEM_TYPES),
  scientificName: z.string().trim().max(200).optional(),
  qty: z.number().int().positive().max(10000),
  conditionNote: z.string().trim().max(500).optional(),
  creditCents: z.number().int().min(0).max(1_000_000_00),
});

export const recordTradeIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        customerId: z.string().uuid().optional(),
        newCustomer: z
          .object({
            firstName: z.string().trim().max(120).optional(),
            lastName: z.string().trim().max(120).optional(),
            email: z.string().trim().max(200).optional(),
            phone: z.string().trim().max(60).optional(),
          })
          .optional(),
        locationId: z.string().uuid().optional(),
        lines: z.array(lineSchema).min(1).max(100),
        note: z.string().trim().max(1000).optional(),
      })
      .refine(
        (v) =>
          !!v.customerId ||
          !!(
            v.newCustomer &&
            (v.newCustomer.firstName ||
              v.newCustomer.lastName ||
              v.newCustomer.email ||
              v.newCustomer.phone)
          ),
        { message: "Pick a customer or enter a new one" },
      )
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFloorStaff(context.supabase, context.userId);
    const db = context.supabase as any;

    const nc = data.newCustomer;
    const newCustomerPayload =
      !data.customerId && nc
        ? {
            first_name: nc.firstName || null,
            last_name: nc.lastName || null,
            email: nc.email || null,
            phone: nc.phone || null,
          }
        : null;

    const { data: res, error } = await db.rpc("record_trade_in", {
      _customer_id: data.customerId ?? null,
      _new_customer: newCustomerPayload,
      _location_id: data.locationId ?? null,
      _lines: data.lines.map((l) => ({
        name: l.name,
        item_type: l.itemType,
        scientific_name: l.scientificName || null,
        qty: l.qty,
        condition: l.conditionNote || null,
        credit_cents: l.creditCents,
      })),
      _note: data.note?.trim() || null,
    });
    if (error) throw new Error(error.message);

    return {
      customerId: (res?.customer_id as string) ?? null,
      itemIds: (res?.item_ids as string[]) ?? [],
      creditCents: Number(res?.credit_cents ?? 0),
      balanceCents: Number(res?.balance_cents ?? 0),
    };
  });
