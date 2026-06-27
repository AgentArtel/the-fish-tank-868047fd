# The Fish Tank — Website Data Model & Supabase Mapping

> How the **public website** is populated from the **workspace app's Supabase** so it
> **auto-updates** as staff manage inventory. This is the contract between backend and
> front-end. The website is fully **decoupled and data-driven** — it renders only what the
> read models below return; it never talks to the operational tables directly.

---

## 1. Architecture: source of truth → curation gate → public read model → site

```
┌─────────────────────────────────────────┐
│  WORKSPACE APP  (Supabase, private)      │   operational truth, staff-only
│  inventory_items · products · vendors    │
│  inventory_media · media_assets          │
│  store_locations · customers · loyalty_* │
└───────────────┬─────────────────────────┘
                │  curation gate (flags below) + Postgres VIEWS / RPC
                ▼
┌─────────────────────────────────────────┐
│  PUBLIC READ MODELS  (Supabase, RLS = anon read)   │
│  public_products      → /products, PDP             │
│  public_collections   → category & merch pages     │
│  public_store_location→ Visit Us, footer, JSON-LD  │
│  site_settings        → NAP, hours, announcements   │
└───────────────┬─────────────────────────┘
                │  PostgREST / Edge Function / supabase-js  (+ Realtime)
                ▼
┌─────────────────────────────────────────┐
│  WEBSITE  (decoupled front-end)          │   this UI kit
│  consumes JSON matching /data/schemas/   │
└─────────────────────────────────────────┘
```

**Why read models, not raw tables:** the operational tables hold cost, vendor, OCR, and
workflow columns that must never reach the public. A thin set of **Postgres views** (or
PostgREST RPC functions) projects only public-safe, website-shaped fields. The site binds to
those. Change a price or mark an item sold in the workspace → the view reflects it → the site
updates live (Supabase Realtime). One write path, many read surfaces.

---

## 2. The curation gate — what goes live

The rule: **a listing is public only when it has a real photo AND the core info a shopper
needs.** That's captured in one trigger-maintained flag, `inventory_items.is_website_ready`,
so the view filters on a single column and staff get one source of truth for "why isn't this
live yet."

`is_website_ready = true` when ALL hold:

| Requirement | Source check |
|-------------|--------------|
| **Has a website photo** | ≥1 `inventory_media` row with `tag = 'website'` (the publish tag) AND `needs_photo = false` |
| **Has a name** | `item_name` not null |
| **Has an approved price** | `retail_price` not null AND `pricing_status = 'approved'` |
| **Has info** | `specimen_notes` ∨ `category` ∨ linked `products.description` not null |

Visible-state filter on top: `availability_status ∈ (available, on_hold, sold_out)` — `sold_out`
renders as "Sold"; `incoming/quarantine/needs_id/not_for_sale/dead_lost` stay hidden. **WYSIWYG**
is a real boolean (`is_wysiwyg`) set at intake — it drives the badge/filter and is independent of
whether long-form copy exists.

---

## 3. Read model: `public_products`  →  `/data/schemas/public-product.schema.json`

The canonical website product shape. Built primarily from `inventory_items` (one-of-a-kind
coral colonies/frags) joined to `products` (curated species copy) and media.

| Website field (`public_products`) | Source column | Transform / notes |
|-----------------------------------|---------------|-------------------|
| `id`            | `inventory_items.id` (uuid) | stable key |
| `slug`          | derived | `slugify(item_name) + '-' + short(id)` |
| `name`          | `item_name` (fallback `products.name`) | |
| `scientificName`| `scientific_name` | italic on site |
| `type`          | `item_type` enum | `fish`/`coral`/`invert` map 1:1; `dry_good`/`live_rock`/`equipment`/`other` → `supply` |
| `category`/`subcategory` | `category`, `subcategory` | drives nav/collections |
| `price`         | `retail_price` | USD dollars |
| `compareAtPrice`| `compare_at_price` (dedicated column) | only when > price |
| `availability`  | `availability_status` | `available`→in stock, `on_hold`→"On hold", `sold_out`→"Sold"; others hidden by the gate |
| `isWysiwyg`     | `is_wysiwyg` (dedicated bool) | photo-accuracy promise, set at intake; drives badge + filter |
| `careLevel`     | `attrs.care_level` | Beginner/Intermediate/Expert (per-item-type via item-type-attrs.ts) |
| `reefSafe`      | `attrs.reef_safe` | Safe / Caution / Not reef safe |
| `originRegion`  | `origin_region` | public-safe sourcing label (e.g. "Aquacultured") |
| `size`          | `size` | e.g. `3"`, `5 polyps` |
| `description`   | `specimen_notes` ++ `products.description` | per-specimen blurb first, then species/SKU evergreen copy |
| `careNotes`     | `products.care_notes` | PDP care block |
| `isHouseLine`   | `is_house_line` (dedicated bool) | public in-house brand flag (never a wholesale vendor) |
| `tankLocation`  | `store_locations.name` via `location_id` | "Sandy showroom" |
| `images[]`      | `inventory_media` where `tag='website'`, served from the public `public-media` bucket | `{url, alt, isPrimary, view}`; `view` from `media_view` (`daylight`/`actinic`/`video_still`/`other`) |
| `badges[]`      | derived (client) | `Sale` (compareAt), `Aquacultured`, `WYSIWYG` (when `isWysiwyg`) |
| `updatedAt`     | `updated_at` | cache key / realtime |

