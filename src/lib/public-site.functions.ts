import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ============================================================
// The Fish Tank — public storefront data layer (server-side).
//
// Re-implements the snake->camel mappers from
// design-system/data/client/tft-data.js over the LIVE v_public_* views,
// using ONLY columns that actually exist in the shipped DDL
// (supabase/migrations/2026062322390* + 20260623234737_*). Derives the
// unbacked fields from `attrs`. Anon-safe: uses supabaseAdmin (service role,
// like catalog.functions.ts) — NO auth middleware, so anonymous users load.
//
// Image URLs resolve from `primary_media_path` + site_settings.storage_base
// (the public `public-media` bucket). If storage_base or the path is missing,
// images come back empty and the UI falls back to a local placeholder.
// ============================================================

// ---------- shaped output types ----------
export type StoreLocation = {
  id: string;
  slug: string | null;
  name: string;
  address: {
    street: string | null;
    street2: string | null;
    city: string | null;
    region: string | null;
    postal: string | null;
    country: string;
  };
  geo: { lat: number | null; lng: number | null };
  phone: string | null;
  phoneHref: string | null;
  email: string | null;
  hours: Array<{ day: string; open: string; close: string }>;
  primaryPhotoUrl: string | null;
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type SiteSettings = {
  siteTitle: string | null;
  tagline: string | null;
  defaultOgImage: string | null;
  storageBase: string;
  social: Json;
  announcement: Json;
  announcements: string[];
  /** Service areas for local SEO (v_public_site_settings.service_areas → site_settings.data.serviceAreas). */
  serviceAreas: string[];
  /** Store order cycle → drives the sold-out-sourceable pickup-ETA copy (v_public_site_settings.order_cycle). */
  orderCycle: { cutoffDay: string; readyDay: string } | null;
  updatedAt: string | null;
};

export type ProductImage = {
  url: string;
  alt: string;
  isPrimary: boolean;
  view: string;
};

export type ProductSort = "featured" | "price-asc" | "price-desc" | "newest";

export type CollectionQuery = {
  type?: Product["type"];
  category?: string;
  subcategory?: string;
  hasCompareAt?: boolean;
  isWysiwyg?: boolean;
  careLevel?: string;
  sort?: ProductSort;
};

export type Collection = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  heroImage: string | null;
  sortOrder: number;
  /** dynamic query applied server-side over v_public_inventory */
  query: CollectionQuery;
};

export type ProductListResult = {
  products: Product[];
  total: number;
};

export type CollectionProductsResult = ProductListResult & {
  collection: Collection | null;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  scientificName: string | null;
  type: "fish" | "coral" | "invert" | "supply";
  category: string | null;
  subcategory: string | null;
  price: number | null;
  compareAtPrice: number | null;
  currency: "USD";
  availability: "available" | "on_hold" | "sold" | "coming_soon";
  /**
   * Whether the item can be re-ordered when sold out. From v_public_inventory.sourceable
   * (already `COALESCE(sourceable, NOT is_wysiwyg)` server-side), default true when null.
   */
  sourceable: boolean;
  /**
   * Derived display state: in-stock (available/on_hold) → "in_stock"; a sold-out
   * sourceable row (the only sold-out rows the view keeps) → "order_ahead".
   */
  orderState: "in_stock" | "order_ahead";
  isWysiwyg: boolean;
  isHouseLine: boolean;
  careLevel: string | null;
  reefSafe: string | null;
  originRegion: string | null;
  size: string | null;
  description: string | null;
  careNotes: string | null;
  tankLocation: string | null;
  images: ProductImage[];
  badges: string[];
  updatedAt: string | null;
};

// ---------- helpers ----------
const TYPE_MAP: Record<string, Product["type"]> = {
  fish: "fish",
  coral: "coral",
  invert: "invert",
};
const AVAIL_MAP: Record<string, Product["availability"]> = {
  available: "available",
  on_hold: "on_hold",
  sold_out: "sold",
};

const slugify = (name: string | null | undefined, id?: string) =>
  `${String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}` + (id ? `-${String(id).slice(0, 8)}` : "");

