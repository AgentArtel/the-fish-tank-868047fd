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
    // "unavailable" is an availability filter, not a workflow status — nothing
    // ever sets status='unavailable'; gone-at-vendor is tracked by the
    // available_at_source flag.
    if (data.statusFilter === "unavailable") q = q.eq("available_at_source", false);
    else if (data.statusFilter !== "all") q = q.eq("status", data.statusFilter);
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
    compare_at_price: string | null;
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

// Shopify storefronts are Cloudflare/Fastly-fronted and will 403 server egress
// that looks bot-like (no/blank User-Agent). Send a real browser UA + standard
// Accept headers, and retry transient blocks (403/429/5xx) a couple of times.
const SCRAPE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const SCRAPE_HEADERS = {
  "User-Agent": SCRAPE_UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let res: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    res = await fetch(url, { headers: SCRAPE_HEADERS });
    if (res.ok) return res;
    // Only retry transient / bot-block statuses; anything else, return as-is.
    if (![403, 429, 500, 502, 503, 504].includes(res.status)) return res;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  return res as Response;
}

async function downloadImage(supabaseAdmin: any, opts: { url: string; bucketPath: string }) {
  const res = await fetch(opts.url, { headers: { "User-Agent": SCRAPE_UA, Accept: "image/*,*/*" } });
  if (!res.ok) throw new Error(`Image fetch ${res.status} for ${opts.url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const { error } = await supabaseAdmin.storage
    .from("inventory-media")
    .upload(opts.bucketPath, buf, { contentType, upsert: true });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return opts.bucketPath;
}

// Compare two prices that may be null / numeric-as-string. Treats equal 2-dp
// values as unchanged so we don't append a spurious snapshot every refresh.
function priceEq(a: number | string | null | undefined, b: number | string | null | undefined) {
  const na = a == null || a === "" ? null : Number(a);
  const nb = b == null || b === "" ? null : Number(b);
  if (na == null && nb == null) return true;
  if (na == null || nb == null) return false;
  return na.toFixed(2) === nb.toFixed(2);
}

// Shopify reports compare_at_price as "0.00" (or null) when an item is NOT on
// sale; normalize those to null so on-sale = compare_at_price != null.
function parseCompareAt(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type ScrapeSummary = {
  fetched: number;
  added: number;
  updated: number;
  snapshots: number;
  gone: number;
  imagesDownloaded: number;
};

/**
 * Append-only scrape of one shopify_public source. Shared by the admin
 * "Refresh now" server fn (runs as the authenticated admin) and the scheduled
 * cron hook (runs as service_role).
 *
 * INVARIANT: history is never overwritten. Every price/availability/on-sale
 * change is appended to vendor_scrape_snapshots; vendor_scrape_items only holds
 * the latest current-state row for fast listing.
 */
export async function runScrapeForSource(
  db: any,
  source: { id: string; kind: string; source_url: string; vendors?: { slug?: string } | null },
): Promise<ScrapeSummary> {
  if (source.kind !== "shopify_public") {
    throw new Error(`Only shopify_public sources are supported (got ${source.kind})`);
  }
  const vendorSlug = source.vendors?.slug ?? "vendor";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Paginate Shopify products.json
  const all: ShopifyProduct[] = [];
  let page = 1;
  const baseUrl = source.source_url;
  const sep = baseUrl.includes("?") ? "&" : "?";
  while (page < 20) {
    const url = `${baseUrl}${sep}limit=250&page=${page}`;
    const res = await fetchWithRetry(url);
    if (!res.ok) {
      await db
        .from("vendor_scrape_sources")
        .update({
          last_scraped_at: new Date().toISOString(),
          last_scrape_status: "error",
          last_scrape_error: `HTTP ${res.status} at page ${page}`,
        })
        .eq("id", source.id);
      throw new Error(`Scrape failed: HTTP ${res.status} at page ${page}`);
    }
    const json: any = await res.json();
    const products: ShopifyProduct[] = json.products ?? [];
    all.push(...products);
    if (products.length < 250) break;
    page++;
  }

  const now = new Date().toISOString();

  // One read for the current state of every item at this source...
  const { data: existingRows } = await db
    .from("vendor_scrape_items")
    .select(
      "id, external_id, wholesale_cost, compare_at_price, available_at_source, last_available_at, photo_path, photo_source_url",
    )
    .eq("source_id", source.id);
  const existingByExt = new Map<string, any>(
    (existingRows ?? []).map((r: any) => [r.external_id, r]),
  );

  // ...and one read for which items already have a baseline snapshot, so we
  // seed exactly one baseline per pre-existing item on the first new-logic run.
  const { data: snapRows } = await db
    .from("vendor_scrape_snapshots")
    .select("scrape_item_id")
    .eq("source_id", source.id);
  const hasSnapshot = new Set<string>((snapRows ?? []).map((r: any) => r.scrape_item_id));

  let added = 0;
  let updated = 0;
  let imagesDownloaded = 0;
  const seen = new Set<string>();
  const snapshotRows: any[] = [];

  for (const p of all) {
    const external_id = deriveExternalId(p);
    seen.add(external_id);
    const variant = p.variants?.[0];
    const wholesale = variant?.price ? Number(variant.price) : null;
    const compareAt = parseCompareAt(variant?.compare_at_price);
    const available = !!variant?.available;
    const imgUrl = p.images?.[0]?.src ?? null;
    const existing = existingByExt.get(external_id);

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

    const raw_payload = {
      shopify_id: p.id,
      product_type: p.product_type,
      tags: p.tags,
      vendor: p.vendor,
      body_html: p.body_html,
      variant_title: variant?.title,
      variant_sku: variant?.sku,
      price: variant?.price ?? null,
      compare_at_price: variant?.compare_at_price ?? null,
      available,
    };

    const priceChanged = existing ? !priceEq(existing.wholesale_cost, wholesale) : true;
    const compareChanged = existing ? !priceEq(existing.compare_at_price, compareAt) : true;
    const availChanged = existing ? (existing.available_at_source ?? null) !== available : true;
    const needsBaseline = !!existing && !hasSnapshot.has(existing.id);
    const shouldSnapshot = !existing || needsBaseline || priceChanged || compareChanged || availChanged;

    const base = {
      external_handle: p.handle,
      title: p.title,
      product_url: deriveProductUrl(source.source_url, p.handle),
      wholesale_cost: wholesale,
      compare_at_price: compareAt,
      photo_source_url: imgUrl,
      photo_path,
      raw_payload,
      available_at_source: available,
      last_seen_at: now,
      last_available_at: available ? now : existing?.last_available_at ?? null,
    };

    let itemId: string;
    if (existing) {
      await db
        .from("vendor_scrape_items")
        .update({ ...base, ...(priceChanged ? { last_price_change_at: now } : {}) })
        .eq("id", existing.id);
      itemId = existing.id;
      updated++;
    } else {
      const { data: inserted } = await db
        .from("vendor_scrape_items")
        .insert({
          ...base,
          source_id: source.id,
          external_id,
          status: "new",
          first_seen_at: now,
          last_price_change_at: now,
        })
        .select("id")
        .maybeSingle();
      itemId = inserted?.id;
      added++;
    }

    if (shouldSnapshot && itemId) {
      snapshotRows.push({
        scrape_item_id: itemId,
        source_id: source.id,
        observed_at: now,
        wholesale_cost: wholesale,
        compare_at_price: compareAt,
        available,
        raw_json: raw_payload,
      });
    }
  }

  // Items present before but NOT in this scrape → gone at vendor. Flip the
  // current-state flag (by id, no fragile filter string) and, for those that
  // were still available, append an availability snapshot so "available→gone"
  // is captured in history.
  let gone = 0;
  const goneIds: string[] = [];
  for (const [ext, row] of existingByExt) {
    if (seen.has(ext)) continue;
    if (!row.available_at_source) continue; // already gone — nothing new to record
    goneIds.push(row.id);
    snapshotRows.push({
      scrape_item_id: row.id,
      source_id: source.id,
      observed_at: now,
      wholesale_cost: row.wholesale_cost ?? null,
      compare_at_price: row.compare_at_price ?? null,
      available: false,
      raw_json: { reason: "not_seen_at_source" },
    });
  }
  if (goneIds.length > 0) {
    await db
      .from("vendor_scrape_items")
      .update({ available_at_source: false })
      .in("id", goneIds);
    gone = goneIds.length;
  }

  if (snapshotRows.length > 0) {
    const { error: se } = await db.from("vendor_scrape_snapshots").insert(snapshotRows);
    if (se) throw new Error(`Snapshot insert failed: ${se.message}`);
  }

  await db
    .from("vendor_scrape_sources")
    .update({
      last_scraped_at: now,
      last_scrape_status: "ok",
      last_scrape_error: null,
      last_item_count: all.length,
    })
    .eq("id", source.id);

  return { fetched: all.length, added, updated, snapshots: snapshotRows.length, gone, imagesDownloaded };
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
    return await runScrapeForSource(context.supabase, source as any);
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

// ---------- update a source: cadence / pause — admin only ----------
export const updateScrapeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sourceId: z.string().uuid(),
        cadence: z.enum(["manual", "daily", "weekly", "friday_night"]).optional(),
        is_active: z.boolean().optional(),
      })
      .refine((v) => v.cadence !== undefined || v.is_active !== undefined, {
        message: "Nothing to update",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const patch: Record<string, any> = {};
    if (data.cadence !== undefined) patch.cadence = data.cadence;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    const { error } = await context.supabase
      .from("vendor_scrape_sources")
      .update(patch as any)
      .eq("id", data.sourceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
