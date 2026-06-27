-- ============================================================
-- The Fish Tank — CONTENT & SEO MIGRATION  (reference/aligned sketch)
-- Local-authority content: blog posts, care/help guides, landing pages,
-- FAQs, authors (E-E-A-T), events, testimonials, redirects.
-- Patterns: INVOKER read-model views in public_web, published-only gate,
-- RLS via is_admin_or_dev(). The Lovable agent owns the canonical migration.
--
-- LOCKED with backend (2026-06-23):
--   • Copy lifecycles separate: articles.body_md (editorial) · products.description
--     (species/PDP evergreen) · inventory_items.specimen_notes (per-specimen).
--   • related products = JOIN TABLE article_products (FK integrity + reverse lookup).
--   • Media: same public `public-media` bucket; subfolders articles/<id>/, products/<id>/, inventory/<id>/.
--   • Authoring inside the workspace app: admin/dev write only; floor staff none.
--   • status workflow draft → in_review → published → archived; only admin/dev may publish
--     (guard trigger). Scheduled publish via publish_at; public gate = published AND publish_at <= now().
--   • events: single-occurrence + nullable series_id self-FK (no RRULE).
--   • redirects: from_path unique; NO hits counter (use web logs / Search Console).
--   • testimonials: DISPLAY ONLY — never wire into Review/AggregateRating JSON-LD.
-- ============================================================

begin;

-- ------------------------------------------------------------ enums
do $$ begin
  if not exists (select 1 from pg_type where typname='content_kind') then
    create type content_kind as enum ('post','guide','page');
  end if;
  if not exists (select 1 from pg_type where typname='content_status') then
    create type content_status as enum ('draft','in_review','published','archived');
  end if;
end $$;

