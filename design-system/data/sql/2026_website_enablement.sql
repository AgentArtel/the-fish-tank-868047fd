-- ============================================================
-- The Fish Tank — WEBSITE ENABLEMENT MIGRATION  (reference/aligned sketch)
-- The BACKEND (Lovable agent) owns the canonical single migration; this is
-- the agreed shape so the design-system contract stays in sync. Decisions
-- locked with the team are reflected below.
--
-- RLS uses your helpers: is_admin_or_dev(), is_floor_staff_or_above().
-- Active roles only: admin · dev · floor_staff.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) inventory_items — new dedicated columns
-- ------------------------------------------------------------
alter table inventory_items
  add column if not exists compare_at_price numeric(10,2),      -- "regular" price; sale shown when > retail_price
  add column if not exists is_wysiwyg       boolean not null default false,  -- photo-accuracy promise, set at intake by floor staff; drives badge + filter
  add column if not exists specimen_notes   text,               -- per-specimen blurb ("3 heads, fully encrusted"); long-form species copy lives on products.description
  add column if not exists is_house_line    boolean not null default false,  -- TRUE = The Fish Tank in-house line (public brand label). NOT a wholesale vendor.
  add column if not exists product_id       uuid references products(id) on delete set null,  -- OPTIONAL link to curated species copy; null is fine (trade-in / discovery flows)
  add column if not exists is_website_ready boolean not null default false;  -- trigger-maintained publish gate (see below)

create index if not exists idx_inventory_items_product_id on inventory_items(product_id);
create index if not exists idx_inventory_items_website_ready on inventory_items(is_website_ready) where is_website_ready;

comment on column inventory_items.compare_at_price is 'Public compare-at/regular price; website shows % OFF + strike when > retail_price.';
comment on column inventory_items.is_wysiwyg is 'What-you-see-is-what-you-get: the photographed specimen is the one that ships. Set at receiving.';
comment on column inventory_items.specimen_notes is 'Short per-specimen blurb. Species/SKU evergreen copy lives on products.description.';
comment on column inventory_items.is_house_line is 'Public in-house brand flag. Never store wholesale vendor identity here.';
comment on column inventory_items.is_website_ready is 'Trigger-maintained publish gate; single source of truth for "why isn''t this live yet".';

-- care_level + reef_safe stay in attrs (per-item-type, schema-driven via item-type-attrs.ts):
--   attrs->>'care_level', attrs->>'reef_safe'.

-- ------------------------------------------------------------
-- 1b) publish-gate trigger: photo + approved price + name (+ a description or category)
-- ------------------------------------------------------------
create or replace function set_inventory_is_website_ready()
returns trigger language plpgsql as $$
begin
  new.is_website_ready :=
        new.needs_photo = false
    and new.item_name is not null
    and new.retail_price is not null
    and new.pricing_status::text = 'approved'
    and (new.specimen_notes is not null or new.category is not null
         or exists (select 1 from products p where p.id = new.product_id and p.description is not null))
    and exists (select 1 from inventory_media m
                where m.inventory_item_id = new.id and m.tag = 'website');
  return new;
end $$;

drop trigger if exists trg_inventory_website_ready on inventory_items;
create trigger trg_inventory_website_ready
  before insert or update on inventory_items
  for each row execute function set_inventory_is_website_ready();
-- NOTE: also recompute when inventory_media rows are added/removed (AFTER trigger on
-- inventory_media that UPDATEs the parent item) so the gate reacts to photo changes.

-- ------------------------------------------------------------
-- 2) inventory_media — photo VIEW dimension + primary flag
--    tag stays usage/visibility (internal·social·website·live_sale); `website`
--    is the publish flag. media_view is an orthogonal rendering hint.
-- ------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'inventory_media_view') then
    create type inventory_media_view as enum ('daylight','actinic','video_still','other');
  end if;
end $$;

alter table inventory_media
  add column if not exists media_view inventory_media_view not null default 'daylight',
  add column if not exists is_primary boolean not null default false;

create unique index if not exists uq_inventory_media_primary
  on inventory_media(inventory_item_id) where is_primary;

-- Storage: website photos are served from a PUBLIC `public-media` bucket. The
-- "approve for website" action copies the chosen photo from the private
-- inventory-media bucket into public-media (keeps `internal` photos private and
-- gives OG/social scrapers cacheable URLs). Create the bucket via Supabase
-- Storage; storage_path on tag='website' rows points into public-media.

