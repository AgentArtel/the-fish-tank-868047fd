import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- guards (mirrors ops.functions.ts) ----------
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

// ---------- list ----------
export const listScrapeSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireEditor(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("vendor_scrape_sources")
      .select(
        "id, name, kind, source_url, cadence, is_active, last_scraped_at, last_scrape_status, last_scrape_error, last_item_count, vendors:vendor_id(id, name, slug)",
      )
      .order("name");
    if (error) throw new Error(error.message);

    // counts per source
    const ids = (data ?? []).map((s: any) => s.id);
    const counts: Record<string, { new: number; available: number; imported: number }> = {};
    if (ids.length) {
      const { data: rows } = await context.supabase
        .from("vendor_scrape_items")
        .select("source_id, status, available_at_source")
        .in("source_id", ids);
      for (const r of rows ?? []) {
        const c = (counts[r.source_id] ||= { new: 0, available: 0, imported: 0 });
        if (r.status === "new") c.new++;
        if (r.status === "imported") c.imported++;
        if (r.available_at_source) c.available++;
      }
    }
    return { sources: data ?? [], counts };
  });

// ---------- get one source + items ----------
export const getScrapeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sourceId: z.string().uuid(),
        statusFilter: z.enum(["all", "new", "imported", "ignored", "unavailable"]).default("new"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const { data: source, error } = await context.supabase
      .from("vendor_scrape_sources")
      .select("*, vendors:vendor_id(id, name, slug, website)")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!source) throw new Error("Source not found");

    let q = context.supabase
      .from("vendor_scrape_items")
      .select(
        "id, external_id, external_handle, title, product_url, wholesale_cost, photo_source_url, photo_path, status, available_at_source, first_seen_at, last_seen_at, last_available_at, imported_at, imported_vendor_line_item_id, raw_payload",
      )
      .eq("source_id", data.sourceId)
      .order("last_seen_at", { ascending: false })
      .limit(500);
    if (data.statusFilter !== "all") q = q.eq("status", data.statusFilter);
    const { data: items, error: ie } = await q;
    if (ie) throw new Error(ie.message);

    return { source, items: items ?? [] };
  });

// ---------- refresh / scrape a source ----------
type ShopifyProduct = {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  tags: string[];
  body_html: string;
  variants: Array<{
    sku: string | null;
    price: string | null;
    available: boolean;
    title: string;
  }>;
  images: Array<{ src: string }>;
};

function deriveExternalId(p: ShopifyProduct): string {
  // Prefer variant SKU (stable), fall back to product handle
  const sku = p.variants?.[0]?.sku?.trim();
  return sku && sku.length > 0 ? sku : p.handle;
}

function deriveProductUrl(sourceUrl: string, handle: string): string {
  try {
    const u = new URL(sourceUrl);
    return `${u.protocol}//${u.host}/products/${handle}`;
  } catch {
    return "";
  }
}

