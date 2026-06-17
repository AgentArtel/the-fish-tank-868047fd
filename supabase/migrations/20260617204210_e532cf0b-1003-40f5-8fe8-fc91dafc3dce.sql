-- Promote inventory_items.attrs->>'rack_position' to a real column.
-- Transition plan: app keeps writing BOTH attrs.rack_position and the new
-- column. A follow-up migration drops attrs.rack_position after the app
-- cutover ships. Reads should prefer the column once populated.

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS rack_position text;

-- Backfill from existing attrs (uppercase to match catalogCoralItem + Quick Add)
UPDATE public.inventory_items
SET rack_position = upper(attrs->>'rack_position')
WHERE attrs ? 'rack_position'
  AND rack_position IS NULL;

-- Plain index for stock-list / Pricing Queue / Coral Discovery lookups.
-- Partial to skip the (large) tail of items with no plug tag.
CREATE INDEX IF NOT EXISTS idx_inventory_items_rack_position
  ON public.inventory_items (location_id, rack_position)
  WHERE rack_position IS NOT NULL;