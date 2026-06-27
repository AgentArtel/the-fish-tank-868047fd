// ============================================================
// The Fish Tank — website data-access layer
// Framework-agnostic. Reads the shipped v_public_* views (default `public`
// schema, granted to anon) and MAPS their snake_case rows into the camelCase
// objects defined by /data/schemas/*.json. The schemas remain the frontend
// contract; this layer absorbs the DB naming + derives unbacked fields.
//
// Inject the Supabase client once at startup (no npm dep here):
//   import { createClient } from "@supabase/supabase-js";
//   import { initTftData } from "@/data/client/tft-data";
//   initTftData(createClient(
//     import.meta.env.VITE_SUPABASE_URL,
//     import.meta.env.VITE_SUPABASE_ANON_KEY,
//     { auth: { persistSession: false } }
//   ));
//
// NOTE: column names below follow the shipped views; reconcile against the
// final DDL diff (data/OPEN_ITEMS.md) and adjust the snake_case keys if needed.
// ============================================================

let supabase;
export function initTftData(client) { supabase = client; }
function db() {
  if (!supabase) throw new Error("tft-data: call initTftData(client) before querying.");
  return supabase;
}

// ---------- shared config cache (storage base + locations) ----------
let _cfg = null;
async function cfg() {
  if (_cfg) return _cfg;
  const [{ data: s }, { data: locs }, { data: authors }] = await Promise.all([
    db().from("v_public_site_settings").select("*").single(),
    db().from("v_public_locations").select("*"),
    db().from("v_public_authors").select("*"),
  ]);
  const settings = s?.settings ?? s ?? {};
  _cfg = {
    storageBase: (settings.storage_base || s?.storage_base || "").replace(/\/$/, ""),
    settings,
    locations: Object.fromEntries((locs || []).map((l) => [l.id, l])),
    authors: Object.fromEntries((authors || []).map((a) => [a.id, a])),
  };
  return _cfg;
}
/** Absolute URL for a Storage path (storage_base already includes the public-media bucket). */
function mediaUrl(base, path) { return path ? `${base}/${path}` : null; }

const slugify = (name, id) =>
  `${String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}` +
  (id ? `-${String(id).slice(0, 8)}` : "");

const TYPE_MAP = { fish: "fish", coral: "coral", invert: "invert" };
const AVAIL_MAP = { available: "available", on_hold: "on_hold", sold_out: "sold" };

// ---------- mappers (snake_case row -> schema-shaped object) ----------
function mapProduct(r, c) {
  const a = r.attrs || {};
  const pct = r.compare_at_price && r.compare_at_price > r.retail_price;
  const badges = [];
  if (r.is_wysiwyg) badges.push("WYSIWYG");
  if (pct) badges.push("Sale");
  if ((r.origin_region ?? a.origin_region) === "Aquacultured") badges.push("Aquacultured");
  return {
    id: r.id,
    slug: r.slug || slugify(r.item_name, r.id),
    name: r.item_name,
    scientificName: r.scientific_name ?? null,
    type: TYPE_MAP[r.item_type] || "supply",
    category: r.category ?? a.category ?? null,            // category/size/care/reef live in attrs
    subcategory: r.subcategory ?? a.subcategory ?? null,
    price: r.retail_price,
    compareAtPrice: r.compare_at_price ?? null,
    currency: "USD",
    availability: AVAIL_MAP[r.availability_status] || "coming_soon",
    isWysiwyg: !!r.is_wysiwyg,
    isHouseLine: !!r.is_house_line,
    careLevel: a.care_level ?? r.care_level ?? null,
    reefSafe: a.reef_safe ?? r.reef_safe ?? null,
    originRegion: r.origin_region ?? a.origin_region ?? null,
    size: a.size ?? r.size ?? null,
    description: r.specimen_notes ?? null,
    careNotes: null,
    tankLocation: c.locations[r.location_id]?.name ?? null,
    images: r.primary_media_path
      ? [{ url: mediaUrl(c.storageBase, r.primary_media_path), alt: r.item_name, isPrimary: true, view: r.primary_media_view || "daylight" }]
      : [],
    badges,
    updatedAt: r.updated_at,
  };
}