async function downloadImage(supabaseAdmin: any, opts: { url: string; bucketPath: string }) {
  const res = await fetch(opts.url);
  if (!res.ok) throw new Error(`Image fetch ${res.status} for ${opts.url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const { error } = await supabaseAdmin.storage
    .from("inventory-media")
    .upload(opts.bucketPath, buf, { contentType, upsert: true });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return opts.bucketPath;
}

export const refreshScrapeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sourceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: source, error } = await context.supabase
      .from("vendor_scrape_sources")
      .select("id, kind, source_url, vendors:vendor_id(slug)")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!source) throw new Error("Source not found");
    if (source.kind !== "shopify_public") {
      throw new Error(`Phase 1 only supports shopify_public sources (got ${source.kind})`);
    }
    const vendorSlug = (source as any).vendors?.slug ?? "vendor";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Paginate Shopify products.json
    const all: ShopifyProduct[] = [];
    let page = 1;
    const baseUrl = source.source_url;
    const sep = baseUrl.includes("?") ? "&" : "?";
    while (page < 20) {
      const url = `${baseUrl}${sep}limit=250&page=${page}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        await context.supabase
          .from("vendor_scrape_sources")
          .update({
            last_scraped_at: new Date().toISOString(),
            last_scrape_status: "error",
            last_scrape_error: `HTTP ${res.status} at page ${page}`,
          })
          .eq("id", data.sourceId);
        throw new Error(`Scrape failed: HTTP ${res.status} at page ${page}`);
      }
      const json: any = await res.json();
      const products: ShopifyProduct[] = json.products ?? [];
      all.push(...products);
      if (products.length < 250) break;
      page++;
    }

    const now = new Date().toISOString();
    let added = 0;
    let updated = 0;
    let imagesDownloaded = 0;
    const seenExternalIds: string[] = [];

    for (const p of all) {
      const external_id = deriveExternalId(p);
      seenExternalIds.push(external_id);
      const variant = p.variants?.[0];
      const wholesale = variant?.price ? Number(variant.price) : null;
      const imgUrl = p.images?.[0]?.src ?? null;

      // Check existing row
      const { data: existing } = await context.supabase
        .from("vendor_scrape_items")
        .select("id, photo_path, photo_source_url")
        .eq("source_id", data.sourceId)
        .eq("external_id", external_id)
        .maybeSingle();

      let photo_path: string | null = existing?.photo_path ?? null;
      // (Re)download photo if missing or url changed
      if (imgUrl && (!photo_path || existing?.photo_source_url !== imgUrl)) {
        try {
          const ext = (imgUrl.split("?")[0].split(".").pop() || "jpg").toLowerCase().slice(0, 5);
          const safeId = external_id.replace(/[^A-Za-z0-9_-]+/g, "_");
          photo_path = await downloadImage(supabaseAdmin, {
            url: imgUrl,
            bucketPath: `scraped/${vendorSlug}/${safeId}.${ext}`,
          });
          imagesDownloaded++;
        } catch (e: any) {
          // non-fatal — keep going
          console.error("photo download failed", external_id, e?.message);
        }
      }

      const row = {
        source_id: data.sourceId,
        external_id,
        external_handle: p.handle,
        title: p.title,
        product_url: deriveProductUrl(source.source_url, p.handle),
        wholesale_cost: wholesale,
        photo_source_url: imgUrl,
        photo_path,
        raw_payload: {
          shopify_id: p.id,
          product_type: p.product_type,
          tags: p.tags,
          vendor: p.vendor,
          body_html: p.body_html,
          variant_title: variant?.title,
          variant_sku: variant?.sku,
        },
        available_at_source: !!variant?.available,
        last_seen_at: now,
        last_available_at: variant?.available ? now : (existing as any)?.last_available_at ?? null,
      };

      if (existing) {
        await context.supabase.from("vendor_scrape_items").update(row).eq("id", existing.id);
        updated++;
      } else {
        await context.supabase
          .from("vendor_scrape_items")
          .insert({ ...row, status: "new", first_seen_at: now });
        added++;
      }
    }

    // Items present last scrape but NOT in this scrape → mark unavailable at source
    if (seenExternalIds.length > 0) {
      await context.supabase
        .from("vendor_scrape_items")
        .update({ available_at_source: false })
        .eq("source_id", data.sourceId)
        .not("external_id", "in", `(${seenExternalIds.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(",")})`);
    }

    await context.supabase
      .from("vendor_scrape_sources")
      .update({
        last_scraped_at: now,
        last_scrape_status: "ok",
        last_scrape_error: null,
        last_item_count: all.length,
      })
      .eq("id", data.sourceId);

    return { fetched: all.length, added, updated, imagesDownloaded };
  });

