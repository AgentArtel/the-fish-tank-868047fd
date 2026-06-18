-- Drop the now-redundant attrs.rack_position key.
-- App is fully cut over to inventory_items.rack_position (PR #60).
-- The column was backfilled in migration 20260617204210; this strips the
-- stale jsonb key so it can't drift from the column going forward.
UPDATE public.inventory_items
SET attrs = attrs - 'rack_position'
WHERE attrs ? 'rack_position';