const stripTrailingSlash = (s: string) => s.replace(/\/$/, "");

/**
 * Pickup-ETA copy for a sold-out-but-sourceable (order-ahead) item. Deliberately
 * simple: "Order by Sunday · pickup Wednesday" when the order cycle is set,
 * falling back to "Available to order" when it isn't. No "special order" wording.
 */
export function pickupEtaLine(orderCycle: SiteSettings["orderCycle"] | null | undefined): string {
  if (orderCycle?.cutoffDay && orderCycle?.readyDay) {
    return `Order by ${orderCycle.cutoffDay} · pickup ${orderCycle.readyDay}`;
  }
  return "Available to order";
}

/** Absolute URL for a Storage path. storage_base already includes the public-media bucket. */
function mediaUrl(base: string, path: string | null | undefined): string | null {
  if (!base || !path) return null;
  return `${stripTrailingSlash(base)}/${String(path).replace(/^\//, "")}`;
}

// ---------- config cache (storage base + locations) ----------
type Cfg = {
  storageBase: string;
  locations: Record<string, { id: string; name: string }>;
};

async function loadCfg(supabaseAdmin: any): Promise<Cfg> {
  const [{ data: s }, { data: locs }] = await Promise.all([
    supabaseAdmin.from("v_public_site_settings").select("*").maybeSingle(),
    supabaseAdmin.from("v_public_locations").select("id,name"),
  ]);
  return {
    storageBase: stripTrailingSlash(String(s?.storage_base || "")),
    locations: Object.fromEntries((locs ?? []).map((l: any) => [l.id, { id: l.id, name: l.name }])),
  };
}

// ---------- mappers ----------
function mapProduct(r: any, cfg: Cfg): Product {
  const a = r.attrs || {};
  const price = r.retail_price != null ? Number(r.retail_price) : null;
  const compareAt = r.compare_at_price != null ? Number(r.compare_at_price) : null;
  const onSale = compareAt != null && price != null && compareAt > price;
  const originRegion = r.origin_region ?? a.origin_region ?? null;

  const badges: string[] = [];
  if (r.is_wysiwyg) badges.push("WYSIWYG");
  if (onSale) badges.push("Sale");
  if (originRegion === "Aquacultured") badges.push("Aquacultured");

  const primaryUrl = mediaUrl(cfg.storageBase, r.primary_media_path);

  // The view already coalesces sourceable (COALESCE(sourceable, NOT is_wysiwyg)),
  // so a null here means the row predates the column — default to true (orderable).
  const sourceable = r.sourceable == null ? true : !!r.sourceable;
  const availability = AVAIL_MAP[r.availability_status] || "coming_soon";
  // Only sold-out *sourceable* rows reach the view, so a "sold" row is order-ahead.
  const orderState: Product["orderState"] = availability === "sold" ? "order_ahead" : "in_stock";

  return {
    id: r.id,
    slug: r.slug || slugify(r.item_name, r.id),
    name: r.item_name,
    scientificName: r.scientific_name ?? null,
    type: TYPE_MAP[r.item_type] || "supply",
    // category/subcategory/care/reef live only in attrs (not real columns)
    category: a.category ?? null,
    subcategory: a.subcategory ?? null,
    price,
    compareAtPrice: compareAt,
    currency: "USD",
    availability,
    sourceable,
    orderState,
    isWysiwyg: !!r.is_wysiwyg,
    isHouseLine: !!r.is_house_line,
    careLevel: a.care_level ?? null,
    reefSafe: a.reef_safe ?? null,
    originRegion,
    size: a.size ?? null,
    description: r.description ?? r.specimen_notes ?? null,
    careNotes: r.care_notes ?? null,
    tankLocation: cfg.locations[r.location_id]?.name ?? null,
    images: primaryUrl
      ? [
          {
            url: primaryUrl,
            alt: r.item_name,
            isPrimary: true,
            view: r.primary_media_view || "daylight",
          },
        ]
      : [],
    badges,
    updatedAt: r.updated_at ?? null,
  };
}

