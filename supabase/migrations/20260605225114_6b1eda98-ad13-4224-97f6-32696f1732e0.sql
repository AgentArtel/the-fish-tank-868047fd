-- Migration A: Facility Mapping schema extensions
-- Extends store_location_kind enum and adds columns to store_locations.
-- No data writes; Migration B will seed the facility map.

-- 1. Enum additions (forward-only in Postgres)
ALTER TYPE public.store_location_kind ADD VALUE IF NOT EXISTS 'fish_system';
ALTER TYPE public.store_location_kind ADD VALUE IF NOT EXISTS 'coral_system';
ALTER TYPE public.store_location_kind ADD VALUE IF NOT EXISTS 'frag_tank';
ALTER TYPE public.store_location_kind ADD VALUE IF NOT EXISTS 'growout_tank';
ALTER TYPE public.store_location_kind ADD VALUE IF NOT EXISTS 'offsite_storage';
ALTER TYPE public.store_location_kind ADD VALUE IF NOT EXISTS 'support_station';
ALTER TYPE public.store_location_kind ADD VALUE IF NOT EXISTS 'bulk_storage';

-- 2. Column additions on store_locations
ALTER TABLE public.store_locations
  ADD COLUMN IF NOT EXISTS location_code   text,
  ADD COLUMN IF NOT EXISTS area_code       text,
  ADD COLUMN IF NOT EXISTS system_group_id uuid,
  ADD COLUMN IF NOT EXISTS planned         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attrs           jsonb   NOT NULL DEFAULT '{}'::jsonb;

-- 3. Self-FK for system_group_id (tank rows point at their water-system row)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'store_locations_system_group_id_fkey'
  ) THEN
    ALTER TABLE public.store_locations
      ADD CONSTRAINT store_locations_system_group_id_fkey
      FOREIGN KEY (system_group_id)
      REFERENCES public.store_locations(id)
      ON DELETE SET NULL;
  END IF;
END$$;

-- 4. Indexes
-- Partial unique index on location_code (null allowed, but non-null must be unique)
CREATE UNIQUE INDEX IF NOT EXISTS store_locations_location_code_uniq
  ON public.store_locations (location_code)
  WHERE location_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS store_locations_area_code_idx
  ON public.store_locations (area_code);

CREATE INDEX IF NOT EXISTS store_locations_system_group_idx
  ON public.store_locations (system_group_id);
