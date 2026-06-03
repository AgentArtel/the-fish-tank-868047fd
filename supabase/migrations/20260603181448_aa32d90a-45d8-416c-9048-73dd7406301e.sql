
-- Profiles: restrict SELECT to self or admin
DROP POLICY IF EXISTS "profiles select active or admin" ON public.profiles;
CREATE POLICY "profiles select self or admin"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Vendors: restrict SELECT to editors/admins
DROP POLICY IF EXISTS "vendors select active" ON public.vendors;
CREATE POLICY "vendors select editor"
ON public.vendors FOR SELECT
TO authenticated
USING (public.can_edit_content(auth.uid()));

-- Vendor batches: restrict SELECT to editors/admins
DROP POLICY IF EXISTS "vb select active" ON public.vendor_batches;
CREATE POLICY "vb select editor"
ON public.vendor_batches FOR SELECT
TO authenticated
USING (public.can_edit_content(auth.uid()));

-- Vendor line items: restrict SELECT to editors/admins
DROP POLICY IF EXISTS "vli select active" ON public.vendor_line_items;
CREATE POLICY "vli select editor"
ON public.vendor_line_items FOR SELECT
TO authenticated
USING (public.can_edit_content(auth.uid()));

-- Inventory items: restrict SELECT to editors/admins (wholesale cost)
DROP POLICY IF EXISTS "inv select active" ON public.inventory_items;
CREATE POLICY "inv select editor"
ON public.inventory_items FOR SELECT
TO authenticated
USING (public.can_edit_content(auth.uid()));

-- Revoke EXECUTE on internal trigger/definer functions from API roles
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_inventory_gates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_vli_pricing_approval() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_inventory_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