**Never exposed (admin / internal only):** `wholesale_cost`, `vendor_id` and **all vendor
names/identity**, raw `quantity_*`, OCR text, `pricing_status`, internal `notes`, clover ids, and
anything under `attrs` not explicitly whitelisted. The public read model is an **invoker view**
with an explicit column allow-list, so these are never selected and can't reach the front-end.

---

## 4. Read model: `public_collections`  →  `/data/schemas/collection.schema.json`

Curated/auto groupings used by the mega-menu and merch rows. A collection is either
**dynamic** (a query: `type=coral & subcategory=SPS`) or **manual** (a pinned id list).

- **Weekly Specials** = dynamic, `compareAtPrice IS NOT NULL`.
- **New Arrivals** = dynamic, `sort = newest`.
- **SPS / LPS / Soft / Zoanthids** = dynamic on `subcategory`.
- Manual collections store an ordered `productIds[]`.
- (**WYSIWYG Corals** becomes a dynamic `isWysiwyg = true` collection once that workflow ships.)

---

## 5. Read model: `public_store_location` + `site_settings`

`/data/schemas/store-location.schema.json` and `/data/schemas/site-settings.schema.json`.

- `public_store_location` ← `store_locations` (where `kind='retail'`, `is_active`), plus
  `store_location_media` for photos. Powers Visit Us, footer, and the **LocalBusiness JSON-LD**.
- `site_settings` is a single-row config table (NAP, hours array, announcement bar, service
  areas, free-shipping threshold, rewards %). Editable by staff; drives every NAP instance on
  the site so **name/address/phone stay identical everywhere** (the #1 local-SEO signal).

**Live NAP / hours (current):**
```
The Fish Tank
8371 700 W, Sandy, UT 84070
(801) 887-7000
Mon–Fri 11:30am–8pm · Sat 11am–6pm · Sun 11am–4pm
```

---

## 6. Freshness strategy (how "auto-update" actually works)

The site is a **Vite + React SPA on Lovable** (built locally with Claude Code), so freshness is
client-side: **TanStack Query + Supabase Realtime**, not server revalidation.

| Surface | Mechanism | Why |
|---------|-----------|-----|
| Product grids, PDP | **TanStack Query** fetch from the views, `staleTime ~60s` | instant nav, cached |
| Stock dot / "Sold" / price | **Supabase Realtime** on `inventory_items` → `invalidateQueries` | live sell-through without reload |
| Live Sale page | **Realtime** channel (`live_sale_status`) | real-time during events |
| site_settings (hours, banner) | fetched once per session; refetch on focus | rarely changes |
| SEO HTML (home, collections, PDP, Visit Us) | **prerender / SSG** at build (or a prerender step) | crawlable HTML for local search |

Edit a price or mark an item sold in the workspace → the view reflects it → the Realtime
subscription fires → React Query refetches → the card updates live. See `INTEGRATION.md` for the
exact Lovable wiring.

Client: `@supabase/supabase-js` against the **views** with anon RLS (read-only). The front-end
injects its client into `client/tft-data.js` via `initTftData()` (the data layer itself takes no
npm dependency). **Shipped view names** (default `public` schema, granted to anon):
`v_public_products`, `v_public_product_images`, `v_public_store_location`, `v_public_site_settings`,
`v_public_collections`, `v_public_articles`, `v_public_faqs`, `v_public_events`, `v_public_redirects`.

---

## 7. Files in this folder

- `DATA_MODEL.md` — this document (architecture, curation gate, column mapping, freshness)
- `BACKEND_BRIEF.md` — paste-ready brief for the Lovable/Supabase agent: catalog decisions (locked) + Part 2 content/SEO scope
- `LOCAL_SEO_CHECKLIST.md` — off-site local-authority playbook: Google Business Profile setup, reviews, NAP citations, local backlinks, monitoring
- `OPEN_ITEMS.md` — non-blocking items awaiting backend confirmation (column casing, storage base, anon policies, view DDL diff)
- `WEBSITE_BUILD_SPEC.md` — page-by-page site build plan wired to `tft-data.js`; seeded/placeholder data italicized
- `FIX_BEFORE_LAUNCH.md` — consolidated register of seeded/placeholder data to replace before go-live
- `INTEGRATION.md` — front-end wiring for the Lovable stack: Supabase setup, TanStack Query + Realtime, SPA SEO/prerender, JSON-LD
- `sql/public_read_models.sql` — Postgres views implementing the read models + curation gate
- `sql/2026_website_enablement.sql` — catalog/NAP/collections migration sketch
- `sql/2026_content_seo.sql` — content & SEO migration sketch (articles, guides, FAQs, authors, events, redirects + read models)
- `client/tft-data.js` — framework-agnostic data-access layer (supabase-js) returning schema-shaped objects
- `schemas/*.json` — the JSON contracts (product, collection, store-location, site-settings, article, author, faq, event)
- `samples/*.json` — example payloads that validate against the schemas and match what the
  UI kit renders. The kit's `ui_kits/website/data.js` is a denormalized mirror of these.

---

## 8. Content & SEO surfaces — local authority

The catalog ranks for *transactional* intent; **content ranks for everything else** and is what
establishes The Fish Tank as the Salt Lake Valley's reef authority (Google's E-E-A-T +
topical-authority signals strongly favor an active, expert local business). Same architecture
as the catalog: source tables → published-only gate → INVOKER read-model views in `public_web`
→ schema-shaped JSON. Tables + views are sketched in `sql/2026_content_seo.sql`.

