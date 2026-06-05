import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => r.role === "admin");
}

async function requireActive(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("is_active").eq("id", userId).maybeSingle();
  if (!data?.is_active) throw new Error("Forbidden: account pending approval");
}

async function requireEditor(supabase: any, userId: string) {
  await requireActive(supabase, userId);
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some((r: any) =>
    r.role === "admin" || r.role === "creator" || r.role === "reviewer"
  );
  if (!ok) throw new Error("Forbidden: editor role required");
}

export const getSignedVendorInvoiceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const { data: signed, error } = await context.supabase.storage
      .from("vendor-invoices").createSignedUrl(data.path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const getSignedInventoryMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
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
    await requireActive(supabase, userId);
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
    if (!(await isAdmin(supabase, userId))) throw new Error("Only admins can convert line items to inventory");
    await requireActive(supabase, userId);
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

      const receivedQty = line.received_quantity != null ? Number(line.received_quantity) : Number(line.quantity ?? 0);
      const lostQty = Number(line.lost_quantity ?? 0);
      const availableQty = Math.max(0, receivedQty - lostQty);
      const { data: inv, error: insErr } = await supabase.from("inventory_items").insert({
        source_vendor_line_item_id: line.id,
        source_vendor_batch_id: line.vendor_batch_id,
        vendor_id: line.vendor_id,
        item_name: line.clean_item_name || line.raw_description || "Untitled item",
        scientific_name: line.scientific_name,
        item_type: line.item_type,
        category: line.category,
        subcategory: line.subcategory,
        origin_region: line.origin_region,
        size: line.size,
        quantity_received: receivedQty,
        quantity_available: availableQty,
        quantity_lost: lostQty,
        wholesale_cost: line.wholesale_cost,
        retail_price: line.approved_retail_price,
        pricing_status: "approved",
        location_id: line.assigned_location_id,
        availability_status: "incoming",
        live_sale_status: "not_eligible",
        needs_photo: true,
        received_at: line.received_at,
        received_by: line.received_by,
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

export const receiveBatchLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    batchId: z.string().uuid(),
    lines: z.array(z.object({
      lineItemId: z.string().uuid(),
      received_quantity: z.number().nonnegative(),
      lost_quantity: z.number().nonnegative().default(0),
      loss_reason: z.string().max(64).nullable().optional(),
      assigned_location_id: z.string().uuid().nullable().optional(),
      item_type: z.enum(["fish","coral","invert","dry_good","live_rock","equipment","other"]).nullable().optional(),
      override_retail_price: z.number().nonnegative().nullable().optional(),
      note: z.string().max(500).nullable().optional(),
    })).min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireEditor(supabase, userId);
    const now = new Date().toISOString();
    let updated = 0;
    const errors: { lineItemId: string; error: string }[] = [];

    const ids = data.lines.map(l => l.lineItemId);
    const { data: existing } = await supabase.from("vendor_line_items")
      .select("id, received_quantity, lost_quantity, loss_reason, assigned_location_id, override_retail_price, item_type")
      .in("id", ids);
    const prevById = new Map<string, any>((existing ?? []).map((r: any) => [r.id, r]));

    const { data: photos } = await supabase.from("vendor_line_doa_photos")
      .select("vendor_line_item_id, kind").in("vendor_line_item_id", ids);
    const photoMap = new Map<string, Set<string>>();
    for (const p of (photos ?? []) as any[]) {
      const s = photoMap.get(p.vendor_line_item_id) ?? new Set<string>();
      s.add(p.kind);
      photoMap.set(p.vendor_line_item_id, s);
    }

    // Pre-flight: reject the entire save if any DOA line is missing required photos.
    // The vendor_line_items trigger guard_vli_doa_photos enforces this at the DB layer too,
    // but checking up-front lets us return a clear, structured error before any writes happen.
    const doaBlocked: { lineItemId: string; error: string }[] = [];
    for (const ln of data.lines) {
      const isDoa = ln.loss_reason === "dead_on_arrival" && Number(ln.lost_quantity ?? 0) > 0;
      if (!isDoa) continue;
      const have = photoMap.get(ln.lineItemId) ?? new Set();
      const missing = ["in_bag","on_lid"].filter(k => !have.has(k));
      if (missing.length > 0) {
        doaBlocked.push({
          lineItemId: ln.lineItemId,
          error: `DOA requires photos: missing ${missing.join(" and ")}`,
        });
      }
    }
    if (doaBlocked.length > 0) {
      throw new Error(
        `DOA enforcement: ${doaBlocked.length} line(s) cannot be saved without in-bag and on-lid photos. ` +
        `Upload both photos for each DOA line and retry.`
      );
    }

    for (const ln of data.lines) {
      const prev = prevById.get(ln.lineItemId) ?? {};

      const { error } = await supabase.from("vendor_line_items").update({
        received_quantity: ln.received_quantity,
        lost_quantity: ln.lost_quantity,
        loss_reason: ln.loss_reason ?? null,
        assigned_location_id: ln.assigned_location_id ?? null,
        item_type: ln.item_type ?? null,
        override_retail_price: ln.override_retail_price ?? null,
        received_at: now,
        received_by: userId,
      }).eq("id", ln.lineItemId).eq("vendor_batch_id", data.batchId);
      if (error) { errors.push({ lineItemId: ln.lineItemId, error: error.message }); continue; }

      await supabase.from("vendor_line_receive_logs").insert({
        vendor_line_item_id: ln.lineItemId,
        vendor_batch_id: data.batchId,
        actor_id: userId,
        received_quantity: ln.received_quantity,
        lost_quantity: ln.lost_quantity,
        loss_reason: ln.loss_reason ?? null,
        assigned_location_id: ln.assigned_location_id ?? null,
        override_retail_price: ln.override_retail_price ?? null,
        prev_received_quantity: prev.received_quantity ?? null,
        prev_lost_quantity: prev.lost_quantity ?? null,
        prev_loss_reason: prev.loss_reason ?? null,
        prev_assigned_location_id: prev.assigned_location_id ?? null,
        prev_override_retail_price: prev.override_retail_price ?? null,
        note: ln.note ?? null,
      });
      updated++;
    }
    return { updated, errors, doaBlocked: [] as { lineItemId: string; error: string }[] };
  });

export const uploadDoaPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lineItemId: z.string().uuid(),
    batchId: z.string().uuid(),
    kind: z.enum(["in_bag","on_lid"]),
    storage_path: z.string().min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireEditor(supabase, userId);
    const { error } = await supabase.from("vendor_line_doa_photos").upsert({
      vendor_line_item_id: data.lineItemId,
      vendor_batch_id: data.batchId,
      kind: data.kind,
      storage_path: data.storage_path,
      uploaded_by: userId,
    }, { onConflict: "vendor_line_item_id,kind" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });



export const setInventoryAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(["incoming","quarantine","needs_id","available","on_hold","sold_out","not_for_sale","dead_lost"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
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
    await requireEditor(context.supabase, context.userId);
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
    await requireEditor(context.supabase, context.userId);
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("inventory_items").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AI_CHARGE_TYPES = ["freight","packaging","heat_pack","box","fuel_surcharge","discount","credit","tax","other"] as const;

const aiLineSchema = z.object({
  line_number: z.number().int().nullable().optional(),
  vendor_item_id: z.string().nullable().optional(),
  clean_item_name: z.string().nullable().optional(),
  raw_description: z.string().nullable().optional(),
  scientific_name: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  subcategory: z.string().nullable().optional(),
  origin_region: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  vendor_sell_price: z.number().nullable().optional(),
  wholesale_cost: z.number().nullable().optional(),
  regular_price: z.number().nullable().optional(),
  line_total: z.number().nullable().optional(),
  has_discount: z.boolean().nullable().optional(),
  extraction_confidence: z.number().min(0).max(1).nullable().optional(),
  extraction_warning: z.string().nullable().optional(),
});

const aiChargeSchema = z.object({
  charge_type: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  quantity: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const aiExtractionSchema = z.object({
  vendor_name: z.string().nullable().optional(),
  header: z.object({
    invoice_number: z.string().nullable().optional(),
    order_number: z.string().nullable().optional(),
    po_number: z.string().nullable().optional(),
    sales_order_number: z.string().nullable().optional(),
    customer_number: z.string().nullable().optional(),
    carrier: z.string().nullable().optional(),
    tracking_number: z.string().nullable().optional(),
    awb_number: z.string().nullable().optional(),
    terms: z.string().nullable().optional(),
    invoice_date: z.string().nullable().optional(),
    ship_date: z.string().nullable().optional(),
    arrival_date: z.string().nullable().optional(),
    invoice_subtotal: z.number().nullable().optional(),
    invoice_discount: z.number().nullable().optional(),
    invoice_total: z.number().nullable().optional(),
    balance_due: z.number().nullable().optional(),
  }).partial().nullable().optional(),
  line_items: z.array(aiLineSchema).default([]),
  charges: z.array(aiChargeSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

const EXTRACTION_TOOL = {
  type: "function",
  function: {
    name: "submit_invoice_extraction",
    description: "Return structured invoice fields, sellable line items, and ancillary charges.",
    parameters: {
      type: "object",
      properties: {
        vendor_name: { type: "string", description: "Vendor / supplier name as printed on the invoice." },
        header: {
          type: "object",
          properties: {
            invoice_number: { type: "string" }, order_number: { type: "string" },
            po_number: { type: "string" }, sales_order_number: { type: "string" },
            customer_number: { type: "string" }, carrier: { type: "string" },
            tracking_number: { type: "string" }, awb_number: { type: "string" },
            terms: { type: "string" },
            invoice_date: { type: "string", description: "ISO date YYYY-MM-DD" },
            ship_date: { type: "string", description: "ISO date YYYY-MM-DD" },
            arrival_date: { type: "string", description: "ISO date YYYY-MM-DD" },
            invoice_subtotal: { type: "number" }, invoice_discount: { type: "number" },
            invoice_total: { type: "number" }, balance_due: { type: "number" },
          },
        },
        line_items: {
          type: "array",
          description: "Sellable item lines only. Exclude freight/packaging/heat pack/box/discounts/tax — those go in charges[].",
          items: {
            type: "object",
            properties: {
              line_number: { type: "integer" },
              vendor_item_id: { type: "string", description: "Vendor SKU or item code." },
              clean_item_name: { type: "string", description: "Concise readable item name." },
              raw_description: { type: "string", description: "Full original line text." },
              scientific_name: { type: "string" },
              category: { type: "string" }, subcategory: { type: "string" },
              origin_region: { type: "string" }, size: { type: "string" },
              quantity: { type: "number" },
              vendor_sell_price: { type: "number", description: "Per-unit price the vendor charged us (Sell Price / Price column = vendor cost to us, NOT retail)." },
              wholesale_cost: { type: "number", description: "Per-unit wholesale cost if shown separately; otherwise leave null and we will mirror vendor_sell_price." },
              regular_price: { type: "number" },
              line_total: { type: "number" },
              has_discount: { type: "boolean" },
              extraction_confidence: { type: "number", description: "0..1 confidence in this row." },
              extraction_warning: { type: "string", description: "Plain-English warning if anything looks off (missing qty, ambiguous size, etc.)." },
            },
            required: ["raw_description"],
          },
        },
        charges: {
          type: "array",
          description: "Ancillary charges: freight, packaging, heat pack, box, fuel surcharge, discount, credit, tax, other.",
          items: {
            type: "object",
            properties: {
              charge_type: { type: "string", enum: [...AI_CHARGE_TYPES] },
              label: { type: "string", description: "Original label from invoice." },
              amount: { type: "number" },
              quantity: { type: "integer" },
              notes: { type: "string" },
            },
            required: ["amount"],
          },
        },
        warnings: { type: "array", items: { type: "string" } },
      },
      required: ["line_items", "charges"],
    },
  },
} as const;

const SYSTEM_PROMPT = `You extract structured invoice data from PDFs for an aquatic livestock importer.

CRITICAL RULES:
1. Sellable items go in line_items. Freight, packaging, heat packs, boxes, fuel surcharges, discounts, credits, tax, and any non-product charge go in charges[] — NEVER in line_items.
2. For vendors like Quality Marine and Sea Dwelling Creatures: the "Sell Price" / "Price" column is the per-unit price the VENDOR charged US (our wholesale cost). It is NOT retail. Put that number in vendor_sell_price. Leave wholesale_cost null unless a separate distinct wholesale-cost column exists.
3. Never invent retail pricing. Do not fill any retail/approved-price field.
4. Preserve the original raw line text in raw_description so staff can audit.
5. Set extraction_confidence honestly (0..1). Set extraction_warning when anything is ambiguous (unclear qty, missing price, smudged text, unknown size code, etc.).
6. Dates must be ISO YYYY-MM-DD. If a date is partial or unclear, omit it.
7. Numbers must be plain JSON numbers (no currency symbols, no thousands separators).
8. If the invoice has nothing for a field, omit it — do not return empty strings or zeros as placeholders.
9. Return ALL line items and ALL charges visible on the invoice. Do not summarize or truncate.`;

export const extractBatchWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    batchId: z.string().uuid(),
    confirmOverwrite: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await requireEditor(supabase, context.userId);
    const { batchId, confirmOverwrite } = data;

    // 1. Load batch
    const { data: batch, error: batchErr } = await supabase
      .from("vendor_batches").select("*").eq("id", batchId).maybeSingle();
    if (batchErr) throw new Error(batchErr.message);
    if (!batch) throw new Error("Batch not found");
    if (!batch.pdf_storage_path) throw new Error("This batch has no PDF uploaded. Upload an invoice PDF before running AI extraction.");

    // 2. Check existing rows
    const [{ data: existingLines }, { data: existingCharges }] = await Promise.all([
      supabase.from("vendor_line_items").select("id, extraction_confidence, converted_inventory_item_id").eq("vendor_batch_id", batchId),
      supabase.from("vendor_batch_charges").select("id, notes").eq("vendor_batch_id", batchId),
    ]);
    const hasExisting = (existingLines?.length ?? 0) > 0 || (existingCharges?.length ?? 0) > 0;
    if (hasExisting && !confirmOverwrite) {
      return { needsConfirm: true as const };
    }

    // 3. Mark in-progress
    await supabase.from("vendor_batches").update({ extraction_status: "ai_pending" }).eq("id", batchId);

    const failWith = async (msg: string) => {
      const stamped = `[${new Date().toISOString()}] AI extraction failed: ${msg}`;
      await supabase.from("vendor_batches").update({
        extraction_status: "failed",
        notes: batch.notes ? `${batch.notes}\n${stamped}` : stamped,
      }).eq("id", batchId);
      return { ok: false as const, error: msg };
    };

    try {
      // 4. Download PDF
      const { data: pdfBlob, error: dlErr } = await supabase.storage
        .from("vendor-invoices").download(batch.pdf_storage_path);
      if (dlErr || !pdfBlob) return await failWith(`Could not download PDF: ${dlErr?.message ?? "unknown"}`);
      const pdfBuf = new Uint8Array(await pdfBlob.arrayBuffer());
      if (pdfBuf.byteLength > 15 * 1024 * 1024) {
        return await failWith(`PDF is ${(pdfBuf.byteLength / 1024 / 1024).toFixed(1)} MB; max 15 MB for AI extraction.`);
      }
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < pdfBuf.length; i += chunk) {
        binary += String.fromCharCode(...pdfBuf.subarray(i, i + chunk));
      }
      const pdfB64 = btoa(binary);
      const dataUrl = `data:application/pdf;base64,${pdfB64}`;

      // 5. Call Lovable AI Gateway
      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) return await failWith("LOVABLE_API_KEY is not configured on the server.");

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract this vendor invoice. Call the submit_invoice_extraction tool." },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          tools: [EXTRACTION_TOOL],
          tool_choice: { type: "function", function: { name: "submit_invoice_extraction" } },
        }),
      });

      if (!aiResp.ok) {
        const errText = await aiResp.text().catch(() => "");
        if (aiResp.status === 429) return await failWith("AI rate limit exceeded. Wait a moment and try again.");
        if (aiResp.status === 402) return await failWith("AI credits exhausted. Top up Lovable AI in workspace settings.");
        return await failWith(`AI gateway returned ${aiResp.status}: ${errText.slice(0, 500)}`);
      }
      const aiJson: any = await aiResp.json();
      const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        return await failWith(`AI did not return a tool call. Raw: ${JSON.stringify(aiJson).slice(0, 500)}`);
      }
      let parsedArgs: any;
      try { parsedArgs = JSON.parse(toolCall.function.arguments); }
      catch (e: any) { return await failWith(`Tool arguments were not valid JSON: ${e.message}`); }

      const parsed = aiExtractionSchema.safeParse(parsedArgs);
      if (!parsed.success) {
        return await failWith(`AI output failed validation: ${parsed.error.issues.slice(0, 3).map(i => i.path.join(".") + " " + i.message).join("; ")}`);
      }
      const extraction = parsed.data;
      const warnings: string[] = [...(extraction.warnings ?? [])];

      // 6. Resolve vendor (no auto-create)
      let resolvedVendorId = batch.vendor_id;
      if (!batch.vendor_id && extraction.vendor_name) {
        const { data: matches } = await supabase.from("vendors")
          .select("id, name").ilike("name", extraction.vendor_name.trim());
        if (matches && matches.length === 1) resolvedVendorId = matches[0].id;
        else if (!matches || matches.length === 0) warnings.push(`Vendor "${extraction.vendor_name}" not found in vendors list — leave header vendor blank or create vendor manually.`);
        else warnings.push(`Multiple vendors match "${extraction.vendor_name}" — set vendor manually.`);
      }

      // 7. Re-extraction cleanup (only AI-origin rows, never converted)
      let removedLines = 0;
      let removedCharges = 0;
      if (confirmOverwrite) {
        const { data: aiLines } = await supabase.from("vendor_line_items")
          .select("id").eq("vendor_batch_id", batchId)
          .not("extraction_confidence", "is", null)
          .is("converted_inventory_item_id", null);
        const aiLineIds = (aiLines ?? []).map((r: any) => r.id);
        if (aiLineIds.length) {
          const { error: delLineErr } = await supabase.from("vendor_line_items").delete().in("id", aiLineIds);
          if (delLineErr) return await failWith(`Could not clean prior AI lines: ${delLineErr.message}`);
          removedLines = aiLineIds.length;
        }
        const { data: aiCharges } = await supabase.from("vendor_batch_charges")
          .select("id, notes").eq("vendor_batch_id", batchId).like("notes", "[ai-extracted]%");
        const aiChargeIds = (aiCharges ?? []).map((r: any) => r.id);
        if (aiChargeIds.length) {
          const { error: delChErr } = await supabase.from("vendor_batch_charges").delete().in("id", aiChargeIds);
          if (delChErr) return await failWith(`Could not clean prior AI charges: ${delChErr.message}`);
          removedCharges = aiChargeIds.length;
        }
      }

      // 8. Header patch — only fill empty fields
      const h = extraction.header ?? {};
      const headerPatch: Record<string, any> = {};
      const headerKeys = ["invoice_number","order_number","po_number","sales_order_number","customer_number","carrier","tracking_number","awb_number","terms","invoice_date","ship_date","arrival_date","invoice_subtotal","invoice_discount","invoice_total","balance_due"] as const;
      for (const k of headerKeys) {
        const cur = (batch as any)[k];
        const next = (h as any)[k];
        if ((cur === null || cur === undefined || cur === "") && next !== null && next !== undefined && next !== "") {
          headerPatch[k] = next;
        }
      }
      if (!batch.vendor_id && resolvedVendorId) headerPatch.vendor_id = resolvedVendorId;

      // 9. Insert line items (AI-origin → extraction_confidence set)
      const linesToInsert = (extraction.line_items ?? []).map((l) => {
        const conf = typeof l.extraction_confidence === "number" ? l.extraction_confidence : 0.5;
        const vsp = l.vendor_sell_price ?? null;
        const wholesale = l.wholesale_cost ?? vsp;
        const review: "pending" | "needs_info" = l.extraction_warning && l.extraction_warning.trim() ? "needs_info" : "pending";
        return {
          vendor_batch_id: batchId,
          vendor_id: resolvedVendorId,
          kind: "sellable" as const,
          line_number: l.line_number ?? null,
          vendor_item_id: l.vendor_item_id ?? null,
          clean_item_name: l.clean_item_name ?? null,
          raw_description: l.raw_description ?? null,
          scientific_name: l.scientific_name ?? null,
          category: l.category ?? null,
          subcategory: l.subcategory ?? null,
          origin_region: l.origin_region ?? null,
          size: l.size ?? null,
          quantity: l.quantity ?? 1,
          vendor_sell_price: vsp,
          wholesale_cost: wholesale,
          regular_price: l.regular_price ?? null,
          line_total: l.line_total ?? null,
          has_discount: l.has_discount ?? false,
          extraction_confidence: conf,
          extraction_warning: l.extraction_warning ?? null,
          review_status: review,
          pricing_status: "not_priced" as const,
        };
      });

      let insertedLineIds: string[] = [];
      if (linesToInsert.length) {
        const { data: ins, error: insErr } = await supabase
          .from("vendor_line_items").insert(linesToInsert).select("id");
        if (insErr) return await failWith(`Could not insert line items: ${insErr.message}`);
        insertedLineIds = (ins ?? []).map((r: any) => r.id);
      }

      // 10. Insert charges
      const chargesToInsert = (extraction.charges ?? []).map((c) => {
        const ct = (AI_CHARGE_TYPES as readonly string[]).includes((c.charge_type ?? "") as string)
          ? (c.charge_type as typeof AI_CHARGE_TYPES[number])
          : "other";
        const baseNote = c.notes?.trim() ? c.notes.trim() : (c.charge_type && ct === "other" ? `original type: ${c.charge_type}` : "");
        return {
          vendor_batch_id: batchId,
          charge_type: ct,
          label: c.label ?? null,
          amount: c.amount ?? 0,
          quantity: c.quantity ?? 1,
          notes: baseNote ? `[ai-extracted] ${baseNote}` : "[ai-extracted]",
        };
      });

      let insertedChargeIds: string[] = [];
      if (chargesToInsert.length) {
        const { data: ins, error: insErr } = await supabase
          .from("vendor_batch_charges").insert(chargesToInsert).select("id");
        if (insErr) {
          if (insertedLineIds.length) await supabase.from("vendor_line_items").delete().in("id", insertedLineIds);
          return await failWith(`Could not insert charges: ${insErr.message}`);
        }
        insertedChargeIds = (ins ?? []).map((r: any) => r.id);
      }

      // 11. Finalize
      const finalPatch = {
        ...headerPatch,
        extraction_status: "ai_done" as const,
        intake_status: batch.intake_status === "draft" || batch.intake_status === "uploaded" ? "review" as const : batch.intake_status,
      };
      const { error: finalErr } = await supabase.from("vendor_batches").update(finalPatch).eq("id", batchId);
      if (finalErr) {
        if (insertedLineIds.length) await supabase.from("vendor_line_items").delete().in("id", insertedLineIds);
        if (insertedChargeIds.length) await supabase.from("vendor_batch_charges").delete().in("id", insertedChargeIds);
        return await failWith(`Could not update batch header: ${finalErr.message}`);
      }

      return {
        ok: true as const,
        lineCount: insertedLineIds.length,
        chargeCount: insertedChargeIds.length,
        removedLines,
        removedCharges,
        warnings,
        gatewayAcceptedPdf: true,
      };
    } catch (e: any) {
      return await failWith(e?.message ?? "Unknown error during AI extraction");
    }
  });

