# Scope — Public website data contracts & JSON schemas (DB = source of truth)

Date: 2026-06-23 · Author: Claude Code (scoping/design — no app code changed).
Status: **Phase 4 scoping.** DB parts (public views/RLS/edge fns) are **Lovable's lane** — specced
here, *not* applied. Companion: `scope-public-website.md`, `research-public-website-competitors.md`,
`design-public-website-system.md`, `scope-public-customer-accounts.md`.

> **The decoupling boundary is a set of sanitized PUBLIC VIEWS.** The public website is a
> data-driven read consumer; it must never see internal columns (cost, vendor, PII, workflow). The
> clean way to enforce that with Supabase is: **define `public_*` views that select only the
> allowlisted columns, grant SELECT to the `anon` role, and let the public site read them**
> (directly via PostgREST/anon key, or via thin read-only edge functions). The view's column list
> *is* the JSON contract. This keeps the workspace DB as the single source of truth while making it
> structurally impossible to leak an internal field. **Source of truth grounding:** column lists and
> the existing public shape were mapped from `supabase/migrations/` and
> `src/lib/catalog.functions.ts` — see the DB grounding notes inline.

---

## 1. What already exists (don't rebuild)

`getPublicCatalog` (`src/lib/catalog.functions.ts`) already returns a **sanitized, unauthenticated**
catalog. Its current shape is the baseline contract:

```ts
// EXISTING public catalog output (baseline)
{
  items: Array<{
    id: string;                 // inventory_items.id
    item_name: string;
    scientific_name: string | null;
    size: string | null;
    retail_price: number | null;   // only items with retail_price > 0 are returned
    item_type: ItemType;           // fish | coral | invert | dry_good | live_rock | equipment | other
    location_id: string;
    location_name: string | null;
    photo_url: string;             // SIGNED url, 1-hour expiry, from inventory-media bucket
  }>;
  locations: Array<{ id: string; name: string; kind: string; parent_location_id: string | null }>;
}
```

Server-side filters already applied: `availability_status = 'available'` AND `retail_price > 0` AND
`quantity_available > 0`; photo ranked **website > social/live_sale > internal**, signed for 1h. The
public-website contracts below **extend this** (add detail view, care stats, galleries, content), they
do not replace it.

---

## 2. Sanitization allowlist (the never-expose list)

These columns exist on otherwise-public tables and **must never appear in a `public_*` view**:

- **inventory_items:** `wholesale_cost`, `quantity_received/on_hold/sold/lost`, `pricing_status`,
  `live_sale_status`, `needs_photo`, `website_ready_later`, `notes`, `colony_gone`, `received_at`,
  `received_by`, `created_by`. Also the **`attrs.inventory_role`** key (operational:
  for_sale/growout/mother_colony/frag_source/hold) — strip it from the public attrs projection.
- **vendors / vendor_line_items:** everything except possibly `name` — and we recommend **not**
  exposing vendor identity at all (`wholesale_cost`, `vendor_sell_price`, contact info, terms, all
  review/approval/extraction fields).
- **customers / loyalty_ledger / store_credit_ledger:** all PII (`email`, `phone`, names) and all
  balances — never joined to any public surface. (Public accounts read their *own* row only, via
  authed RLS — see `scope-public-customer-accounts.md`.)
- **inventory_media:** rows tagged `internal`; plus `ocr_text`, `notes`, `uploader_id`.
- **content_items:** `notes`, `assigned_to`, `reviewer`, internal workflow status (only
  `status='posted'` rows surface), `source_vendor_batch_id`.

---

## 3. Per-page JSON contracts

### 3.1 Livestock list — `public_catalog_items` (extends the baseline)

Add the few fields the premium card needs (category, public care stats, WYSIWYG flag, availability).

```ts
type PublicCatalogItem = {
  id: string;
  slug: string;                 // NEW: stable public slug, e.g. "rainbow-hammer-coral-ab12"
  item_name: string;
  scientific_name: string | null;
  item_type: "fish" | "coral" | "invert" | "dry_good" | "live_rock" | "equipment" | "other";
  category: string | null;      // inventory_items.category
  subcategory: string | null;
  size: string | null;
  retail_price: number | null;
  availability: "available" | "on_hold" | "sold_out";   // mapped from availability_status
  is_wysiwyg: boolean;          // NEW: derived — qty 1 + has website photo of THIS specimen
  location_name: string | null; // system/tank display name only (not internal code)
  photo_url: string;            // signed, website-tag preferred
  care_stats: PublicCareStats;  // see §4 — per-type, public keys only
};
```

### 3.2 Livestock detail — `public_catalog_item_detail`

```ts
type PublicCatalogItemDetail = PublicCatalogItem & {
  description: string | null;   // curated public description (NOT internal notes — see open Q)
  origin_region: string | null;
  gallery: Array<{
    url: string;                // signed
    alt: string | null;
    light: "blue" | "white" | "unknown";   // NEW: surface blue+white-light per research §design
    is_primary: boolean;
  }>;
  care_stats: PublicCareStats;          // full per-type set (§4)
  related?: PublicCatalogItem[];        // same category/genus
};
```

