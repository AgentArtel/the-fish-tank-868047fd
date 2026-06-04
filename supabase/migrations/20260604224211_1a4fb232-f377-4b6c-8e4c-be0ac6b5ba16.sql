
-- 1. has_price_tag flag on inventory_media
ALTER TABLE public.inventory_media
  ADD COLUMN IF NOT EXISTS has_price_tag boolean NOT NULL DEFAULT false;

-- 2. Guard: block availability_status='available' without any photo
CREATE OR REPLACE FUNCTION public.guard_inventory_photo_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE has_photo boolean;
BEGIN
  IF NEW.availability_status = 'available' THEN
    SELECT EXISTS(SELECT 1 FROM public.inventory_media WHERE inventory_item_id = NEW.id)
      INTO has_photo;
    IF NOT has_photo THEN
      RAISE EXCEPTION 'Cannot mark inventory item available without at least one photo (item %)', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inv_photo_required ON public.inventory_items;
CREATE TRIGGER trg_inv_photo_required
  BEFORE INSERT OR UPDATE OF availability_status ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_photo_required();

-- 3. Ensure the "Quick Add" vendor exists
INSERT INTO public.vendors (name, slug, is_active, notes)
VALUES ('Quick Add / Restock', 'quick-add', true, 'System vendor for in-store quick-add / restock entries.')
ON CONFLICT (slug) DO NOTHING;
