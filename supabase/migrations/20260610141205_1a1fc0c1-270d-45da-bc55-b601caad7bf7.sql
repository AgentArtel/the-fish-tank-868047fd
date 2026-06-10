-- Defense-in-depth: only admins can promote inventory_items.pricing_status to 'approved'.
-- UPDATE-only by design; INSERTs (Quick Add / bulk import) remain unaffected.

CREATE OR REPLACE FUNCTION public.guard_inventory_pricing_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.pricing_status = 'approved'
     AND OLD.pricing_status IS DISTINCT FROM 'approved'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve inventory pricing'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_inventory_pricing_approval() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inv_guard_pricing_approval ON public.inventory_items;
CREATE TRIGGER inv_guard_pricing_approval
  BEFORE UPDATE OF pricing_status ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_inventory_pricing_approval();