function mapSiteSettings(s: any, storageBase: string): SiteSettings {
  // announcement may be a string, an array, or an object {messages:[]}
  let announcements: string[] = [];
  const ann = s?.announcement;
  if (Array.isArray(ann))
    announcements = ann.filter((x: unknown): x is string => typeof x === "string");
  else if (typeof ann === "string" && ann.trim()) announcements = [ann.trim()];
  else if (ann && typeof ann === "object" && Array.isArray((ann as any).messages))
    announcements = (ann as any).messages.filter(
      (x: unknown): x is string => typeof x === "string",
    );

  // service_areas comes off the view as a jsonb array of strings.
  const rawAreas = s?.service_areas;
  const serviceAreas: string[] = Array.isArray(rawAreas)
    ? rawAreas.filter((x: unknown): x is string => typeof x === "string")
    : [];

  // order_cycle is a jsonb {cutoff_day, ready_day}; null-safe, snake→camel.
  const oc = s?.order_cycle;
  const orderCycle =
    oc &&
    typeof oc === "object" &&
    typeof oc.cutoff_day === "string" &&
    typeof oc.ready_day === "string"
      ? { cutoffDay: oc.cutoff_day, readyDay: oc.ready_day }
      : null;

  return {
    siteTitle: s?.site_title ?? null,
    tagline: s?.tagline ?? null,
    defaultOgImage: mediaUrl(storageBase, s?.default_og_image_path),
    storageBase,
    social: s?.social ?? null,
    announcement: ann ?? null,
    announcements,
    serviceAreas,
    orderCycle,
    updatedAt: s?.updated_at ?? null,
  };
}

function mapLocation(r: any, storageBase: string): StoreLocation {
  const digits = String(r.phone || "").replace(/\D/g, "");
  return {
    id: r.id,
    slug: r.slug ?? null,
    name: r.name,
    address: {
      street: r.address_line1 ?? null,
      street2: r.address_line2 ?? null,
      city: r.city ?? null,
      region: r.region ?? null,
      postal: r.postal_code ?? null,
      country: r.country || "US",
    },
    geo: { lat: r.lat ?? null, lng: r.lng ?? null },
    phone: r.phone ?? null,
    phoneHref: digits ? `tel:+1${digits}` : null,
    email: r.public_email ?? null,
    hours: Array.isArray(r.hours) ? r.hours : [],
    primaryPhotoUrl: r.primary_photo_url
      ? /^https?:\/\//.test(r.primary_photo_url)
        ? r.primary_photo_url
        : mediaUrl(storageBase, r.primary_photo_url)
      : null,
  };
}

function mapCollection(r: any, storageBase: string): Collection {
  const f = (r.filter && typeof r.filter === "object" ? r.filter : {}) as Record<string, any>;
  const type =
    typeof f.type === "string" && TYPE_MAP[f.type]
      ? (TYPE_MAP[f.type] as Product["type"])
      : undefined;
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description ?? null,
    heroImage: mediaUrl(storageBase, r.hero_media_path),
    sortOrder: r.sort_order ?? 0,
    query: {
      type,
      category: typeof f.category === "string" ? f.category : undefined,
      subcategory: typeof f.subcategory === "string" ? f.subcategory : undefined,
      hasCompareAt: typeof f.hasCompareAt === "boolean" ? f.hasCompareAt : undefined,
      isWysiwyg: typeof f.isWysiwyg === "boolean" ? f.isWysiwyg : undefined,
      careLevel: typeof f.careLevel === "string" ? f.careLevel : undefined,
      sort: SORTS.includes(f.sort) ? (f.sort as ProductSort) : undefined,
    },
  };
}

// item_type values stored on inventory_items are the snake-case DB enum; map a
// public type filter ("coral"/"fish"/"invert"/"supply") back to the column value.
const PUBLIC_TYPE_TO_ITEM_TYPE: Record<string, string> = {
  fish: "fish",
  coral: "coral",
  invert: "invert",
  supply: "supply",
};
const SORTS: ProductSort[] = ["featured", "price-asc", "price-desc", "newest"];

