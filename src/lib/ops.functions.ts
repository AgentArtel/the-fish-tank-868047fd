import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => r.role === "admin");
}

export const getSignedVendorInvoiceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("vendor-invoices").createSignedUrl(data.path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const getSignedInventoryMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("inventory-media").createSignedUrl(data.path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const approveLinePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lineItemId: z.string().uuid(),
    approvedRetailPrice: z.number().nonnegative(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Only admins can approve pricing");
    const { error } = await supabase.from("vendor_line_items").update({
      approved_retail_price: data.approvedRetailPrice,
      pricing_status: "approved",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    }).eq("id", data.lineItemId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const convertLineItemsToInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lineItemIds: z.array(z.string().uuid()).min(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lines, error } = await supabase.from("vendor_line_items")
      .select("*").in("id", data.lineItemIds);
    if (error) throw new Error(error.message);

    const created: string[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const line of lines ?? []) {
      if (line.converted_inventory_item_id) { skipped.push({ id: line.id, reason: "already converted" }); continue; }
      if (line.kind !== "sellable") { skipped.push({ id: line.id, reason: "charge line" }); continue; }
      if (line.review_status !== "approved") { skipped.push({ id: line.id, reason: "not review-approved" }); continue; }
      if (line.pricing_status !== "approved") { skipped.push({ id: line.id, reason: "pricing not approved" }); continue; }

      const qty = Number(line.quantity ?? 0);
      const { data: inv, error: insErr } = await supabase.from("inventory_items").insert({
        source_vendor_line_item_id: line.id,
        source_vendor_batch_id: line.vendor_batch_id,
        vendor_id: line.vendor_id,
        item_name: line.clean_item_name || line.raw_description || "Untitled item",
        scientific_name: line.scientific_name,
        category: line.category,
        subcategory: line.subcategory,
        origin_region: line.origin_region,
        size: line.size,
        quantity_received: qty,
        quantity_available: qty,
        wholesale_cost: line.wholesale_cost,
        retail_price: line.approved_retail_price,
        pricing_status: "approved",
        availability_status: "incoming",
        live_sale_status: "not_eligible",
        needs_photo: true,
        created_by: userId,
      }).select("id").single();
      if (insErr) { skipped.push({ id: line.id, reason: insErr.message }); continue; }

      await supabase.from("vendor_line_items")
        .update({ converted_inventory_item_id: inv.id }).eq("id", line.id);
      await supabase.from("inventory_activity_logs").insert({
        inventory_item_id: inv.id, vendor_batch_id: line.vendor_batch_id,
        vendor_line_item_id: line.id, actor_id: userId,
        action: "converted_from_line",
        summary: `Converted from vendor line "${line.clean_item_name ?? line.raw_description ?? line.id}"`,
        detail: { line_id: line.id },
      });
      created.push(inv.id);
    }

    return { created, skipped };
  });

export const setInventoryAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(["incoming","quarantine","needs_id","available","on_hold","sold_out","not_for_sale","dead_lost"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("inventory_items")
      .update({ availability_status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setInventoryLiveSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(["not_eligible","eligible","staged","live","ended"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("inventory_items")
      .update({ live_sale_status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adjustInventoryQuantities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    quantity_received: z.number().nonnegative().optional(),
    quantity_available: z.number().nonnegative().optional(),
    quantity_on_hold: z.number().nonnegative().optional(),
    quantity_sold: z.number().nonnegative().optional(),
    quantity_lost: z.number().nonnegative().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("inventory_items").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
