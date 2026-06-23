-- 2026_content_seo.sql
-- Content & SEO surfaces for local authority: articles, FAQs, events, redirects,
-- testimonials, content authors, article<->product join. Public read via invoker views.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================
DO $$ BEGIN
  CREATE TYPE public.article_status AS ENUM ('draft','in_review','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.article_kind AS ENUM ('care_guide','event_recap','news','species_spotlight','how_to','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.event_status AS ENUM ('draft','published','cancelled','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- 2. content_authors  (E-E-A-T)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.content_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  bio_md text,
  credentials text,
  avatar_media_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  links jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_authors TO authenticated;
GRANT ALL ON public.content_authors TO service_role;

ALTER TABLE public.content_authors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_authors admin/dev write"
  ON public.content_authors FOR ALL
  TO authenticated
  USING (public.is_admin_or_dev(auth.uid()))
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

CREATE POLICY "content_authors authenticated read"
  ON public.content_authors FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_content_authors_touch
  BEFORE UPDATE ON public.content_authors
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 3. articles
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  kind public.article_kind NOT NULL DEFAULT 'other',
  status public.article_status NOT NULL DEFAULT 'draft',
  body_md text,
  excerpt text,
  hero_media_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  author_id uuid REFERENCES public.content_authors(id) ON DELETE SET NULL,
  reviewer_id uuid REFERENCES public.content_authors(id) ON DELETE SET NULL,
  seo_title text,
  seo_description text,
  og_image_path text,
  tags text[] NOT NULL DEFAULT '{}',
  publish_at timestamptz,
  reviewed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS articles_status_publish_at_idx
  ON public.articles (status, publish_at DESC);
CREATE INDEX IF NOT EXISTS articles_kind_idx ON public.articles (kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT ALL ON public.articles TO service_role;

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "articles admin/dev write"
  ON public.articles FOR ALL
  TO authenticated
  USING (public.is_admin_or_dev(auth.uid()))
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

CREATE POLICY "articles authenticated read"
  ON public.articles FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_articles_touch
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- status-guard: only admin/dev can transition to 'published'; stamp published_by/publish_at
CREATE OR REPLACE FUNCTION public.guard_article_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' AND NOT public.is_admin_or_dev(v_uid) THEN
      RAISE EXCEPTION 'Only admin/dev can publish articles' USING ERRCODE='insufficient_privilege';
    END IF;
    IF NEW.status = 'published' THEN
      NEW.published_by := COALESCE(NEW.published_by, v_uid);
      NEW.publish_at := COALESCE(NEW.publish_at, now());
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'published'
       AND NOT public.is_admin_or_dev(v_uid) THEN
      RAISE EXCEPTION 'Only admin/dev can publish articles' USING ERRCODE='insufficient_privilege';
    END IF;
    IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
      NEW.published_by := COALESCE(NEW.published_by, v_uid);
      NEW.publish_at := COALESCE(NEW.publish_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_articles_status_guard
  BEFORE INSERT OR UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.guard_article_status();

-- =====================================================================
-- 4. article_products  (join: articles <-> inventory_items)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.article_products (
  article_id uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS article_products_item_idx
  ON public.article_products (inventory_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.article_products TO authenticated;
GRANT ALL ON public.article_products TO service_role;

ALTER TABLE public.article_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "article_products admin/dev write"
  ON public.article_products FOR ALL
  TO authenticated
  USING (public.is_admin_or_dev(auth.uid()))
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

CREATE POLICY "article_products authenticated read"
  ON public.article_products FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================================
-- 5. faqs
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer_md text NOT NULL,
  category text,
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  related_article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS faqs_pub_sort_idx ON public.faqs (is_published, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faqs TO authenticated;
GRANT ALL ON public.faqs TO service_role;

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "faqs admin/dev write"
  ON public.faqs FOR ALL
  TO authenticated
  USING (public.is_admin_or_dev(auth.uid()))
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

CREATE POLICY "faqs authenticated read"
  ON public.faqs FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_faqs_touch
  BEFORE UPDATE ON public.faqs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 6. events  (single-occurrence; nullable series_id self-FK for recurring sets)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description_md text,
  status public.event_status NOT NULL DEFAULT 'draft',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'America/New_York',
  location_id uuid REFERENCES public.store_locations(id) ON DELETE SET NULL,
  location_text text,
  hero_media_id uuid REFERENCES public.media_assets(id) ON DELETE SET NULL,
  series_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  seo_title text,
  seo_description text,
  og_image_path text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_status_starts_idx ON public.events (status, starts_at);
CREATE INDEX IF NOT EXISTS events_series_idx ON public.events (series_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events admin/dev write"
  ON public.events FOR ALL
  TO authenticated
  USING (public.is_admin_or_dev(auth.uid()))
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

CREATE POLICY "events authenticated read"
  ON public.events FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_events_touch
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 7. testimonials  (display-only; NO Review/AggregateRating schema markup)
-- =====================================================================
-- NOTE: Do NOT emit schema.org Review or AggregateRating for these on the
-- public site. They are first-party testimonials, not third-party reviews,
-- and Google's guidelines forbid self-serving review markup on LocalBusiness.
CREATE TABLE IF NOT EXISTS public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name text NOT NULL,
  author_location text,
  body text NOT NULL,
  rating smallint CHECK (rating BETWEEN 1 AND 5),
  source text,
  is_published boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS testimonials_pub_sort_idx
  ON public.testimonials (is_published, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.testimonials TO authenticated;
GRANT ALL ON public.testimonials TO service_role;

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "testimonials admin/dev write"
  ON public.testimonials FOR ALL
  TO authenticated
  USING (public.is_admin_or_dev(auth.uid()))
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

CREATE POLICY "testimonials authenticated read"
  ON public.testimonials FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_testimonials_touch
  BEFORE UPDATE ON public.testimonials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 8. redirects  (from_path unique; no hits counter)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_path text NOT NULL UNIQUE,
  to_path text NOT NULL,
  status_code smallint NOT NULL DEFAULT 301 CHECK (status_code IN (301,302,307,308)),
  is_active boolean NOT NULL DEFAULT true,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.redirects TO authenticated;
GRANT ALL ON public.redirects TO service_role;

ALTER TABLE public.redirects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "redirects admin/dev write"
  ON public.redirects FOR ALL
  TO authenticated
  USING (public.is_admin_or_dev(auth.uid()))
  WITH CHECK (public.is_admin_or_dev(auth.uid()));

CREATE POLICY "redirects authenticated read"
  ON public.redirects FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER trg_redirects_touch
  BEFORE UPDATE ON public.redirects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================================
-- 9. PUBLIC READ VIEWS  (security_invoker; published-only gates)
-- =====================================================================

-- Articles: published + publish_at reached
CREATE OR REPLACE VIEW public.v_public_articles
WITH (security_invoker = true) AS
SELECT
  a.id, a.slug, a.title, a.subtitle, a.kind::text AS kind,
  a.body_md, a.excerpt, a.hero_media_id, a.author_id, a.reviewer_id,
  a.seo_title, a.seo_description, a.og_image_path, a.tags,
  a.publish_at, a.reviewed_at, a.updated_at
FROM public.articles a
WHERE a.status = 'published'
  AND (a.publish_at IS NULL OR a.publish_at <= now());

GRANT SELECT ON public.v_public_articles TO anon, authenticated;

-- Article authors (active only)
CREATE OR REPLACE VIEW public.v_public_authors
WITH (security_invoker = true) AS
SELECT
  ca.id, ca.display_name, ca.slug, ca.bio_md, ca.credentials,
  ca.avatar_media_id, ca.links
FROM public.content_authors ca
WHERE ca.is_active = true;

GRANT SELECT ON public.v_public_authors TO anon, authenticated;

-- Article <-> products join (only when both sides are publicly visible)
CREATE OR REPLACE VIEW public.v_public_article_products
WITH (security_invoker = true) AS
SELECT
  ap.article_id, ap.inventory_item_id, ap.sort_order
FROM public.article_products ap
JOIN public.articles a ON a.id = ap.article_id
JOIN public.inventory_items i ON i.id = ap.inventory_item_id
WHERE a.status = 'published'
  AND (a.publish_at IS NULL OR a.publish_at <= now())
  AND i.is_website_ready = true;

GRANT SELECT ON public.v_public_article_products TO anon, authenticated;

-- FAQs
CREATE OR REPLACE VIEW public.v_public_faqs
WITH (security_invoker = true) AS
SELECT id, question, answer_md, category, sort_order, related_article_id, updated_at
FROM public.faqs
WHERE is_published = true;

GRANT SELECT ON public.v_public_faqs TO anon, authenticated;

-- Events
CREATE OR REPLACE VIEW public.v_public_events
WITH (security_invoker = true) AS
SELECT
  id, slug, title, description_md, starts_at, ends_at, timezone,
  location_id, location_text, hero_media_id, series_id,
  seo_title, seo_description, og_image_path, updated_at
FROM public.events
WHERE status = 'published';

GRANT SELECT ON public.v_public_events TO anon, authenticated;

-- Testimonials (display-only)
CREATE OR REPLACE VIEW public.v_public_testimonials
WITH (security_invoker = true) AS
SELECT id, author_name, author_location, body, rating, source, sort_order, collected_at
FROM public.testimonials
WHERE is_published = true;

GRANT SELECT ON public.v_public_testimonials TO anon, authenticated;

-- Redirects (active only)
CREATE OR REPLACE VIEW public.v_public_redirects
WITH (security_invoker = true) AS
SELECT from_path, to_path, status_code
FROM public.redirects
WHERE is_active = true;

GRANT SELECT ON public.v_public_redirects TO anon, authenticated;