// ============================================================
// Quick Add (in-store restock / walk-around logging)
// ============================================================

export const getOrCreateQuickAddBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireEditor(supabase, userId);

    const { data: vendor, error: vErr } = await supabase
      .from("vendors").select("id").eq("slug", "quick-add").maybeSingle();
    if (vErr) throw new Error(vErr.message);
    if (!vendor) throw new Error("Quick Add vendor not found");

    // One batch per user per day
    const today = new Date(); today.setHours(0,0,0,0);
    const todayIso = today.toISOString();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);

    const { data: existing } = await supabase
      .from("vendor_batches")
      .select("id")
      .eq("vendor_id", vendor.id)
      .eq("created_by", userId)
      .gte("created_at", todayIso)
      .lt("created_at", tomorrow.toISOString())
      .maybeSingle();

    if (existing) return { batchId: existing.id, vendorId: vendor.id };

    const { data: created, error: cErr } = await supabase
      .from("vendor_batches").insert({
        vendor_id: vendor.id,
        source_document_type: "manual_entry",
        intake_status: "converted",
        extraction_status: "manual",
        invoice_date: today.toISOString().slice(0,10),
        notes: "Auto-created Quick Add batch (in-store restock).",
        is_quick_add: true,
        created_by: userId,

      }).select("id").single();
    if (cErr) throw new Error(cErr.message);
    return { batchId: created.id, vendorId: vendor.id };
  });

