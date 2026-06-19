import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/ops";
import { classifyCoralType, CORAL_TYPES } from "@/lib/coral-type";
import { requireAdmin, requireEditor } from "@/lib/auth-guards";

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

    // counts per source — "new" excludes items that disappeared from the vendor
    // (those are auto-archived to the Sold view).
    const ids = (data ?? []).map((s: any) => s.id);
    const counts: Record<
      string,
      { new: number; available: number; imported: number; sold: number }
    > = {};
    if (ids.length) {
      const { data: rows } = await context.supabase
        .from("vendor_scrape_items")
        .select("source_id, status, available_at_source")
        .in("source_id", ids);
      for (const r of rows ?? []) {
        const c = (counts[r.source_id] ||= { new: 0, available: 0, imported: 0, sold: 0 });
        if (r.status === "new" && r.available_at_source) c.new++;
        if (r.status === "imported") c.imported++;
        if (r.available_at_source) c.available++;
        else c.sold++;
      }
    }
    return { sources: data ?? [], counts };
  });

// ---------- live progress (cheap poll while a refresh is in-flight) ----------
export const getScrapeProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sourceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const { count } = await context.supabase
      .from("vendor_scrape_items")
      .select("id", { count: "exact", head: true })
      .eq("source_id", data.sourceId);
    const { data: src } = await context.supabase
      .from("vendor_scrape_sources")
      .select("last_scraped_at, last_scrape_status, last_item_count")
      .eq("id", data.sourceId)
      .maybeSingle();
    return {
      itemCount: count ?? 0,
      lastScrapedAt: src?.last_scraped_at ?? null,
      lastScrapeStatus: src?.last_scrape_status ?? null,
      lastItemCount: src?.last_item_count ?? null,
    };
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

    // Image-capture completeness (for the data asset): how many items have a
    // vendor image and how many of those aren't yet downloaded to storage.
    const { count: imgTotal } = await context.supabase
      .from("vendor_scrape_items")
      .select("id", { count: "exact", head: true })
      .eq("source_id", data.sourceId)
      .not("photo_source_url", "is", null);
    const { count: imgMissing } = await context.supabase
      .from("vendor_scrape_items")
      .select("id", { count: "exact", head: true })
      .eq("source_id", data.sourceId)
      .not("photo_source_url", "is", null)
      .is("photo_path", null);

    return {
      source,
      items: items ?? [],
      photoStats: { total: imgTotal ?? 0, missing: imgMissing ?? 0 },
    };
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

// --- Firecrawl fallback transport (clean egress for bot-blocked storefronts) ---
const FIRECRAWL_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";