function mapArticle(r, c) {
  const words = (r.body_md || "").trim().split(/\s+/).filter(Boolean).length;
  const au = r.author_id ? c.authors[r.author_id] : null;
  return {
    id: r.id,
    slug: r.slug,
    kind: r.kind,
    title: r.title,
    excerpt: r.excerpt ?? r.subtitle ?? null,
    bodyMarkdown: r.body_md ?? "",
    // hero_media_id is a media FK (no path projected yet) → fall back to the OG image path
    heroImage: r.og_image_path ? { url: mediaUrl(c.storageBase, r.og_image_path), alt: r.title } : null,
    author: au ? { slug: au.slug, name: au.display_name, title: au.credentials ?? null, avatarUrl: null } : null,
    topics: r.topics || r.tags || [],
    tags: r.tags || [],
    readingMinutes: words ? Math.max(1, Math.round(words / 200)) : null,
    relatedProductSlugs: r.related_product_slugs || [],
    faqs: r.faqs || [],
    seo: { title: r.seo_title ?? null, description: r.seo_description ?? null, ogImage: mediaUrl(c.storageBase, r.og_image_path), canonical: null, noindex: false },
    publishedAt: r.publish_at,
    updatedAt: r.updated_at,
  };
}

function mapEvent(r, c) {
  return {
    id: r.id, slug: r.slug, title: r.title, description: r.description ?? null,
    heroImage: mediaUrl(c.storageBase, r.hero_path),
    startsAt: r.starts_at, endsAt: r.ends_at ?? null,
    isAllDay: !!r.is_all_day,                                  // false if column absent
    locationName: r.location_text || c.locations[r.location_id]?.name || null,
    url: r.url ?? null,
  };
}

function mapLocation(r) {
  const digits = String(r.phone || "").replace(/\D/g, "");
  return {
    id: r.id, slug: r.slug, name: r.name,
    address: { street: r.address_line1, city: r.city, region: r.region, postal: r.postal_code, country: r.country || "US" },
    geo: { lat: r.lat, lng: r.lng },
    phone: r.phone,
    phoneHref: digits ? `tel:+1${digits}` : null,             // derived
    email: r.public_email ?? r.email ?? null,
    hours: r.hours || [],
    serviceAreas: r.service_areas || [],                      // from site_settings if not on view
  };
}

function mapCollection(r) {
  return {
    id: r.id, slug: r.slug, title: r.title, subtitle: r.subtitle ?? null,
    description: r.description ?? null,
    heroImage: r.hero_media_path ?? r.hero_image ?? null,
    mode: r.mode, query: r.query ?? null, productIds: r.product_ids ?? null,
    showInMegaMenu: !!r.show_in_mega_menu, sortOrder: r.sort_order ?? 0,
  };
}

// ---------- products ----------
export async function listProducts(filter = {}, { limit = 24, offset = 0 } = {}) {
  const c = await cfg();
  let q = db().from("v_public_inventory").select("*", { count: "exact" });
  if (filter.type) q = q.eq("item_type", filter.type);
  if (filter.category) q = q.eq("attrs->>category", filter.category);
  if (filter.subcategory) q = q.eq("attrs->>subcategory", filter.subcategory);
  if (filter.isWysiwyg) q = q.eq("is_wysiwyg", true);
  if (filter.careLevel) q = q.eq("attrs->>care_level", filter.careLevel);
  if (filter.hasCompareAt) q = q.not("compare_at_price", "is", null);
  switch (filter.sort) {
    case "price-asc": q = q.order("retail_price", { ascending: true }); break;
    case "price-desc": q = q.order("retail_price", { ascending: false }); break;
    default: q = q.order("updated_at", { ascending: false });
  }
  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) throw error;
  return { products: (data || []).map((r) => mapProduct(r, c)), total: count ?? data.length };
}