### 3.3 Care stats (per item type) — see §4 for the field map.

### 3.4 Care guide / article — `public_articles` (blog/education SEO engine)

Source: `content_items` filtered to `status = 'posted'` (and `content_type IN ('blog','educational',
'announcement')`), joined to `content_media → media_assets` for imagery.

```ts
type PublicArticle = {
  id: string;
  slug: string;                 // NEW
  title: string;
  kind: "blog" | "educational" | "announcement";   // from content_type
  excerpt: string | null;       // short_caption
  body_html: string;            // rendered from caption/body (see open Q on body field)
  hero_image_url: string | null;
  gallery: Array<{ url: string; alt: string | null }>;
  cta: string | null;           // call_to_action
  hashtags: string[];           // tags → on-page topic chips / SEO
  published_at: string;         // posted_date
  // optional cross-links the model already supports:
  related_product_id?: string | null;   // content_items.product_id → link to a live listing
  social_links?: Array<{ platform: string; url: string }>; // content_platforms.post_url
};
```

### 3.5 System / location — `public_systems`

Source: `store_locations` (active only). Public shows friendly **system/tank** grouping for catalog
filtering + "browse by tank" — **never** internal codes/notes.

```ts
type PublicSystem = {
  id: string;
  slug: string;                 // store_locations.slug
  name: string;                 // friendly name only
  kind: string;                 // display_tank | coral_system | fish_system | frag_tank | ...
  parent_id: string | null;     // hierarchy for nested filters
  photo_url: string | null;     // store_location_media.is_primary (public_url)
  item_count?: number;          // computed: available items in this system
};
```

### 3.6 Home / featured — composition, not a new table