export const quickCreateVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    name: z.string().trim().min(1).max(200),
    contact_name: z.string().trim().max(200).nullable().optional(),
    contact_email: z.string().trim().max(200).nullable().optional(),
    contact_phone: z.string().trim().max(50).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireEditor(supabase, userId);

    const { data: existing } = await supabase
      .from("vendors").select("id,name").ilike("name", data.name).maybeSingle();
    if (existing) return { id: existing.id, name: existing.name, deduped: true };

    const slugBase = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "vendor";
    let slug = slugBase;
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await supabase.from("vendors").select("id").eq("slug", slug).maybeSingle();
      if (!clash) break;
      slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const { data: created, error } = await supabase.from("vendors").insert({
      name: data.name,
      slug,
      is_active: true,
      contact_name: data.contact_name ?? null,
      contact_email: data.contact_email ?? null,
      contact_phone: data.contact_phone ?? null,
      notes: data.notes ?? null,
    }).select("id,name").single();
    if (error) throw new Error(error.message);
    return { id: created.id, name: created.name, deduped: false };
  });

export const quickAddInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    item_name: z.string().min(1).max(200),
    scientific_name: z.string().max(200).nullable().optional(),
    item_type: z.enum(["fish","coral","invert","dry_good","live_rock","equipment","other"]),
    quantity: z.number().int().positive().max(10000).default(1),
    retail_price: z.number().nonnegative().max(1000000),
    wholesale_cost: z.number().nonnegative().max(1000000).nullable().optional(),
    location_id: z.string().uuid().nullable().optional(),
    source_vendor_id: z.string().uuid().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    primary_photo_path: z.string().min(1).max(500),
    primary_photo_file_name: z.string().max(200).default("primary.jpg"),
    has_price_tag: z.boolean().default(true),
    tag_photo_path: z.string().max(500).nullable().optional(),
    set_available: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireEditor(supabase, userId);

    // Get/create today's quick-add batch
    const { data: vendor } = await supabase
      .from("vendors").select("id").eq("slug", "quick-add").maybeSingle();
    if (!vendor) throw new Error("Quick Add vendor not found");

    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
    let batchId: string;
    const { data: existing } = await supabase
      .from("vendor_batches").select("id")
      .eq("vendor_id", vendor.id).eq("created_by", userId)
      .gte("created_at", today.toISOString()).lt("created_at", tomorrow.toISOString())
      .maybeSingle();
    if (existing) batchId = existing.id;
    else {
      const { data: created, error: cErr } = await supabase
        .from("vendor_batches").insert({
          vendor_id: vendor.id,
          source_document_type: "manual_entry",
          intake_status: "converted",
          extraction_status: "manual",
          invoice_date: today.toISOString().slice(0,10),
          notes: "Auto-created Quick Add batch (in-store restock).",
          created_by: userId,
        }).select("id").single();
      if (cErr) throw new Error(cErr.message);
      batchId = created.id;
    }

    // Create inventory item (start as 'incoming', flip to available after photo registered)
    const nowIso = new Date().toISOString();
    const { data: inv, error: insErr } = await supabase.from("inventory_items").insert({
      source_vendor_batch_id: batchId,
      vendor_id: data.source_vendor_id ?? vendor.id,
      item_name: data.item_name,
      scientific_name: data.scientific_name ?? null,
      item_type: data.item_type,
      quantity_received: data.quantity,
      quantity_available: data.quantity,
      wholesale_cost: data.wholesale_cost ?? null,
      retail_price: data.retail_price,
      pricing_status: "approved",
      location_id: data.location_id ?? null,
      availability_status: "incoming",
      live_sale_status: "not_eligible",
      needs_photo: false,
      notes: data.notes ?? null,
      received_at: nowIso,
      received_by: userId,
      created_by: userId,
    }).select("id").single();
    if (insErr) throw new Error(insErr.message);

    // Register primary photo (required)
    const { error: mErr } = await supabase.from("inventory_media").insert({
      inventory_item_id: inv.id,
      storage_path: data.primary_photo_path,
      file_name: data.primary_photo_file_name,
      media_type: "image",
      tag: "internal",
      uploader_id: userId,
      has_price_tag: data.has_price_tag,
    });
    if (mErr) throw new Error(`Primary photo: ${mErr.message}`);

    if (data.tag_photo_path) {
      await supabase.from("inventory_media").insert({
        inventory_item_id: inv.id,
        storage_path: data.tag_photo_path,
        file_name: "tag.jpg",
        media_type: "image",
        tag: "internal",
        uploader_id: userId,
        has_price_tag: true,
        notes: "Price tag photo",
      });
    }

    // Flip to available now that the photo is in place (gate satisfied)
    if (data.set_available && data.location_id) {
      await supabase.from("inventory_items")
        .update({ availability_status: "available" }).eq("id", inv.id);
    }

    return { inventoryItemId: inv.id, batchId };
  });