**Content types (all one pattern):**

| Surface | Table → view | Schema | SEO payoff |
|---|---|---|---|
| Blog / news (`kind=post`) | `articles` → `public_articles` | `article` | freshness, long-tail, internal links to catalog |
| Care / help guides (`kind=guide`) | `articles` | `article` | **the topical-authority engine** — evergreen "how to" that earns links + ranks |
| Landing / topic pages (`kind=page`) | `articles` | `article` | service-area & category pages ("saltwater fish in Salt Lake City") |
| Authors | `content_authors` → joined into article | `author` | **E-E-A-T** — real bylines + credentials (`Person` JSON-LD) |
| FAQs | `faqs` → `public_faqs` / inline on articles | `faq` | `FAQPage` rich results; deflects support |
| Events | `events` → `public_events` | `event` | `Event` JSON-LD; frag swaps / live sales = strong local signal |
| Testimonials | `testimonials` | — | social proof (display only — see review note) |
| Redirects | `redirects` → `public_redirects` | — | preserve link equity on slug changes |

**Structured data (JSON-LD) per page** — the machine-readable layer crawlers reward:
`LocalBusiness`/`PetStore` (site), `Product`+`Offer` (PDP), `BreadcrumbList` (everywhere),
`Article`+`Person` (posts/guides), `FAQPage` (FAQ blocks), `Event` (events), `ItemList`
(collections). Build them from the read-model JSON.

> **Review markup caution:** don't emit self-serving `Review`/`AggregateRating` JSON-LD on your
> own `LocalBusiness` — Google ignores/penalizes it. Display testimonials for humans; let star
> ratings come from your Google Business Profile, not injected markup.

**Technical SEO the front-end must do (not DB):** server-rendered/prerendered HTML for every
indexable route (a Vite SPA alone won't rank); one canonical NAP everywhere (from
`site_settings`/`store_locations`); `sitemap.xml` generated from published slugs (products +
articles + events + collections); `robots.txt`; canonical + OG/Twitter tags per route via
`react-helmet-async`; honor `redirects` (301); fast Core Web Vitals; mobile-first.

**Local-authority playbook (ops, beyond the site):** claim & fully fill the Google Business
Profile (categories, hours, photos, Q&A, posts); keep NAP identical across all citations; earn
reviews; publish guides consistently; get local backlinks (clubs, suppliers, local press). The
site's content engine feeds all of it.