Home is assembled from existing contracts: latest `public_catalog_items` (order by recency), a
curated WYSIWYG rail (`is_wysiwyg = true`), latest `public_articles`, and static marketing copy. A
small **`public_featured` table** (Lovable's lane) can let staff pin specific items/articles to the
hero without code — `{ id, kind: 'item'|'article'|'banner', ref_id, sort_order, active, starts_at,
ends_at }`. Optional; v1 can derive featured from recency.

### 3.7 Services / About — static or lightweight CMS

Services (maintenance, custom builds, quarantine, trade-in) and About are **static content** in v1
(no DB). If staff need to edit them, a tiny `public_pages` table (`slug, title, body_html, updated_at`)
is the minimal CMS — but recommend static MDX for v1 to avoid scope creep.

### 3.8 Live sale / auctions (Phase 4+) — proposed new tables

Designed so a **Model A drop** ships first and a **Model B timed auction** layers on without
reshaping inventory (see `research-...-competitors.md` §5). New tables (Lovable's lane, future):

```ts
// public_live_events  — a scheduled drop/auction window
type PublicLiveEvent = {
  id: string; slug: string; title: string;
  mode: "drop" | "auction";          // Model A vs Model B
  starts_at: string; ends_at: string | null;
  status: "scheduled" | "live" | "ended";
  stream_url: string | null;          // optional FB/YouTube/Whatnot cross-promo
  banner_url: string | null;
};

// public_live_lots  — an item in an event (FK to inventory_items)
type PublicLiveLot = {
  id: string; event_id: string; inventory_item_id: string;
  lot_number: number;
  // drop mode:
  drop_price: number | null; released_at: string | null; status: "upcoming" | "released" | "sold";
  // auction mode:
  start_price: number | null; current_bid: number | null; reserve_met?: boolean;
  bid_count: number; ends_at: string | null;      // soft-close (anti-snipe) extends this
};

// public_bids  — transparent bid history (auction integrity; combats shill-bidding)
type PublicBid = { id: string; lot_id: string; bidder_handle: string; amount: number; placed_at: string };
```

Anti-snipe (popcorn/+Xs) and proxy/max-bid logic live in an **edge function** (real-time, external-
facing — Rule 7), never an app server fn. Detailed in a future `scope-live-auctions.md`.

### 3.9 Account / wishlist (Phase 4) — see `scope-public-customer-accounts.md`

`public_account` (self-read), `wishlist_items`, `stock_alerts`, and Reef-Credit balance (from the
existing `loyalty_ledger`) are specced in that doc; cross-referenced here so the data map is complete.

---

## 4. `attrs` → public care-stats map (per item type)

`inventory_items.attrs` is schema-on-read (defined in `src/lib/item-type-attrs.ts`). Public projection
exposes only **husbandry** keys; strips operational ones. Render as the LiveAquaria-style "Quick Stats"
row (design doc §5 `CareStats`).

| Item type | Public keys (→ care stats) | Stripped (internal) |
|---|---|---|
| **coral** | `type` (SPS/LPS/soft/zoanthid/mushroom/anemone), `lighting` (low/med/high), `flow`, `placement`, `aggression`, `frag_colony_size`, `aquacultured` | **`inventory_role`** (for_sale/growout/mother_colony/...) |
| **fish** | `care_level`, `temperament`, `diet`, `min_tank_size`, `captive_bred`, `adult_size`, `swim_zone`, `reef_safe` | — |
| **invert** | `care_level`, `temperament`, `diet`, `min_tank_size`, `captive_bred`, `kind`, `reef_safe` | — |
| **live_rock** | `type`, `weight`, `cured` | — |
| **dry_good** | `brand`, `model_sku`, `weight` | `upc` (optional), supplier refs |
| **equipment** | `brand`, `model`, `wattage`, `voltage`, `warranty`, `condition` | `serial` |
| **other** | (none rendered) | `notes` |

```ts
// Discriminated union the card/detail consume:
type PublicCareStats =
  | { type: "coral"; coral_type?: string; lighting?: "low"|"medium"|"high"; flow?: "low"|"medium"|"high";
      placement?: "bottom"|"mid"|"top"|"any"; aggression?: "low"|"medium"|"high";
      frag_colony_size?: string; aquacultured?: boolean }
  | { type: "fish"; care_level?: string; temperament?: string; diet?: string; min_tank_size?: number;
      captive_bred?: boolean; adult_size?: number; swim_zone?: string; reef_safe?: string }
  | { type: "invert"; care_level?: string; temperament?: string; diet?: string; min_tank_size?: number;
      captive_bred?: boolean; kind?: string; reef_safe?: string }
  | { type: "live_rock"; rock_type?: string; weight?: number; cured?: boolean }
  | { type: "dry_good"; brand?: string; model_sku?: string; weight?: number }
  | { type: "equipment"; brand?: string; model?: string; wattage?: number; voltage?: number;
      warranty?: number; condition?: string }
  | { type: "other" };
```

**Enhancement to consider (matches Tidal Gardens/LiveAquaria):** add an explicit **PAR band**
(Low 30–50 / Med 50–150 / High 150+) and **feeding/acclimation** text to the coral attrs schema so the
public care stats are best-in-class. That's an `item-type-attrs.ts` change (Claude's lane) — small,
additive, schema-on-read, no migration. Flag for sign-off.

---

## 5. Media contract

- **Source:** `inventory_media` (per item) and `media_assets`/`content_media` (articles),
  `store_location_media` (systems). Buckets are **private** (`inventory-media`, `media`); the public
  site must receive **signed URLs** (current catalog signs for 1h) or we publish through a CDN/public
  bucket for marketing assets.
- **Ranking:** website > social > live_sale; never `internal`. (Already implemented for catalog.)
- **Blue vs white light:** the `media` rows don't currently carry a light-temperature flag. To deliver
  the research-recommended blue+white-light WYSIWYG galleries, add a nullable
  **`light_temp text` (`'blue'|'white'`)** to `inventory_media` (Lovable's lane) — until then,
  `gallery[].light = "unknown"`. Flag for sign-off.
- **Caching note:** 1h signed URLs are fine for a logged-in app but awkward for a public CDN/SEO page
  (URLs expire, OG images break). **Recommend a public read-through image proxy or a public marketing
  bucket** for website-tagged media so URLs are stable and cacheable. Decision needed (open Q).

---

## 6. Where the contracts run (architecture)

Per Engineering Rule 7, **public/external-facing reads belong in Supabase, not the app Worker.** The
decoupled site should read either:
1. **PostgREST on the `public_*` views** with the anon key + RLS (simplest, fully data-driven), or
2. **Read-only edge functions** wrapping those views when we need signing/shaping (e.g. signed image
   URLs, search ranking, the live-auction real-time logic).

The existing app-side `getPublicCatalog` is an interim shim; the decoupled site should migrate to the
view/edge-fn boundary so no public traffic hits the Worker's subrequest/CPU budget. (This aligns with
the broader app→edge migration in `scope-edge-function-migration.md`.)

---

## 7. Open questions for the owner / Lovable

1. **Public description source.** Listings need a *curated* public blurb. Internal `notes` are not
   safe to publish. Add a `public_description` column to `inventory_items`, or reuse `content_items`
   tied via `product_id`? (Recommend a dedicated `public_description` column.)
2. **Slugs.** OK to add `slug` columns (items, articles, systems) for SEO-friendly URLs? (Recommended.)
3. **Image delivery.** Public marketing bucket / CDN vs. signed-URL proxy for stable, cacheable,
   OG-friendly image URLs? (Recommend a public marketing bucket for website-tagged media.)
4. **Blue/white-light flag + PAR band** additions (small schema + attrs changes) — approve to make
   care stats best-in-class?
5. **Anon PostgREST vs. edge functions** as the public read boundary — preference? (Recommend views +
   edge fns for anything signed/real-time.)
6. **Vendor identity:** confirm we expose **no** vendor/source info publicly (recommended).
</content>
