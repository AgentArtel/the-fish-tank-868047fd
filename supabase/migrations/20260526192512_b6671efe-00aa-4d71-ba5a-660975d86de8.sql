
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin','creator','reviewer');
CREATE TYPE public.product_type AS ENUM ('dry_good','fish','coral','invert','service','brand','general_content_subject');
CREATE TYPE public.availability_status AS ENUM ('available','sold','ordered','unavailable','unknown');
CREATE TYPE public.content_status AS ENUM ('idea','needs_media','drafting','needs_review','approved','scheduled','posted','archived');
CREATE TYPE public.content_type AS ENUM ('photo','video','reel','story','carousel','live','blog','announcement','promo','educational','other');
CREATE TYPE public.platform AS ENUM ('facebook','instagram','tiktok','youtube_shorts','google_business');
CREATE TYPE public.media_type AS ENUM ('image','video');
CREATE TYPE public.source_type AS ENUM ('phone_upload','camera_upload','vendor_asset','ai_generated','edited_asset');
CREATE TYPE public.usage_rights AS ENUM ('owned','vendor_allowed','needs_permission','unknown');
CREATE TYPE public.usage_status AS ENUM ('unused','in_use','archived');
CREATE TYPE public.campaign_status AS ENUM ('planning','active','complete','archived');
CREATE TYPE public.content_priority AS ENUM ('low','medium','high');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_active = true) $$;

CREATE OR REPLACE FUNCTION public.can_edit_content(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_active_user(_user_id) AND (
    public.has_role(_user_id, 'admin') OR
    public.has_role(_user_id, 'creator') OR
    public.has_role(_user_id, 'reviewer')
  )
$$;

-- Signup trigger: first user becomes active admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first;
  INSERT INTO public.profiles (id, email, display_name, is_active, approved_at, approved_by)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)),
    is_first,
    CASE WHEN is_first THEN now() ELSE NULL END,
    CASE WHEN is_first THEN NEW.id ELSE NULL END
  );
  IF is_first THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Profile RLS
