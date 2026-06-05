-- Facility Mapping v1.0 seed
-- Idempotent via ON CONFLICT (slug) DO NOTHING

-- =========================================================
-- PASS 1: Top-level areas (no parent)
-- =========================================================
INSERT INTO public.store_locations
  (name, slug, kind, area_code, sort_order, attrs)
VALUES
  ('Retail Floor',        'retail-floor',        'zone'::store_location_kind, 'R', 10, '{}'::jsonb),
  ('Showroom',            'showroom',            'zone'::store_location_kind, 'S', 20, '{}'::jsonb),
  ('Quarantine',          'quarantine',          'zone'::store_location_kind, 'Q', 30, '{}'::jsonb),
  ('Warehouse / Storage', 'warehouse-storage',   'zone'::store_location_kind, 'W', 40, '{}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- PASS 2: Mapped locations + intra-Showroom grouping rows
-- =========================================================

-- Retail Floor children
INSERT INTO public.store_locations
  (name, slug, kind, location_code, area_code, parent_location_id, sort_order, attrs)
SELECT 'Back-of-House Cabinet', 'r-1000', 'back_of_house'::store_location_kind, 'R-1000', 'R',
       (SELECT id FROM public.store_locations WHERE slug='retail-floor'),
       10, jsonb_build_object('aliases', jsonb_build_array('BOH Cabinet','Back Room Cabinet'))
ON CONFLICT (slug) DO NOTHING;

-- Showroom grouping rows
INSERT INTO public.store_locations
  (name, slug, kind, area_code, parent_location_id, sort_order, attrs)
SELECT v.name, v.slug, 'zone'::store_location_kind, 'S',
       (SELECT id FROM public.store_locations WHERE slug='showroom'),
       v.sort_order, '{}'::jsonb
FROM (VALUES
  ('Showroom Support', 'showroom-support', 10),
  ('Fish Systems',     'fish-systems',     20),
  ('Coral Systems',    'coral-systems',    30),
  ('Display Systems',  'display-systems',  40)
) AS v(name, slug, sort_order)
ON CONFLICT (slug) DO NOTHING;

-- Showroom Support stations (S-1000 / S-1100 / S-1200)
INSERT INTO public.store_locations
  (name, slug, kind, location_code, area_code, parent_location_id, sort_order, attrs)
SELECT v.name, v.slug, 'support_station'::store_location_kind, v.code, 'S',
       (SELECT id FROM public.store_locations WHERE slug='showroom-support'),
       v.sort_order, v.attrs
FROM (VALUES
  ('Frag Propagation Wall',     's-1000', 'S-1000', 10,
     jsonb_build_object('aliases', jsonb_build_array('Frag Wall','Prop Wall'))),
  ('Coral Acclimation Station', 's-1100', 'S-1100', 20,
     jsonb_build_object('aliases', jsonb_build_array('Coral Acclim'))),
  ('Fish Acclimation Station',  's-1200', 'S-1200', 30,
     jsonb_build_object('aliases', jsonb_build_array('Fish Acclim','Drip Station')))
) AS v(name, slug, code, sort_order, attrs)
ON CONFLICT (slug) DO NOTHING;

-- Fish Systems (S-2000..S-5000)
INSERT INTO public.store_locations
  (name, slug, kind, location_code, area_code, parent_location_id, sort_order, attrs)
SELECT v.name, v.slug, 'fish_system'::store_location_kind, v.code, 'S',
       (SELECT id FROM public.store_locations WHERE slug='fish-systems'),
       v.sort_order, '{}'::jsonb
FROM (VALUES
  ('Fish System 1', 's-2000', 'S-2000', 10),
  ('Fish System 2', 's-3000', 'S-3000', 20),
  ('Fish System 3', 's-4000', 'S-4000', 30),
  ('Fish System 4', 's-5000', 'S-5000', 40)
) AS v(name, slug, code, sort_order)
ON CONFLICT (slug) DO NOTHING;

-- Coral Systems (growout tanks; leaf rows; physical area = S)
INSERT INTO public.store_locations
  (name, slug, kind, location_code, area_code, parent_location_id, sort_order, attrs)
SELECT v.name, v.slug, 'growout_tank'::store_location_kind, v.code, 'S',
       (SELECT id FROM public.store_locations WHERE slug='coral-systems'),
       v.sort_order, jsonb_build_object('category','coral')
FROM (VALUES
  ('Coral Growout 1', 'c-40100', 'C-40100', 10),
  ('Coral Growout 2', 'c-40200', 'C-40200', 20),
  ('Coral Growout 3', 'c-40300', 'C-40300', 30),
  ('Coral Growout 4', 'c-40400', 'C-40400', 40)
) AS v(name, slug, code, sort_order)
ON CONFLICT (slug) DO NOTHING;

-- Display Systems (D-50100; physical area = S)
INSERT INTO public.store_locations
  (name, slug, kind, location_code, area_code, parent_location_id, sort_order, attrs)
SELECT 'Display Tank', 'd-50100', 'zone'::store_location_kind, 'D-50100', 'S',
       (SELECT id FROM public.store_locations WHERE slug='display-systems'),
       10, jsonb_build_object('category','display')
ON CONFLICT (slug) DO NOTHING;

-- Quarantine towers (Q-30100..Q-30500)
INSERT INTO public.store_locations
  (name, slug, kind, location_code, area_code, parent_location_id, sort_order, planned, is_active, attrs)
SELECT v.name, v.slug, 'quarantine'::store_location_kind, v.code, 'Q',
       (SELECT id FROM public.store_locations WHERE slug='quarantine'),
       v.sort_order, v.planned, v.is_active, '{}'::jsonb
FROM (VALUES
  ('Quarantine Tower 01',           'q-30100', 'Q-30100', 10, false, true),
  ('Quarantine Tower 02',           'q-30200', 'Q-30200', 20, false, true),
  ('Quarantine Tower 03',           'q-30300', 'Q-30300', 30, false, true),
  ('Quarantine Tower 04 (Planned)', 'q-30400', 'Q-30400', 40, true,  false),
  ('Quarantine Tower 05 (Planned)', 'q-30500', 'Q-30500', 50, true,  false)
) AS v(name, slug, code, sort_order, planned, is_active)
ON CONFLICT (slug) DO NOTHING;

-- Warehouse / Storage children
INSERT INTO public.store_locations
  (name, slug, kind, location_code, area_code, parent_location_id, sort_order, attrs)
SELECT v.name, v.slug, v.kind, v.code, 'W',
       (SELECT id FROM public.store_locations WHERE slug='warehouse-storage'),
       v.sort_order, v.attrs
FROM (VALUES
  ('Bulk Salt Storage',       'w-20100', 'W-20100', 'bulk_storage'::store_location_kind, 10,
     jsonb_build_object('aliases', jsonb_build_array('Salt Bin'))),
  ('Off-Site Storage Unit',   'w-60100', 'W-60100', 'offsite_storage'::store_location_kind, 20,
     jsonb_build_object('aliases', jsonb_build_array('Storage Unit','Off-Site')))
) AS v(name, slug, code, kind, sort_order, attrs)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- PASS 3: Fish-system towers (children of each fish system)
-- =========================================================
INSERT INTO public.store_locations
  (name, slug, kind, location_code, area_code, parent_location_id, sort_order, attrs)
SELECT
  v.name,
  v.slug,
  'fish_system'::store_location_kind,
  v.code,
  'S',
  (SELECT id FROM public.store_locations WHERE slug = v.parent_slug),
  v.sort_order,
  '{}'::jsonb
FROM (VALUES
  -- Fish System 1 (2 towers)
  ('Fish System 1 — Tower 1', 's-2000-t1', 'S-2000-T1', 's-2000', 10),
  ('Fish System 1 — Tower 2', 's-2000-t2', 'S-2000-T2', 's-2000', 20),
  -- Fish System 2 (4 towers)
  ('Fish System 2 — Tower 1', 's-3000-t1', 'S-3000-T1', 's-3000', 10),
  ('Fish System 2 — Tower 2', 's-3000-t2', 'S-3000-T2', 's-3000', 20),
  ('Fish System 2 — Tower 3', 's-3000-t3', 'S-3000-T3', 's-3000', 30),
  ('Fish System 2 — Tower 4', 's-3000-t4', 'S-3000-T4', 's-3000', 40),
  -- Fish System 3 (4 towers)
  ('Fish System 3 — Tower 1', 's-4000-t1', 'S-4000-T1', 's-4000', 10),
  ('Fish System 3 — Tower 2', 's-4000-t2', 'S-4000-T2', 's-4000', 20),
  ('Fish System 3 — Tower 3', 's-4000-t3', 'S-4000-T3', 's-4000', 30),
  ('Fish System 3 — Tower 4', 's-4000-t4', 'S-4000-T4', 's-4000', 40),
  -- Fish System 4 (4 towers)
  ('Fish System 4 — Tower 1', 's-5000-t1', 'S-5000-T1', 's-5000', 10),
  ('Fish System 4 — Tower 2', 's-5000-t2', 'S-5000-T2', 's-5000', 20),
  ('Fish System 4 — Tower 3', 's-5000-t3', 'S-5000-T3', 's-5000', 30),
  ('Fish System 4 — Tower 4', 's-5000-t4', 'S-5000-T4', 's-5000', 40)
) AS v(name, slug, code, parent_slug, sort_order)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- PASS 4: Wire system_group_id
-- Fish systems and QT towers point to themselves.
-- Fish-system towers point to their parent fish system.
-- =========================================================

-- Fish systems → self
UPDATE public.store_locations
SET system_group_id = id
WHERE location_code IN ('S-2000','S-3000','S-4000','S-5000')
  AND system_group_id IS NULL;

-- QT towers → self (independent water systems)
UPDATE public.store_locations
SET system_group_id = id
WHERE location_code IN ('Q-30100','Q-30200','Q-30300','Q-30400','Q-30500')
  AND system_group_id IS NULL;

-- Fish-system towers → parent fish system
UPDATE public.store_locations AS t
SET system_group_id = p.id
FROM public.store_locations AS p
WHERE t.parent_location_id = p.id
  AND p.location_code IN ('S-2000','S-3000','S-4000','S-5000')
  AND t.location_code LIKE p.location_code || '-T%'
  AND t.system_group_id IS NULL;