// AI: parse a livestock/dry-good price tag photo → { name, scientific_name?, price?, type? }
export const parseTagPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    storage_path: z.string().min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireEditor(supabase, userId);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured (missing LOVABLE_API_KEY)");

    const { data: signed, error: sErr } = await supabase.storage
      .from("inventory-media").createSignedUrl(data.storage_path, 600);
    if (sErr) throw new Error(sErr.message);

    const imgResp = await fetch(signed.signedUrl);
    if (!imgResp.ok) throw new Error("Failed to load image for parsing");
    const buf = new Uint8Array(await imgResp.arrayBuffer());
    let bin = ""; for (let i=0;i<buf.length;i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const dataUrl = `data:image/jpeg;base64,${b64}`;

    const tool = {
      type: "function",
      function: {
        name: "submit_tag",
        description: "Return the parsed price tag fields.",
        parameters: {
          type: "object",
          properties: {
            item_name: { type: "string", description: "Common/trade name" },
            scientific_name: { type: "string" },
            item_type: { type: "string", enum: ["fish","coral","invert","dry_good","live_rock","equipment","other"] },
            retail_price: { type: "number" },
            has_price_tag: { type: "boolean", description: "True if a price label/tag is clearly visible." },
            raw_text: { type: "string", description: "All readable text from the label, verbatim." },
            confidence: { type: "string", enum: ["high","medium","low"] },
          },
          required: ["item_name"],
          additionalProperties: false,
        },
      },
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You parse aquarium store price tags / livestock bag labels. Extract trade/common name, scientific name if shown, item type (fish/coral/invert/dry_good/live_rock/equipment/other), retail price (USD number, no symbols), all raw readable text, and whether a price tag is clearly visible. If a field isn't visible, omit it." },
          { role: "user", content: [
            { type: "text", text: "Parse this label." },
            { type: "image_url", image_url: { url: dataUrl } },
          ]},
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "submit_tag" } },
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text().catch(()=> "");
      if (aiResp.status === 429) throw new Error("AI rate limit. Try again shortly.");
      if (aiResp.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace settings.");
      throw new Error(`AI error ${aiResp.status}: ${t.slice(0,200)}`);
    }
    const json = await aiResp.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("AI returned no structured output");
    const parsed = JSON.parse(call.function.arguments) as {
      item_name: string; scientific_name?: string; item_type?: string;
      retail_price?: number; has_price_tag?: boolean; raw_text?: string; confidence?: string;
    };

    // Cache OCR result on the media row if this path matches a registered media item
    await supabase.from("inventory_media")
      .update({
        ocr_text: parsed.raw_text ?? null,
        ocr_extracted_at: new Date().toISOString(),
        ...(parsed.has_price_tag !== undefined ? { has_price_tag: parsed.has_price_tag } : {}),
      })
      .eq("storage_path", data.storage_path);

    return parsed;
  });