// ---------- import selected items into a draft vendor batch ----------
type ItemType = "coral" | "fish" | "invert" | "live_rock" | "dry_good" | "equipment" | "other";
function guessItemType(p: { product_type?: string; tags?: string[]; title?: string }): ItemType {
  const hay = `${p.product_type ?? ""} ${(p.tags ?? []).join(" ")} ${p.title ?? ""}`.toLowerCase();
  if (/(fish|wrasse|tang|angel|clown|goby|blenny)/.test(hay)) return "fish";
  if (/(shrimp|crab|snail|urchin|starfish|cuc|nass|hermit|invert)/.test(hay)) return "invert";
  if (/(rock)/.test(hay)) return "live_rock";
  // Default — Furnace is overwhelmingly corals
  return "coral";
}

export const importScrapeItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sourceId: z.string().uuid(),
        itemIds: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);

    // Load source + items
    const { data: source } = await context.supabase
      .from("vendor_scrape_sources")
      .select("id, vendor_id, source_url, vendors:vendor_id(id, name, slug)")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (!source) throw new Error("Source not found");

    const { data: items, error: ie } = await context.supabase
      .from("vendor_scrape_items")
      .select("*")
      .eq("source_id", data.sourceId)
      .in("id", data.itemIds);
    if (ie) throw new Error(ie.message);
    if (!items?.length) throw new Error("No items selected");

    // Create draft batch
    const today = new Date().toISOString().slice(0, 10);
    const vendorName = (source as any).vendors?.name ?? "Vendor";
    const { data: batch, error: be } = await context.supabase
      .from("vendor_batches")
      .insert({
        vendor_id: source.vendor_id,
        source_document_type: "scrape",
        intake_status: "review",
        extraction_status: "ai_done",
        notes: `Scraped from ${source.source_url} on ${today}. ${items.length} item(s) selected — ${vendorName}.`,
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();
    if (be) throw new Error(be.message);
    if (!batch) throw new Error("Failed to create batch");

    // Insert lines
    const rowsToInsert = items.map((it: any, idx: number) => ({
      vendor_batch_id: batch.id,
      vendor_id: source.vendor_id,
      kind: "sellable" as const,
      vendor_item_id: it.external_id,
      line_number: idx + 1,
      quantity: 1,
      raw_description: it.title,
      clean_item_name: it.title,
      item_type: guessItemType(it.raw_payload ?? {}),
      wholesale_cost: it.wholesale_cost,
      suggested_retail_price: suggestRetail(it.wholesale_cost),
      review_status: "pending" as const,
      pricing_status: "not_priced" as const,
      attrs: {
        scrape_source_id: data.sourceId,
        scrape_item_id: it.id,
        product_url: it.product_url,
        photo_path: it.photo_path,
        photo_source_url: it.photo_source_url,
        vendor_tags: it.raw_payload?.tags ?? [],
      },
    }));
    const { data: insertedLines, error: ile } = await context.supabase
      .from("vendor_line_items")
      .insert(rowsToInsert)
      .select("id, vendor_item_id");
    if (ile) throw new Error(ile.message);

    // Map back to scrape_items: status=imported + FK
    const byExtId = new Map<string, string>();
    for (const l of insertedLines ?? []) {
      if (l.vendor_item_id) byExtId.set(l.vendor_item_id, l.id);
    }
    const nowIso = new Date().toISOString();
    for (const it of items as any[]) {
      await context.supabase
        .from("vendor_scrape_items")
        .update({
          status: "imported",
          imported_at: nowIso,
          imported_by: context.userId,
          imported_vendor_line_item_id: byExtId.get(it.external_id) ?? null,
          imported_vendor_batch_id: batch.id,
        })
        .eq("id", it.id);
    }

    return { batchId: batch.id, lineCount: insertedLines?.length ?? 0 };
  });

// ---------- ignore / unignore ----------
export const setScrapeItemStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        itemIds: z.array(z.string().uuid()).min(1).max(200),
        status: z.enum(["new", "ignored"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("vendor_scrape_items")
      .update({ status: data.status })
      .in("id", data.itemIds)
      .in("status", ["new", "ignored"]); // never overwrite 'imported'
    if (error) throw new Error(error.message);
    return { ok: true };
  });