// Fetch a URL's raw body via Firecrawl. Throws if not configured or on error.
export async function fetchViaFirecrawl(url: string): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("Firecrawl not configured (FIRECRAWL_API_KEY missing)");
  const res = await fetch(FIRECRAWL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ url, formats: ["rawHtml"], onlyMainContent: false }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Firecrawl HTTP ${res.status}: ${t.slice(0, 180)}`);
  }
  const j: any = await res.json();
  const body = j?.data?.rawHtml ?? j?.data?.html ?? j?.data?.markdown ?? j?.data?.content ?? "";
  if (!body) throw new Error("Firecrawl returned empty content");
  return body;
}

// Recover the products JSON object from a (possibly HTML/markdown-wrapped) body.
function extractProductsJson(body: string): any {
  const t = body.trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        /* fall through to error below */
      }
    }
    throw new Error("Could not parse products JSON from Firecrawl response");
  }
}

// Fetch one products.json page via the chosen transport. On `direct`, a 403/429
// is surfaced as a `blocked` error so the caller can fall back to Firecrawl.
async function fetchProductsPage(url: string, transport: Transport): Promise<any> {
  if (transport === "firecrawl") return extractProductsJson(await fetchViaFirecrawl(url));
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    const err: any = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.blocked = res.status === 403 || res.status === 429;
    throw err;
  }
  return await res.json();
}

// Cloudflare Workers cap subrequests per invocation (~1000), and a full pass
// already spends most of that on per-item DB writes. So only download a bounded
// number of images per scrape run; the rest are captured on demand by
// backfillScrapeImages (items keep photo_path=null until then). Small weekly
// deltas get captured automatically; big initial loads drain via the back-fill.
const MAX_IMAGE_DOWNLOADS_PER_RUN = 80;

function imageBucketPath(vendorSlug: string, externalId: string, imgUrl: string): string {
  const ext = (imgUrl.split("?")[0].split(".").pop() || "jpg").toLowerCase().slice(0, 5);
  const safeId = externalId.replace(/[^A-Za-z0-9_-]+/g, "_");
  return `scraped/${vendorSlug}/${safeId}.${ext}`;
}

export async function downloadImage(supabaseAdmin: any, opts: { url: string; bucketPath: string }) {
  const res = await fetch(opts.url, {
    headers: { "User-Agent": SCRAPE_UA, Accept: "image/*,*/*" },
  });
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

type Transport = "direct" | "firecrawl";

type ScrapeSummary = {
  fetched: number;
  added: number;
  updated: number;
  snapshots: number;
  gone: number;
  imagesDownloaded: number;
  transport: Transport;
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
  source: {
    id: string;
    kind: string;
    source_url: string;
    prefer_firecrawl?: boolean | null;
    vendors?: { slug?: string } | null;
  },
  opts: { skipImages?: boolean } = {},
): Promise<ScrapeSummary> {
  if (source.kind !== "shopify_public") {
    throw new Error(`Only shopify_public sources are supported (got ${source.kind})`);
  }
  const vendorSlug = source.vendors?.slug ?? "vendor";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Paginate Shopify products.json. Free direct fetch first; if the storefront
  // bot-blocks our egress (403/429), transparently fall back to Firecrawl.
  const all: ShopifyProduct[] = [];
  let page = 1;
  // Known-blocked sources can be pinned to Firecrawl up front (prefer_firecrawl);
  // everything else starts direct and auto-falls back to Firecrawl on a block.
  let transport: Transport =
    source.prefer_firecrawl && process.env.FIRECRAWL_API_KEY ? "firecrawl" : "direct";
  const baseUrl = source.source_url;
  const sep = baseUrl.includes("?") ? "&" : "?";
  const markError = (msg: string) =>
    db
      .from("vendor_scrape_sources")
      .update({
        last_scraped_at: new Date().toISOString(),
        last_scrape_status: "error",
        last_scrape_error: msg,
      })
      .eq("id", source.id);
  while (page < 20) {
    const url = `${baseUrl}${sep}limit=250&page=${page}`;
    let json: any;
    try {
      json = await fetchProductsPage(url, transport);
    } catch (e: any) {
      // Auto-fallback: a blocked direct fetch (and a configured key) → Firecrawl.
      if (transport === "direct" && e?.blocked && process.env.FIRECRAWL_API_KEY) {
        transport = "firecrawl";
        try {
          json = await fetchProductsPage(url, transport);
        } catch (e2: any) {
          await markError(`Firecrawl fallback failed at page ${page}: ${e2?.message ?? e2}`);
          throw new Error(`Scrape failed (Firecrawl) at page ${page}: ${e2?.message ?? e2}`);
        }
      } else {
        const why = e?.status ? `HTTP ${e.status}` : (e?.message ?? String(e));
        await markError(
          `${why} at page ${page}${e?.blocked ? " (blocked; no Firecrawl key)" : ""}`,
        );
        throw new Error(`Scrape failed: ${why} at page ${page}`);
      }
    }
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
    // (Re)download photo if missing or url changed, up to the per-run cap.
    // Items skipped here keep photo_path=null and are picked up by the back-fill
    // (or a later run) — already-downloaded items are skipped before they spend
    // any of the cap, so capture resumes where it left off.
    if (
      !opts.skipImages &&
      imgUrl &&
      (!photo_path || existing?.photo_source_url !== imgUrl) &&
      imagesDownloaded < MAX_IMAGE_DOWNLOADS_PER_RUN
    ) {
      try {
        photo_path = await downloadImage(supabaseAdmin, {
          url: imgUrl,
          bucketPath: imageBucketPath(vendorSlug, external_id, imgUrl),
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
    const shouldSnapshot =
      !existing || needsBaseline || priceChanged || compareChanged || availChanged;

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
      last_available_at: available ? now : (existing?.last_available_at ?? null),
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
    await db.from("vendor_scrape_items").update({ available_at_source: false }).in("id", goneIds);
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

  return {
    fetched: all.length,
    added,
    updated,
    snapshots: snapshotRows.length,
    gone,
    imagesDownloaded,
    transport,
  };
}

export const refreshScrapeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ sourceId: z.string().uuid(), skipImages: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data: source, error } = await context.supabase
      .from("vendor_scrape_sources")
      .select("id, kind, source_url, prefer_firecrawl, vendors:vendor_id(slug)")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!source) throw new Error("Source not found");
    return await runScrapeForSource(context.supabase, source as any, {
      skipImages: !!data.skipImages,
    });
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

// ---------- back-fill un-captured images (data asset) — admin only ----------
// Downloads vendor images to storage for items that have a photo_source_url but
// no photo_path yet, in a bounded batch so a single Worker invocation stays
// under its subrequest limit. The UI calls this in a loop until remaining === 0.
export const backfillScrapeImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        sourceId: z.string().uuid(),
        limit: z.number().int().min(1).max(80).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);

    const { data: source } = await context.supabase
      .from("vendor_scrape_sources")
      .select("id, vendors:vendor_id(slug)")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (!source) throw new Error("Source not found");
    const vendorSlug = (source as any).vendors?.slug ?? "vendor";

    const { data: items, error: ie } = await context.supabase
      .from("vendor_scrape_items")
      .select("id, external_id, photo_source_url")
      .eq("source_id", data.sourceId)
      .not("photo_source_url", "is", null)
      .is("photo_path", null)
      .limit(data.limit);
    if (ie) throw new Error(ie.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let downloaded = 0;
    let failed = 0;
    for (const it of items ?? []) {
      try {
        const path = await downloadImage(supabaseAdmin, {
          url: it.photo_source_url,
          bucketPath: imageBucketPath(vendorSlug, it.external_id, it.photo_source_url),
        });
        await context.supabase
          .from("vendor_scrape_items")
          .update({ photo_path: path })
          .eq("id", it.id);
        downloaded++;
      } catch (e: any) {
        failed++;
        console.error("backfill image failed", it.external_id, e?.message);
      }
    }

    const { count: remaining } = await context.supabase
      .from("vendor_scrape_items")
      .select("id", { count: "exact", head: true })
      .eq("source_id", data.sourceId)
      .not("photo_source_url", "is", null)
      .is("photo_path", null);

    return { downloaded, failed, remaining: remaining ?? 0 };
  });

// ---------- create a new scrape source (+ vendor) — admin only ----------
export const createScrapeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        vendorName: z.string().trim().min(1).max(120),
        name: z.string().trim().min(1).max(120),
        sourceUrl: z.string().trim().url(),
        cadence: z.enum(["manual", "daily", "weekly", "friday_night"]).default("weekly"),
        preferFirecrawl: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabase } = context;

    // Find-or-create the vendor (dedupe by name, unique slug).
    let vendorId: string;
    const { data: existing } = await supabase
      .from("vendors")
      .select("id")
      .ilike("name", data.vendorName)
      .maybeSingle();
    if (existing) {
      vendorId = existing.id;
    } else {
      const base = (slugify(data.vendorName) || "vendor").slice(0, 60);
      let slug = base;
      for (let i = 0; i < 5; i++) {
        const { data: clash } = await supabase
          .from("vendors")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (!clash) break;
        slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      }
      const { data: v, error: ve } = await supabase
        .from("vendors")
        .insert({ name: data.vendorName, slug, is_active: true })
        .select("id")
        .single();
      if (ve) throw new Error(ve.message);
      vendorId = v.id;
    }

    const { data: src, error: se } = await supabase
      .from("vendor_scrape_sources")
      .insert({
        vendor_id: vendorId,
        name: data.name,
        kind: "shopify_public",
        source_url: data.sourceUrl,
        cadence: data.cadence,
        prefer_firecrawl: data.preferFirecrawl,
      })
      .select("id")
      .maybeSingle();
    if (se) {
      throw new Error(
        /duplicate|unique/i.test(se.message)
          ? "A source with this URL already exists for this vendor."
          : se.message,
      );
    }
    if (!src) throw new Error("Failed to create source");
    return { sourceId: src.id };
  });

// ---------- cross-vendor feed (signals over snapshots) ----------
type FeedType = "new" | "price_drop" | "on_sale" | "sold";
function feedEvent(
  i: any,
  type: FeedType,
  eventAt: string | null,
  extra: Record<string, any> = {},
) {
  return {
    id: i.id,
    type,
    eventAt,
    title: i.title,
    coralType: classifyCoralType(i.title),
    productUrl: i.product_url,
    photoUrl: i.photo_source_url,
    wholesaleCost: i.wholesale_cost,
    compareAtPrice: i.compare_at_price,
    available: i.available_at_source,
    sourceId: i.source_id,
    vendorName: i.source?.vendors?.name ?? i.source?.name ?? "Vendor",
    sourceName: i.source?.name ?? "",
    ...extra,
  };
}

export const getVendorFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(90).default(14) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const { supabase } = context;
    const cutoff = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const sel =
      "id, source_id, title, product_url, photo_source_url, wholesale_cost, compare_at_price, available_at_source, first_seen_at, last_seen_at, last_available_at, last_price_change_at, source:source_id(name, vendors:vendor_id(name, slug))";
    const PER = 200;

    // Just appeared — newly seen & still available.
    const { data: appeared } = await supabase
      .from("vendor_scrape_items")
      .select(sel)
      .gte("first_seen_at", cutoff)
      .eq("available_at_source", true)
      .neq("status", "ignored")
      .order("first_seen_at", { ascending: false })
      .limit(PER);

    // On sale — compare_at_price present & above cost, still available.
    const { data: onSaleRaw } = await supabase
      .from("vendor_scrape_items")
      .select(sel)
      .not("compare_at_price", "is", null)
      .eq("available_at_source", true)
      .neq("status", "ignored")
      .order("last_seen_at", { ascending: false })
      .limit(PER);
    const onSale = (onSaleRaw ?? []).filter(
      (i: any) =>
        i.compare_at_price != null &&
        i.wholesale_cost != null &&
        Number(i.compare_at_price) > Number(i.wholesale_cost),
    );

    // Sold / gone — recently disappeared from the vendor.
    const { data: gone } = await supabase
      .from("vendor_scrape_items")
      .select(sel)
      .eq("available_at_source", false)
      .gte("last_available_at", cutoff)
      .neq("status", "ignored")
      .order("last_available_at", { ascending: false })
      .limit(PER);

    // Price changed recently — resolve which were drops via snapshot history.
    const { data: changed } = await supabase
      .from("vendor_scrape_items")
      .select(sel)
      .gte("last_price_change_at", cutoff)
      .eq("available_at_source", true)
      .neq("status", "ignored")
      .order("last_price_change_at", { ascending: false })
      .limit(PER);

    const priorById = new Map<string, number>();
    const changedIds = (changed ?? []).map((i: any) => i.id);
    if (changedIds.length) {
      const { data: snaps } = await supabase
        .from("vendor_scrape_snapshots")
        .select("scrape_item_id, wholesale_cost, observed_at")
        .in("scrape_item_id", changedIds)
        .order("observed_at", { ascending: false });
      const byItem = new Map<string, any[]>();
      for (const s of snaps ?? []) {
        const arr = byItem.get(s.scrape_item_id) ?? [];
        arr.push(s);
        byItem.set(s.scrape_item_id, arr);
      }
      for (const it of changed ?? []) {
        const current = it.wholesale_cost == null ? null : Number(it.wholesale_cost);
        if (current == null) continue;
        // Most recent snapshot price that differs from the current price.
        const prior = (byItem.get(it.id) ?? [])
          .map((s) => (s.wholesale_cost == null ? null : Number(s.wholesale_cost)))
          .find((v) => v != null && v !== current);
        if (prior != null && current < prior) priorById.set(it.id, prior);
      }
    }

    const events: any[] = [];
    for (const i of appeared ?? []) events.push(feedEvent(i, "new", i.first_seen_at));
    for (const i of changed ?? [])
      if (priorById.has(i.id))
        events.push(
          feedEvent(i, "price_drop", i.last_price_change_at, { priceBefore: priorById.get(i.id) }),
        );
    for (const i of onSale) events.push(feedEvent(i, "on_sale", i.last_seen_at));
    for (const i of gone ?? []) events.push(feedEvent(i, "sold", i.last_available_at));

    events.sort((a, b) => (b.eventAt ?? "").localeCompare(a.eventAt ?? ""));

    return {
      events: events.slice(0, 300),
      counts: {
        new: appeared?.length ?? 0,
        price_drop: priorById.size,
        on_sale: onSale.length,
        sold: gone?.length ?? 0,
      },
    };
  });

// ---------- coral-type watchlist (shop-wide) ----------
const CORAL_TYPE_SLUGS = new Set(CORAL_TYPES.map((t) => t.slug));

export const listTrackedCoralTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireEditor(context.supabase, context.userId);
    // `as any`: tracked_coral_types may not be in the generated types yet.
    const { data, error } = await (context.supabase as any)
      .from("tracked_coral_types")
      .select("coral_type");
    if (error) throw new Error(error.message);
    return { types: (data ?? []).map((r: any) => r.coral_type as string) };
  });

export const setTrackedCoralType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        coralType: z.string().refine((s) => CORAL_TYPE_SLUGS.has(s), "Unknown coral type"),
        tracked: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;
    if (data.tracked) {
      const { error } = await db
        .from("tracked_coral_types")
        .upsert(
          { coral_type: data.coralType, created_by: context.userId },
          { onConflict: "coral_type" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db
        .from("tracked_coral_types")
        .delete()
        .eq("coral_type", data.coralType);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