CREATE POLICY "profiles select active or admin" ON public.profiles FOR SELECT TO authenticated
USING (public.is_active_user(auth.uid()) OR public.has_role(auth.uid(),'admin') OR id = auth.uid());
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND is_active = (SELECT is_active FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "admins update any profile" ON public.profiles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- user_roles RLS
CREATE POLICY "user_roles select own or admin" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles admin insert" ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles admin delete" ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  product_type public.product_type NOT NULL DEFAULT 'general_content_subject',
  is_livestock BOOLEAN NOT NULL DEFAULT false,
  availability_status public.availability_status NOT NULL DEFAULT 'unknown',
  category TEXT,
  species_common_name TEXT,
  price NUMERIC(10,2),
  tank_location TEXT,
  description TEXT,
  care_notes TEXT,
  content_priority public.content_priority NOT NULL DEFAULT 'medium',
  website_ready BOOLEAN NOT NULL DEFAULT false,
  social_ready BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER touch_products BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "products select active" ON public.products FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "products insert editor" ON public.products FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "products update editor" ON public.products FOR UPDATE TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "products delete admin" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Campaigns
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  purpose TEXT,
  start_date DATE,
  end_date DATE,
  status public.campaign_status NOT NULL DEFAULT 'planning',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER touch_campaigns BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "campaigns select active" ON public.campaigns FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "campaigns insert editor" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "campaigns update editor" ON public.campaigns FOR UPDATE TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "campaigns delete admin" ON public.campaigns FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Content items
CREATE TABLE public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content_type public.content_type NOT NULL DEFAULT 'photo',
  caption TEXT,
  short_caption TEXT,
  on_screen_text TEXT,
  hashtags TEXT[] NOT NULL DEFAULT '{}',
  call_to_action TEXT,
  status public.content_status NOT NULL DEFAULT 'idea',
  scheduled_date TIMESTAMPTZ,
  posted_date TIMESTAMPTZ,
  assigned_to UUID REFERENCES auth.users(id),
  reviewer UUID REFERENCES auth.users(id),
  notes TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  meta_publish_ready BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_items TO authenticated;
GRANT ALL ON public.content_items TO service_role;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER touch_content_items BEFORE UPDATE ON public.content_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "content select active" ON public.content_items FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "content insert editor" ON public.content_items FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "content update editor" ON public.content_items FOR UPDATE TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "content delete admin" ON public.content_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Content platforms (sole home for post_url + posted_at per platform)
CREATE TABLE public.content_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  platform public.platform NOT NULL,
  post_url TEXT,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_platforms TO authenticated;
GRANT ALL ON public.content_platforms TO service_role;
ALTER TABLE public.content_platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp select active" ON public.content_platforms FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "cp insert editor" ON public.content_platforms FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "cp update editor" ON public.content_platforms FOR UPDATE TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "cp delete editor" ON public.content_platforms FOR DELETE TO authenticated USING (public.can_edit_content(auth.uid()));

-- Media assets
CREATE TABLE public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  media_type public.media_type NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  alt_text TEXT,
  platform_crop_notes TEXT,
  usage_status public.usage_status NOT NULL DEFAULT 'unused',
  date_captured DATE,
  captured_by TEXT,
  source_type public.source_type NOT NULL DEFAULT 'phone_upload',
  source_notes TEXT,
  usage_rights public.usage_rights NOT NULL DEFAULT 'owned',
  uploader_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets TO authenticated;
GRANT ALL ON public.media_assets TO service_role;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER touch_media_assets BEFORE UPDATE ON public.media_assets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "media select active" ON public.media_assets FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "media insert editor" ON public.media_assets FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "media update editor" ON public.media_assets FOR UPDATE TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "media delete admin" ON public.media_assets FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Content<->Media junction
CREATE TABLE public.content_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  media_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (content_item_id, media_asset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_media TO authenticated;
GRANT ALL ON public.content_media TO service_role;
ALTER TABLE public.content_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm select active" ON public.content_media FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "cm write editor" ON public.content_media FOR ALL TO authenticated USING (public.can_edit_content(auth.uid())) WITH CHECK (public.can_edit_content(auth.uid()));

-- Publishing checklists (readiness booleans only)
CREATE TABLE public.publishing_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  platform public.platform NOT NULL,
  caption_ready BOOLEAN NOT NULL DEFAULT false,
  media_attached BOOLEAN NOT NULL DEFAULT false,
  hashtags_ready BOOLEAN NOT NULL DEFAULT false,
  cta_ready BOOLEAN NOT NULL DEFAULT false,
  schedule_selected BOOLEAN NOT NULL DEFAULT false,
  manually_posted BOOLEAN NOT NULL DEFAULT false,
  post_url_saved BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_item_id, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publishing_checklists TO authenticated;
GRANT ALL ON public.publishing_checklists TO service_role;
ALTER TABLE public.publishing_checklists ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER touch_pc BEFORE UPDATE ON public.publishing_checklists FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "pc select active" ON public.publishing_checklists FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()));
CREATE POLICY "pc write editor" ON public.publishing_checklists FOR ALL TO authenticated USING (public.can_edit_content(auth.uid())) WITH CHECK (public.can_edit_content(auth.uid()));

-- Meta connection settings (placeholder, no tokens)
CREATE TABLE public.meta_connection_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_business_id TEXT,
  facebook_page_id TEXT,
  instagram_business_account_id TEXT,
  connected_status TEXT NOT NULL DEFAULT 'not_connected',
  last_sync_time TIMESTAMPTZ,
  token_expiration_date TIMESTAMPTZ,
  permissions_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_connection_settings TO authenticated;
GRANT ALL ON public.meta_connection_settings TO service_role;
ALTER TABLE public.meta_connection_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER touch_mcs BEFORE UPDATE ON public.meta_connection_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE POLICY "mcs admin all" ON public.meta_connection_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('media','media', false) ON CONFLICT DO NOTHING;

CREATE POLICY "media bucket read active" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'media' AND public.is_active_user(auth.uid()));
CREATE POLICY "media bucket insert editor" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'media' AND public.can_edit_content(auth.uid()));
CREATE POLICY "media bucket update editor" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'media' AND public.can_edit_content(auth.uid()));
CREATE POLICY "media bucket delete admin" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'media' AND public.has_role(auth.uid(),'admin'));
