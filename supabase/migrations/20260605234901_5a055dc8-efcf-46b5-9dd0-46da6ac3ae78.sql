-- Correction migration: align seeded facility map names/kinds/attrs to Facility Mapping Master Record v1.0
-- Targets only the 11 rows that need fixes. Does not touch:
--   * the 3 original seed rows (no location_code, untouched)
--   * any inventory_items, system_group_id wiring, or other rows
--   * Q-30400/Q-30500 planned/is_active flags

UPDATE public.store_locations
SET name = 'Retail Medication Cabinet',
    kind = 'rack',
    attrs = jsonb_set(COALESCE(attrs,'{}'::jsonb), '{category}', '"retail"', true)
WHERE location_code = 'R-1000';

UPDATE public.store_locations
SET name = 'Showroom Fragging & Propagation Wall'
WHERE location_code = 'S-1000';

UPDATE public.store_locations
SET name = 'Small Frag Tank',
    kind = 'frag_tank',
    attrs = jsonb_set(COALESCE(attrs,'{}'::jsonb), '{category}', '"coral"', true)
WHERE location_code = 'S-1100';

UPDATE public.store_locations
SET name = 'Bagging & Plumbing Station',
    kind = 'support_station',
    attrs = jsonb_set(COALESCE(attrs,'{}'::jsonb), '{category}', '"support"', true)
WHERE location_code = 'S-1200';

UPDATE public.store_locations
SET name = 'LPS Growout Tank',
    kind = 'growout_tank',
    attrs = jsonb_build_object('category','coral','aliases', jsonb_build_array('Big Frag Tank'))
WHERE location_code = 'C-40100';

UPDATE public.store_locations
SET name = 'Anemone Growout Tank',
    kind = 'growout_tank',
    attrs = jsonb_build_object('category','coral','aliases', jsonb_build_array('Anemone Tank'))
WHERE location_code = 'C-40200';

UPDATE public.store_locations
SET name = 'SPS Growout Tank',
    kind = 'growout_tank',
    attrs = jsonb_build_object('category','coral','aliases', jsonb_build_array('SPS Tank'))
WHERE location_code = 'C-40300';

UPDATE public.store_locations
SET name = 'Colony Growout Tank',
    kind = 'growout_tank',
    attrs = jsonb_build_object('category','coral','aliases', jsonb_build_array('Colony Tank'))
WHERE location_code = 'C-40400';

UPDATE public.store_locations
SET name = 'Feature Display Tank 01',
    kind = 'display_tank',
    attrs = jsonb_build_object('category','display','aliases', jsonb_build_array('Chester''s Tank'))
WHERE location_code = 'D-50100';