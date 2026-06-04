
CREATE OR REPLACE FUNCTION public.guard_vli_doa_photos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_in_bag boolean;
  has_on_lid boolean;
BEGIN
  IF NEW.loss_reason = 'dead_on_arrival' AND COALESCE(NEW.lost_quantity, 0) > 0 THEN
    SELECT
      bool_or(kind = 'in_bag'),
      bool_or(kind = 'on_lid')
    INTO has_in_bag, has_on_lid
    FROM public.vendor_line_doa_photos
    WHERE vendor_line_item_id = NEW.id;

    IF NOT COALESCE(has_in_bag, false) OR NOT COALESCE(has_on_lid, false) THEN
      RAISE EXCEPTION 'DOA tag requires both in-bag and on-lid photos for line %', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vli_doa_photos ON public.vendor_line_items;
CREATE TRIGGER trg_vli_doa_photos
  BEFORE INSERT OR UPDATE OF loss_reason, lost_quantity ON public.vendor_line_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_vli_doa_photos();