/**
 * Apply a CollectionQuery / shop filter to a v_public_inventory select.
 * Only `type`, `hasCompareAt` and `isWysiwyg` map to real columns; category /
 * subcategory / careLevel live in `attrs` (JSONB) and are filtered with `->>`.
 * Sort: featured/newest → updated_at desc; price-asc/price-desc → retail_price.
 */
function applyProductFilter(q: any, f: CollectionQuery) {
  if (f.type && PUBLIC_TYPE_TO_ITEM_TYPE[f.type]) {
    q = q.eq("item_type", PUBLIC_TYPE_TO_ITEM_TYPE[f.type]);
  }
  if (f.isWysiwyg) q = q.eq("is_wysiwyg", true);
  if (f.hasCompareAt) q = q.not("compare_at_price", "is", null);
  // attrs-backed refinements (see HANDOFF_Catalog.md §8 — keys must be populated)
  if (f.category) q = q.eq("attrs->>category", f.category);
  if (f.subcategory) q = q.eq("attrs->>subcategory", f.subcategory);
  if (f.careLevel) q = q.eq("attrs->>care_level", f.careLevel);

  switch (f.sort) {
    case "price-asc":
      q = q.order("retail_price", { ascending: true, nullsFirst: false });
      break;
    case "price-desc":
      q = q.order("retail_price", { ascending: false, nullsFirst: false });
      break;
    case "newest":
    case "featured":
    default:
      q = q.order("updated_at", { ascending: false });
      break;
  }
  return q;
}

const PAGE_SIZE = 24;

// ============================================================
// Server functions (anon-safe — mirror catalog.functions.ts)
// ============================================================

/** Site-wide settings → v_public_site_settings. */
export const getSiteSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteSettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("v_public_site_settings")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const storageBase = stripTrailingSlash(String(data?.storage_base || ""));
    return mapSiteSettings(data, storageBase);
  },
);

/** Public store location(s) → v_public_locations. Returns the slug match (default "sandy") or first row. */
export const getStoreLocation = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ slug: z.string().max(120).optional() })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<StoreLocation | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin
      .from("v_public_site_settings")
      .select("storage_base")
      .maybeSingle();
    const storageBase = stripTrailingSlash(String(s?.storage_base || ""));

    const wantedSlug = data?.slug ?? "sandy";
    const { data: rows, error } = await supabaseAdmin.from("v_public_locations").select("*");
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return null;
    const match = rows.find((r: any) => r.slug === wantedSlug) ?? rows[0];
    return mapLocation(match, storageBase);
  });

/** Single product by SEO slug → v_public_inventory (gated, website-ready only). */
export const getProductBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<Product | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = await loadCfg(supabaseAdmin);

    const { data: row, error } = await supabaseAdmin
      .from("v_public_inventory")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    const product = mapProduct(row, cfg);

    // Full gallery from v_public_media (website-tagged images for this item).
    const { data: imgs } = await supabaseAdmin
      .from("v_public_media")
      .select("storage_path,view,is_primary")
      .eq("inventory_item_id", row.id as string);
    if (imgs && imgs.length) {
      const gallery = imgs
        .map((m: any) => ({
          url: mediaUrl(cfg.storageBase, m.storage_path),
          alt: product.name,
          isPrimary: !!m.is_primary,
          view: m.view || "daylight",
        }))
        .filter((m): m is ProductImage => !!m.url)
        .sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary));
      if (gallery.length) product.images = gallery;
    }

    return product;
  });

// ---------- catalog input schema ----------
const productFilterSchema = z.object({
  type: z.enum(["fish", "coral", "invert", "supply"]).optional(),
  category: z.string().max(120).optional(),
  subcategory: z.string().max(120).optional(),
  careLevel: z.string().max(120).optional(),
  hasCompareAt: z.boolean().optional(),
  isWysiwyg: z.boolean().optional(),
  sort: z.enum(["featured", "price-asc", "price-desc", "newest"]).optional(),
  page: z.number().int().min(0).max(1000).optional(),
});

/**
 * List website-ready products → v_public_inventory (gated). Optional filter +
 * sort + page (24/page). Mirrors getProductBySlug's mappers/image-URL logic.
 * Returns `{ products, total }`; `total` is the filtered row count for pagination.
 */
