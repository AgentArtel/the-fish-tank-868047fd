-- ============================================================
-- The Fish Tank — PUBLIC READ MODELS  (reference / column contract)
--
-- RECONCILIATION (2026-06-23): the SHIPPED migration named these views
-- `v_public_*` in the default `public` schema (granted to anon), e.g.
--   public_web.public_products       → public.v_public_products
--   public_web.public_product_images → public.v_public_product_images
--   public_web.public_store_location → public.v_public_store_location
--   public_web.site_settings         → public.v_public_site_settings
--   public_web.collections           → public.v_public_collections
--   + content: v_public_articles, v_public_faqs, v_public_events, v_public_redirects
-- The client (client/tft-data.js) calls the v_public_* names with NO schema
-- override. This file stays as the authoritative COLUMN CONTRACT — every view
-- MUST output exactly the camelCase keys below (double-quoted so Postgres
-- preserves case) to match /data/schemas/*.json. Diff the live view DDL
-- against these aliases when verifying parity.
--
-- Views that project the private workspace tables into website-safe shapes.
-- Operational columns (cost, vendor, OCR, workflow) never leave the DB.
-- ============================================================

create schema if not exists public_web;

-- Build a public Storage URL from a public-media path.
-- one-time: alter database postgres set "app.storage_base"
--   = 'https://<ref>.supabase.co/storage/v1/object/public';
create or replace function public_web.storage_url(path text)
returns text language sql immutable as $$
  select case when path is null then null
    else current_setting('app.storage_base', true) || '/public-media/' || path end;
$$;

-- ============================================================
-- 1) public_products  →  schemas/public-product.schema.json
-- ============================================================
create or replace view public_web.public_products as
select
  ii.id::text                                              as id,
  lower(regexp_replace(ii.item_name, '[^a-zA-Z0-9]+', '-', 'g'))
    || '-' || left(ii.id::text, 8)                         as slug,
  ii.item_name                                             as name,
  ii.scientific_name                                       as "scientificName",
  case ii.item_type::text
    when 'fish' then 'fish'
    when 'coral' then 'coral'
    when 'invert' then 'invert'
    else 'supply'                                          -- dry_good, live_rock, equipment, other
  end                                                      as type,
  ii.category, ii.subcategory,
  ii.retail_price                                          as price,
  nullif(ii.compare_at_price, 0)                           as "compareAtPrice",
  'USD'                                                    as currency,
  case ii.availability_status::text
    when 'available' then 'available'
    when 'on_hold'   then 'on_hold'
    when 'sold_out'  then 'sold'
    else 'coming_soon'
  end                                                      as availability,
  ii.is_wysiwyg                                            as "isWysiwyg",     -- set at intake (photo-accuracy promise)
  ii.attrs->>'care_level'                                  as "careLevel",
  ii.attrs->>'reef_safe'                                   as "reefSafe",
  ii.origin_region                                         as "originRegion",
  ii.size,
  -- PDP body: per-specimen blurb first, then the species/SKU evergreen copy.
  nullif(trim(concat_ws(E'\n\n', ii.specimen_notes, p.description)), '')  as description,
  p.care_notes                                             as "careNotes",
  ii.is_house_line                                         as "isHouseLine",
  sl.name                                                  as "tankLocation",
  ii.updated_at                                            as "updatedAt"
  -- NEVER selected: wholesale_cost, vendor_id / vendor names, raw quantities,
  -- pricing_status, internal notes, OCR text, clover ids, non-whitelisted attrs.
from inventory_items ii
left join products p          on p.id = ii.product_id          -- optional; null is fine
left join store_locations sl  on sl.id = ii.location_id
-- ---------- THE PUBLISH GATE ----------
where ii.is_website_ready = true                               -- trigger-maintained: photo + approved price + name
  and ii.availability_status::text in ('available','on_hold','sold_out');  -- sold_out renders as "Sold"

-- images (1 product → N), public-media URLs, daylight/actinic/video view + primary flag
create or replace view public_web.public_product_images as
select
  im.inventory_item_id::text                               as product_id,
  public_web.storage_url(im.storage_path)                  as url,
  im.alt_text                                              as alt,
  im.is_primary                                            as "isPrimary",
  im.media_view::text                                      as view            -- daylight | actinic | video_still | other
from inventory_media im
where im.tag = 'website';

-- ============================================================
-- 2) public_store_location  →  schemas/store-location.schema.json
-- ============================================================
create or replace view public_web.public_store_location as
select
  sl.id::text                                              as id,
  sl.slug, sl.name,
  jsonb_build_object(
    'street', sl.address_line1, 'city', sl.city,
    'region', sl.region, 'postal', sl.postal_code,
    'country', coalesce(sl.country,'US')
  )                                                        as address,
  jsonb_build_object('lat', sl.lat, 'lng', sl.lng)         as geo,
  sl.phone,
  'tel:+1' || regexp_replace(coalesce(sl.phone,''), '\D', '', 'g') as "phoneHref",
  sl.email,
  sl.hours,                                                -- jsonb [{day,open,close}]
  to_jsonb(sl.service_areas)                               as "serviceAreas"
from store_locations sl
where sl.kind = 'retail' and sl.is_active = true;

-- ============================================================
-- 3) site_settings  →  schemas/site-settings.schema.json
-- ============================================================
create or replace view public_web.site_settings as
select s.data || jsonb_build_object(
  'rewardsPercent', (select earn_percent from loyalty_config limit 1)
) as settings
from site_settings s where s.id = true;

-- ============================================================
-- 4) collections  →  schemas/collection.schema.json
-- ============================================================
create or replace view public_web.collections as
select
  c.id::text as id, c.slug, c.title, c.subtitle, c.description,
  c.hero_image as "heroImage", c.mode, c.query,
  (select array_agg(x::text) from unnest(c.product_ids) x) as "productIds",
  c.show_in_mega_menu as "showInMegaMenu", c.sort_order as "sortOrder"
from collections c
where c.is_published = true
order by c.sort_order;

-- ============================================================
-- GRANTs — read-only public access to the projections (INVOKER views)
-- ============================================================
grant usage on schema public_web to anon, authenticated;
grant select on all tables in schema public_web to anon, authenticated;
-- Invoker views: anon's RLS on the base tables still applies, so add anon
-- SELECT policies that permit exactly the gated rows (e.g. inventory_items
-- WHERE is_website_ready, inventory_media WHERE tag='website', published
-- collections, the single site_settings row, active retail store_locations).
-- The view WHERE + explicit column list keep the allow-list narrow.