-- ------------------------------------------------------------
-- 3) store_locations — NAP + hours (not modeled yet)
-- ------------------------------------------------------------
alter table store_locations
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city          text,
  add column if not exists region        text,          -- state, e.g. 'UT'
  add column if not exists postal_code   text,
  add column if not exists country       text default 'US',
  add column if not exists phone         text,
  add column if not exists email         text,
  add column if not exists lat           numeric(9,6),
  add column if not exists lng           numeric(9,6),
  add column if not exists hours         jsonb default '[]'::jsonb,   -- [{day,open,close}] 24h "HH:MM"
  add column if not exists service_areas text[]   default '{}';

-- seed the Sandy showroom NAP/hours
update store_locations set
  address_line1 = '8371 700 W',
  city = 'Sandy', region = 'UT', postal_code = '84070', country = 'US',
  phone = '(801) 887-7000', email = 'hello@thefishtank.com',
  lat = 40.589700, lng = -111.901300,
  service_areas = array['Sandy','Salt Lake City','Draper','South Jordan','West Jordan','Midvale','Lehi','Murray','Cottonwood Heights'],
  hours = '[
    {"day":"Sun","open":"11:00","close":"16:00"},
    {"day":"Mon","open":"11:30","close":"20:00"},
    {"day":"Tue","open":"11:30","close":"20:00"},
    {"day":"Wed","open":"11:30","close":"20:00"},
    {"day":"Thu","open":"11:30","close":"20:00"},
    {"day":"Fri","open":"11:30","close":"20:00"},
    {"day":"Sat","open":"11:00","close":"18:00"}
  ]'::jsonb
where kind = 'retail' and slug = 'sandy';   -- adjust slug if different

-- ------------------------------------------------------------
-- 4) collections — curated / dynamic product groupings
-- ------------------------------------------------------------
create table if not exists collections (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  subtitle     text,
  description   text,
  hero_image   text,
  mode         text not null default 'dynamic' check (mode in ('dynamic','manual')),
  query        jsonb,            -- for dynamic: {type,category,subcategory,hasCompareAt,careLevel,sort}
  product_ids  uuid[],           -- for manual: ordered, pinned
  show_in_mega_menu boolean not null default false,
  sort_order   int not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5) site_settings — single-row public config (NAP source, banner, nav)
-- ------------------------------------------------------------
create table if not exists site_settings (
  id         boolean primary key default true check (id),   -- enforces a single row
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into site_settings (id, data) values (true, jsonb_build_object(
  'name','The Fish Tank',
  'tagline','Utah''s Saltwater Fish & Coral Store',
  'primaryLocationSlug','sandy',
  'freeShippingThreshold',250,
  'arrivalGuaranteeDays',5,
  'announcements', jsonb_build_array(
    '🛡️  5-Day Reef-Safe Arrival Guarantee',
    '📦  Free FedEx Overnight on livestock orders over $250',
    '🌟  Earn 5% back in Reef Rewards on every order',
    '🏬  Visit our Sandy, Utah showroom — 8371 700 W'
  )
)) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 6) RLS + GRANTs  (tighten to match is_admin_or_dev / is_floor_staff_or_above)
-- ------------------------------------------------------------
alter table collections   enable row level security;
alter table site_settings enable row level security;

-- public read
create policy collections_public_read on collections
  for select to anon, authenticated using (is_published = true);
create policy site_settings_public_read on site_settings
  for select to anon, authenticated using (true);

-- staff/admin write (adjust helper to your preference)
create policy collections_admin_write on collections
  for all using (is_admin_or_dev()) with check (is_admin_or_dev());
create policy site_settings_admin_write on site_settings
  for all using (is_admin_or_dev()) with check (is_admin_or_dev());

grant select on collections, site_settings to anon, authenticated;

-- Read models are INVOKER views, so anon also needs SELECT policies on the
-- gated base rows: inventory_items WHERE is_website_ready, inventory_media
-- WHERE tag='website', active retail store_locations. Add those to match
-- existing RLS patterns.

commit;

-- After this migration, (re)create the read models in public_read_models.sql
-- (public_products, public_product_images, public_store_location, site_settings,
--  collections views) which depend on the columns/tables above.