export const listProducts = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => productFilterSchema.parse(d ?? {}))
  .handler(async ({ data }): Promise<ProductListResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = await loadCfg(supabaseAdmin);

    const page = data.page ?? 0;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabaseAdmin.from("v_public_inventory").select("*", { count: "exact" });
    q = applyProductFilter(q, data);
    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);

    return {
      products: (rows ?? []).map((r: any) => mapProduct(r, cfg)),
      total: count ?? (rows ?? []).length,
    };
  });

/** A published collection by slug → v_public_collections. */
export const getCollection = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<Collection | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin
      .from("v_public_site_settings")
      .select("storage_base")
      .maybeSingle();
    const storageBase = stripTrailingSlash(String(s?.storage_base || ""));

    const { data: row, error } = await supabaseAdmin
      .from("v_public_collections")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return mapCollection(row, storageBase);
  });

/**
 * Products for a published collection → its `filter` (from v_public_collections)
 * applied over v_public_inventory. Returns `{ collection, products, total }`.
 * Unknown/unpublished slug → `{ collection: null, products: [], total: 0 }`.
 *
 * TODO[DB=Lovable]: manual collections (`mode: "manual"` / pinned productIds in
 * the design-system schema) aren't projected onto v_public_collections yet — only
 * the dynamic `filter` jsonb is. When a manual product-pin source lands, branch here.
 */
export const getCollectionProducts = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(200),
        page: z.number().int().min(0).max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<CollectionProductsResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = await loadCfg(supabaseAdmin);

    const { data: cRow, error: cErr } = await supabaseAdmin
      .from("v_public_collections")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!cRow) return { collection: null, products: [], total: 0 };

    const collection = mapCollection(cRow, cfg.storageBase);

    const page = data.page ?? 0;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabaseAdmin.from("v_public_inventory").select("*", { count: "exact" });
    q = applyProductFilter(q, collection.query);
    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);

    return {
      collection,
      products: (rows ?? []).map((r: any) => mapProduct(r, cfg)),
      total: count ?? (rows ?? []).length,
    };
  });

// ============================================================
// Content layer — blog / guides / events / FAQ + author bylines
// (Phase 4). All over the anon-readable v_public_* views, which
// already gate to published rows server-side:
//   v_public_articles  → status='published' AND publish_at<=now()
//   v_public_faqs      → is_published=true
//   v_public_events    → status='published'
//   v_public_authors   → is_active=true
// so the fns don't re-gate; they just shape snake→camel.
//
// IMAGE PATHS — projection gap [DB=Lovable]:
//   Article/event hero + author avatar are exposed as *_media_id UUIDs
//   (hero_media_id / avatar_media_id), NOT storage paths. v_public_media is
//   keyed by inventory_item_id (livestock photos only), so those ids can't be
//   resolved to a public URL from the anon views. We therefore use the
//   article/event `og_image_path` (a real Storage path) as the hero/OG image,
//   and render author avatars only if a future view projects an avatar path.
//   Until a `hero_media_path` / `avatar_media_path` is projected onto the
//   views, hero/avatar images degrade gracefully (no broken <img>).
// ============================================================

// ---------- article `kind` → public surface ----------
// The DB `article_kind` enum is care_guide | event_recap | news |
// species_spotlight | how_to | other — it is NOT a blog/guide flag. We map
// the how-to-shaped kinds to the "guides" surface and everything else to the
// "blog" surface so /blog and /guides each get a coherent feed.
export type ArticleSurface = "blog" | "guide";
const GUIDE_KINDS = ["care_guide", "how_to"] as const;
const BLOG_KINDS = ["event_recap", "news", "species_spotlight", "other"] as const;
const surfaceForKind = (kind: string | null | undefined): ArticleSurface =>
  kind && (GUIDE_KINDS as readonly string[]).includes(kind) ? "guide" : "blog";

