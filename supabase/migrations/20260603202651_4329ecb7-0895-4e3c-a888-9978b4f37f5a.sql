
-- 1. item_type enum
CREATE TYPE public.item_type AS ENUM ('fish','coral','invert','dry_good','live_rock','equipment','other');

-- 2. Extend store_location_kind with 'zone'
ALTER TYPE public.store_location_kind ADD VALUE IF NOT EXISTS 'zone';

-- 3. store_locations: parent self-ref for zone→tank hierarchy
ALTER TABLE public.store_locations
  ADD COLUMN parent_location_id UUID REFERENCES public.store_locations(id) ON DELETE SET NULL;
CREATE INDEX idx_store_locations_parent ON public.store_locations(parent_location_id);

-- 4. vendor_line_items: item_type, suggested 3x retail (generated), receiving fields
ALTER TABLE public.vendor_line_items
  ADD COLUMN item_type public.item_type,
  ADD COLUMN suggested_retail_3x NUMERIC(12,2) GENERATED ALWAYS AS (
    CASE WHEN wholesale_cost IS NOT NULL THEN ROUND(wholesale_cost * 3, 2) ELSE NULL END
  ) STORED,
  ADD COLUMN received_quantity NUMERIC(12,2),
  ADD COLUMN lost_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN loss_reason TEXT,
  ADD COLUMN assigned_location_id UUID REFERENCES public.store_locations(id) ON DELETE SET NULL,
  ADD COLUMN received_at TIMESTAMPTZ,
  ADD COLUMN received_by UUID;

-- 5. inventory_items: item_type, received tracking
ALTER TABLE public.inventory_items
  ADD COLUMN item_type public.item_type,
  ADD COLUMN received_at TIMESTAMPTZ,
  ADD COLUMN received_by UUID;