export async function getProductBySlug(slug) {
  // requires v_public_inventory.slug (requested). Until then, route by id and use getProductById.
  const c = await cfg();
  const { data, error } = await db().from("v_public_inventory").select("*").eq("slug", slug).single();
  if (error) throw error;
  return mapProduct(data, c);
}
export async function getProductById(id) {
  const c = await cfg();
  const { data, error } = await db().from("v_public_inventory").select("*").eq("id", id).single();
  if (error) throw error;
  const p = mapProduct(data, c);
  // full gallery for the PDP
  const { data: imgs } = await db().from("v_public_inventory_media").select("*").eq("inventory_item_id", id);
  if (imgs?.length) p.images = imgs.map((m) => ({ url: mediaUrl(c.storageBase, m.storage_path), alt: m.alt_text ?? p.name, isPrimary: !!m.is_primary, view: m.media_view || "daylight" }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  return p;
}

// ---------- collections ----------
export async function listCollections({ megaMenuOnly = false } = {}) {
  let q = db().from("v_public_collections").select("*").order("sort_order");
  const { data, error } = await q;
  if (error) throw error;
  const cols = (data || []).map(mapCollection);
  return megaMenuOnly ? cols.filter((x) => x.showInMegaMenu) : cols;
}
export async function getCollectionProducts(slug, opts) {
  const c = await cfg();
  const { data: col, error } = await db().from("v_public_collections").select("*").eq("slug", slug).single();
  if (error) throw error;
  const collection = mapCollection(col);
  if (collection.mode === "manual" && collection.productIds?.length) {
    const { data } = await db().from("v_public_inventory").select("*").in("id", collection.productIds);
    const order = new Map(collection.productIds.map((id, i) => [id, i]));
    const sorted = (data || []).sort((a, b) => order.get(a.id) - order.get(b.id));
    return { collection, products: sorted.map((r) => mapProduct(r, c)) };
  }
  const { products, total } = await listProducts(collection.query || {}, opts);
  return { collection, products, total };
}

// ---------- site config & location ----------
export async function getSiteSettings() { return (await cfg()).settings; }
export async function getStoreLocation(slug = "sandy") {
  const { data, error } = await db().from("v_public_locations").select("*").eq("slug", slug).single();
  if (error) throw error;
  const loc = mapLocation(data);
  // serviceAreas may live in site_settings.data rather than on the location
  if (!loc.serviceAreas.length) loc.serviceAreas = (await cfg()).settings.serviceAreas || [];
  return loc;
}

// ---------- content & SEO ----------
export async function listArticles({ kind, topic, limit = 12, offset = 0 } = {}) {
  const c = await cfg();
  let q = db().from("v_public_articles").select("*", { count: "exact" });
  if (kind) q = q.eq("kind", kind);
  if (topic) q = q.contains("tags", [topic]);
  q = q.order("publish_at", { ascending: false });
  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) throw error;
  return { articles: (data || []).map((r) => mapArticle(r, c)), total: count ?? data.length };
}
export async function getArticleBySlug(slug) {
  const c = await cfg();
  const { data, error } = await db().from("v_public_articles").select("*").eq("slug", slug).single();
  if (error) throw error;
  const article = mapArticle(data, c);
  // related products via the join view → derive slugs from item_name + id
  const { data: rel } = await db().from("v_public_article_products").select("*").eq("article_id", data.id).order("sort_order");
  if (rel?.length) article.relatedProductSlugs = rel.map((x) => slugify(x.item_name, x.inventory_item_id));
  return article;
}
export async function listFaqs() {
  const { data, error } = await db().from("v_public_faqs").select("*");
  if (error) throw error;
  return (data || []).map((f) => ({ id: f.id, question: f.question, answerMarkdown: f.answer_md, category: f.category ?? null, sortOrder: f.sort_order ?? 0 }));
}
export async function listEvents({ upcomingOnly = true } = {}) {
  const c = await cfg();
  let q = db().from("v_public_events").select("*").order("starts_at", { ascending: true });
  if (upcomingOnly) q = q.gte("starts_at", new Date().toISOString());
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((r) => mapEvent(r, c));
}
export async function getRedirects() {
  const { data, error } = await db().from("v_public_redirects").select("*");
  if (error) throw error;
  return (data || []).map((r) => ({ fromPath: r.from_path, toPath: r.to_path, code: r.code }));
}

// ---------- realtime ----------
export function subscribeStock(onChange) {
  return db().channel("stock")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "inventory_items" }, (p) => onChange(p.new))
    .subscribe();
}

// ---------- helpers ----------
export const formatPrice = (n, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(n));

export function openStatus(hours, now = new Date()) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = (hours || []).find((h) => h.day === days[now.getDay()]);
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const fmt = (t) => { let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, "0")}${ap}` : `${h}${ap}`; };
  const cur = now.getHours() * 60 + now.getMinutes();
  if (today?.open && cur >= toMin(today.open) && cur < toMin(today.close)) return `Open today · till ${fmt(today.close)}`;
  for (let i = 1; i <= 7; i++) {
    const d = (hours || []).find((h) => h.day === days[(now.getDay() + i) % 7]);
    if (d?.open) return `Closed · opens ${d.day} ${fmt(d.open)}`;
  }
  return "";
}