export type Author = {
  id: string;
  slug: string | null;
  name: string;
  /** credentials line (e.g. "Lead aquarist") — closest field to a job title */
  credentials: string | null;
  bioMarkdown: string | null;
  links: Json;
  /**
   * Avatar URL. Currently always null — v_public_authors exposes avatar_media_id
   * (a UUID) but no resolvable path. TODO[DB=Lovable]: project avatar_media_path.
   */
  avatarUrl: string | null;
};

export type Article = {
  id: string;
  slug: string;
  surface: ArticleSurface;
  kind: string | null;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  bodyMarkdown: string | null;
  tags: string[];
  /** Hero/OG image from og_image_path + storage_base. Null when unset. */
  heroImage: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  author: Author | null;
};

export type ArticleListResult = {
  articles: Article[];
  total: number;
};

export type ArticleDetail = Article & {
  /** Featured/related products pinned to the post (v_public_article_products). */
  featuredProducts: Product[];
};

export type Faq = {
  id: string;
  question: string;
  answerMarkdown: string | null;
  category: string;
  sortOrder: number;
};

export type EventItem = {
  id: string;
  slug: string | null;
  title: string;
  descriptionMarkdown: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  locationText: string | null;
  heroImage: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string | null;
};

// ---------- content mappers ----------
function mapAuthor(r: any): Author {
  return {
    id: r.id,
    slug: r.slug ?? null,
    name: r.display_name ?? "The Fish Tank",
    credentials: r.credentials ?? null,
    bioMarkdown: r.bio_md ?? null,
    links: r.links ?? null,
    // avatar_media_id is a UUID with no public path projection yet — render none.
    // TODO[DB=Lovable]: project an avatar path onto v_public_authors.
    avatarUrl: null,
  };
}

function mapArticle(r: any, storageBase: string, author: Author | null): Article {
  return {
    id: r.id,
    slug: r.slug,
    surface: surfaceForKind(r.kind),
    kind: r.kind ?? null,
    title: r.title,
    subtitle: r.subtitle ?? null,
    excerpt: r.excerpt ?? null,
    bodyMarkdown: r.body_md ?? null,
    tags: Array.isArray(r.tags)
      ? r.tags.filter((t: unknown): t is string => typeof t === "string")
      : [],
    heroImage: mediaUrl(storageBase, r.og_image_path),
    seoTitle: r.seo_title ?? null,
    seoDescription: r.seo_description ?? null,
    publishedAt: r.publish_at ?? null,
    updatedAt: r.updated_at ?? null,
    author,
  };
}

function mapFaq(r: any): Faq {
  return {
    id: r.id,
    question: r.question,
    answerMarkdown: r.answer_md ?? null,
    category: r.category || "General",
    sortOrder: typeof r.sort_order === "number" ? r.sort_order : 0,
  };
}

function mapEvent(r: any, storageBase: string): EventItem {
  return {
    id: r.id,
    slug: r.slug ?? null,
    title: r.title,
    descriptionMarkdown: r.description_md ?? null,
    startsAt: r.starts_at ?? null,
    endsAt: r.ends_at ?? null,
    timezone: r.timezone ?? null,
    locationText: r.location_text ?? null,
    heroImage: mediaUrl(storageBase, r.og_image_path),
    seoTitle: r.seo_title ?? null,
    seoDescription: r.seo_description ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

/** Fetch + index authors referenced by a set of articles (one round-trip). */
async function loadAuthorsFor(
  supabaseAdmin: any,
  authorIds: Array<string | null | undefined>,
): Promise<Record<string, Author>> {
  const ids = Array.from(new Set(authorIds.filter((x): x is string => !!x)));
  if (ids.length === 0) return {};
  const { data } = await supabaseAdmin.from("v_public_authors").select("*").in("id", ids);
  return Object.fromEntries((data ?? []).map((a: any) => [a.id as string, mapAuthor(a)]));
}

const ARTICLE_PAGE_SIZE = 12;

/**
 * List published articles → v_public_articles, optionally filtered to a public
 * surface ("blog" | "guide"; see surfaceForKind). Sorted newest-first by
 * publish_at. Joins v_public_authors for the byline. Returns `{ articles, total }`.
 */
export const listArticles = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        surface: z.enum(["blog", "guide"]).optional(),
        page: z.number().int().min(0).max(1000).optional(),
      })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<ArticleListResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin
      .from("v_public_site_settings")
      .select("storage_base")
      .maybeSingle();
    const storageBase = stripTrailingSlash(String(s?.storage_base || ""));

    const page = data?.page ?? 0;
    const from = page * ARTICLE_PAGE_SIZE;
    const to = from + ARTICLE_PAGE_SIZE - 1;

    let q = supabaseAdmin.from("v_public_articles").select("*", { count: "exact" });
    if (data?.surface === "guide") q = q.in("kind", GUIDE_KINDS as unknown as string[]);
    else if (data?.surface === "blog") q = q.in("kind", BLOG_KINDS as unknown as string[]);
    q = q.order("publish_at", { ascending: false, nullsFirst: false });

    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);

    const authors = await loadAuthorsFor(
      supabaseAdmin,
      (rows ?? []).map((r: any) => r.author_id),
    );
    return {
      articles: (rows ?? []).map((r: any) =>
        mapArticle(r, storageBase, r.author_id ? (authors[r.author_id] ?? null) : null),
      ),
      total: count ?? (rows ?? []).length,
    };
  });