-- ------------------------------------------------------------ authors (E-E-A-T)
create table if not exists content_authors (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  profile_id  uuid references profiles(id) on delete set null,  -- staff author; null = guest contributor
  display_name text not null,
  title       text,                       -- role
  credentials text,                        -- e.g. "12 yrs reefkeeping, MASNA member"
  bio         text,
  avatar_path text,                         -- public-media path
  links       jsonb not null default '{}'::jsonb,   -- {instagram,youtube,website}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ articles (posts + guides + pages)
create table if not exists articles (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  kind          content_kind not null default 'post',
  status        content_status not null default 'draft',
  title         text not null,
  excerpt       text,
  body_md       text not null default '',
  hero_path     text,                       -- public-media path
  hero_alt      text,
  author_id     uuid references content_authors(id) on delete set null,
  topics        text[] not null default '{}',
  tags          text[] not null default '{}',
  reading_minutes int,
  seo           jsonb not null default '{}'::jsonb,    -- {title,description,ogImage,canonical,noindex}
  publish_at    timestamptz,                 -- scheduled publish; gate uses this
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_articles_kind_status on articles(kind, status);
create index if not exists idx_articles_publish_at on articles(publish_at desc);
create index if not exists idx_articles_topics on articles using gin(topics);

-- guard: only admin/dev may move an article into 'published' (mirror guard_inventory_pricing_approval)
create or replace function guard_article_publish()
returns trigger language plpgsql as $$
begin
  if new.status = 'published' and coalesce(old.status,'draft') <> 'published'
     and not is_admin_or_dev() then
    raise exception 'Only admin/dev may publish articles';
  end if;
  return new;
end $$;
drop trigger if exists trg_article_publish on articles;
create trigger trg_article_publish before insert or update on articles
  for each row execute function guard_article_publish();

-- ------------------------------------------------------------ article ↔ product join (FK integrity + reverse lookup)
create table if not exists article_products (
  article_id        uuid not null references articles(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  sort_order        int not null default 0,
  primary key (article_id, inventory_item_id)
);
create index if not exists idx_article_products_item on article_products(inventory_item_id);  -- "featured in" reverse lookup

-- ------------------------------------------------------------ faqs
create table if not exists faqs (
  id           uuid primary key default gen_random_uuid(),
  question     text not null,
  answer_md    text not null,
  category     text,
  sort_order   int not null default 0,
  article_id   uuid references articles(id) on delete cascade,
  product_id   uuid references inventory_items(id) on delete cascade,
  is_published boolean not null default true,
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------ events (single-occurrence + optional series)
create table if not exists events (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  series_id     uuid references events(id) on delete set null,  -- recurring class = N rows linked to one parent
  title         text not null,
  description   text,
  hero_path     text,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  is_all_day    boolean not null default false,
  location_name text,
  url           text,
  status        content_status not null default 'draft',
  publish_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_events_starts_at on events(starts_at);

-- ------------------------------------------------------------ testimonials (DISPLAY ONLY — no review JSON-LD)
create table if not exists testimonials (
  id          uuid primary key default gen_random_uuid(),
  author_name text not null,
  rating      int check (rating between 1 and 5),
  body        text not null,
  source      text,                        -- 'google','in_store', etc.
  is_featured boolean not null default false,
  created_at  timestamptz not null default now()
);
comment on table testimonials is 'DISPLAY ONLY. Do NOT emit Review/AggregateRating JSON-LD from these — Google penalizes self-serving review markup. Aggregate ratings come from the Google Business Profile.';

-- ------------------------------------------------------------ redirects (no hits counter — use web logs)
create table if not exists redirects (
  id        uuid primary key default gen_random_uuid(),
  from_path text not null unique,
  to_path   text not null,
  code      int not null default 301 check (code in (301,302)),
  created_at timestamptz not null default now()
);

-- ============================================================ RLS + GRANTs
alter table content_authors enable row level security;
alter table articles        enable row level security;
alter table article_products enable row level security;
alter table faqs            enable row level security;
alter table events          enable row level security;
alter table testimonials    enable row level security;
alter table redirects       enable row level security;

-- public read (published + scheduled-live where applicable)
create policy authors_public_read   on content_authors  for select to anon, authenticated using (true);
create policy articles_public_read  on articles         for select to anon, authenticated using (status='published' and (publish_at is null or publish_at <= now()));
create policy article_products_public_read on article_products for select to anon, authenticated using (true);
create policy faqs_public_read      on faqs             for select to anon, authenticated using (is_published);
create policy events_public_read    on events           for select to anon, authenticated using (status='published' and (publish_at is null or publish_at <= now()));
create policy testimonials_public_read on testimonials  for select to anon, authenticated using (true);
create policy redirects_public_read on redirects        for select to anon, authenticated using (true);

-- admin/dev write across the whole content layer (floor staff: none)
create policy authors_admin_write   on content_authors  for all using (is_admin_or_dev()) with check (is_admin_or_dev());
create policy articles_admin_write  on articles         for all using (is_admin_or_dev()) with check (is_admin_or_dev());
create policy article_products_admin_write on article_products for all using (is_admin_or_dev()) with check (is_admin_or_dev());
create policy faqs_admin_write      on faqs             for all using (is_admin_or_dev()) with check (is_admin_or_dev());
create policy events_admin_write    on events           for all using (is_admin_or_dev()) with check (is_admin_or_dev());
create policy testimonials_admin_write on testimonials  for all using (is_admin_or_dev()) with check (is_admin_or_dev());
create policy redirects_admin_write on redirects        for all using (is_admin_or_dev()) with check (is_admin_or_dev());

grant select on content_authors, articles, article_products, faqs, events, testimonials, redirects to anon, authenticated;

commit;

-- ============================================================ PUBLIC READ MODELS (add to public_read_models.sql)
-- public_articles  →  schemas/article.schema.json
create or replace view public_web.public_articles as
select
  a.id::text as id, a.slug, a.kind::text as kind, a.title, a.excerpt,
  a.body_md as "bodyMarkdown",
  case when a.hero_path is null then null
       else jsonb_build_object('url', public_web.storage_url(a.hero_path), 'alt', a.hero_alt) end as "heroImage",
  case when au.id is null then null
       else jsonb_build_object('slug', au.slug, 'name', au.display_name, 'title', au.title,
                               'avatarUrl', public_web.storage_url(au.avatar_path)) end as author,
  to_jsonb(a.topics) as topics,
  to_jsonb(a.tags) as tags,
  a.reading_minutes as "readingMinutes",
  -- related products via join table → public slugs (gated by public_products itself)
  coalesce((select array_agg(pp.slug order by ap.sort_order)
            from article_products ap
            join public_web.public_products pp on pp.id = ap.inventory_item_id::text
            where ap.article_id = a.id), '{}') as "relatedProductSlugs",
  coalesce((select jsonb_agg(jsonb_build_object(
              'id', f.id::text, 'question', f.question, 'answerMarkdown', f.answer_md,
              'category', f.category, 'sortOrder', f.sort_order) order by f.sort_order)
            from faqs f where f.article_id = a.id and f.is_published), '[]'::jsonb) as faqs,
  a.seo,
  a.publish_at as "publishedAt",
  a.updated_at as "updatedAt"
from articles a
left join content_authors au on au.id = a.author_id
where a.status = 'published' and (a.publish_at is null or a.publish_at <= now());

-- public_faqs (site-wide, unattached)  →  schemas/faq.schema.json
create or replace view public_web.public_faqs as
select id::text as id, question, answer_md as "answerMarkdown", category, sort_order as "sortOrder"
from faqs where is_published and article_id is null and product_id is null
order by category, sort_order;

-- public_events  →  schemas/event.schema.json
create or replace view public_web.public_events as
select id::text as id, slug, title, description,
       public_web.storage_url(hero_path) as "heroImage",
       starts_at as "startsAt", ends_at as "endsAt", is_all_day as "isAllDay",
       location_name as "locationName", url
from events
where status='published' and (publish_at is null or publish_at <= now())
order by starts_at;

-- public_redirects (frontend / edge consumes for 301s)
create or replace view public_web.public_redirects as
select from_path as "fromPath", to_path as "toPath", code from redirects;

grant select on all tables in schema public_web to anon, authenticated;
