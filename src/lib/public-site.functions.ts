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
  updatedAt: string | null;
};

export type ProductImage = {
  url: string;
  alt: string;
  isPrimary: boolean;
  view: string;
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
    availability: AVAIL_MAP[r.availability_status] || "coming_soon",
    isWysiwyg: !!r.is_wysiwyg,
    isHouseLine: !!r.is_house_line,
    careLevel: a.care_level ?? null,
    reefSafe: a.reef_safe ?? null,
    originRegion,
    size: a.size ?? null,
    description: r.specimen_notes ?? null,
    careNotes: null, // products.care_notes not projected onto the view yet
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

  return {
    siteTitle: s?.site_title ?? null,
    tagline: s?.tagline ?? null,
    defaultOgImage: mediaUrl(storageBase, s?.default_og_image_path),
    storageBase,
    social: s?.social ?? null,
    announcement: ann ?? null,
    announcements,
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