/**
 * Single published article by slug → v_public_articles, with its byline
 * (v_public_authors) and pinned featured products (v_public_article_products →
 * v_public_inventory). Returns null when the slug isn't a published article.
 */
export const getArticleBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<ArticleDetail | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cfg = await loadCfg(supabaseAdmin);

    const { data: row, error } = await supabaseAdmin
      .from("v_public_articles")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;

    let author: Author | null = null;
    if (row.author_id) {
      const { data: a } = await supabaseAdmin
        .from("v_public_authors")
        .select("*")
        .eq("id", row.author_id as string)
        .maybeSingle();
      if (a) author = mapAuthor(a);
    }

    const article = mapArticle(row, cfg.storageBase, author) as ArticleDetail;

    // Featured products pinned to the post (both sides publicly visible).
    const { data: links } = await supabaseAdmin
      .from("v_public_article_products")
      .select("inventory_item_id,sort_order")
      .eq("article_id", row.id as string)
      .order("sort_order", { ascending: true, nullsFirst: false });
    const itemIds = (links ?? [])
      .map((l: any) => l.inventory_item_id)
      .filter((x: unknown): x is string => !!x);
    let featuredProducts: Product[] = [];
    if (itemIds.length) {
      const { data: prodRows } = await supabaseAdmin
        .from("v_public_inventory")
        .select("*")
        .in("id", itemIds);
      const byId = new Map<string, Product>(
        (prodRows ?? []).map((p: any) => [p.id as string, mapProduct(p, cfg)]),
      );
      // preserve the curated sort_order from the join
      featuredProducts = itemIds.map((id) => byId.get(id)).filter((p): p is Product => !!p);
    }
    article.featuredProducts = featuredProducts;

    return article;
  });

/** Published FAQs → v_public_faqs, ordered by sort_order (then insertion). */
export const listFaqs = createServerFn({ method: "GET" }).handler(async (): Promise<Faq[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("v_public_faqs")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapFaq);
});

/**
 * Published events → v_public_events. `upcomingOnly` (default true) keeps events
 * whose start is in the future OR currently running (ends_at >= now). Ordered by
 * start ascending so the soonest event is first.
 */
export const listEvents = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ upcomingOnly: z.boolean().optional() })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<EventItem[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s } = await supabaseAdmin
      .from("v_public_site_settings")
      .select("storage_base")
      .maybeSingle();
    const storageBase = stripTrailingSlash(String(s?.storage_base || ""));

    let q = supabaseAdmin.from("v_public_events").select("*");
    if (data?.upcomingOnly !== false) {
      // Upcoming = not yet ended (ongoing counts), or no end set but starts in the future.
      const nowIso = new Date().toISOString();
      q = q.or(`ends_at.gte.${nowIso},and(ends_at.is.null,starts_at.gte.${nowIso})`);
    }
    q = q.order("starts_at", { ascending: true, nullsFirst: false });

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => mapEvent(r, storageBase));
  });