// AI: parse a markdown / pasted list of items into a structured array
export const parseInventoryMarkdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    markdown: z.string().min(1).max(20000),
    default_type: z.enum(["fish","coral","invert","dry_good","live_rock","equipment","other"]).default("dry_good"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");

    const tool = {
      type: "function",
      function: {
        name: "submit_items",
        description: "Return parsed items.",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  item_name: { type: "string" },
                  scientific_name: { type: "string" },
                  item_type: { type: "string", enum: ["fish","coral","invert","dry_good","live_rock","equipment","other"] },
                  quantity: { type: "number" },
                  retail_price: { type: "number" },
                  wholesale_cost: { type: "number" },
                  notes: { type: "string" },
                },
                required: ["item_name"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `You convert pasted markdown/text lists of aquarium store items into structured rows. Default item_type='${data.default_type}'. Quantities default to 1 if missing. Retail price is USD number only.` },
          { role: "user", content: data.markdown },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "submit_items" } },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(()=> "");
      if (resp.status === 429) throw new Error("AI rate limit. Try again shortly.");
      if (resp.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`AI error ${resp.status}: ${t.slice(0,200)}`);
    }
    const j = await resp.json();
    const call = j?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error("AI returned no items");
    const parsed = JSON.parse(call.function.arguments);
    return parsed as { items: Array<{ item_name: string; scientific_name?: string; item_type?: string; quantity?: number; retail_price?: number; wholesale_cost?: number; notes?: string }> };
  });
