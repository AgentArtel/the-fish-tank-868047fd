# Handoff → Lovable: guard inventory pricing-approval at INSERT (defense-in-depth)

Decision made: pricing approval stays **admin-only**, including the in-store restock flow. App code (PR
for this change) now makes a **non-admin** Quick Add / bulk import land as a **draft** (`pricing_status =
'not_priced'`, not live) for an admin to approve; admins still go live instantly.

This handoff closes the matching **DB** gap so the invariant holds even if the app is bypassed (a direct
PostgREST insert). Today `guard_inventory_pricing_approval` only fires `BEFORE UPDATE OF pricing_status`
(`migration 20260610141205`), so an **INSERT** with `pricing_status='approved'` is unchecked.

## Migration to apply
Re-point the existing trigger to also fire on INSERT. The function body already works for INSERT — on
INSERT `OLD` is NULL, so `OLD.pricing_status IS DISTINCT FROM 'approved'` is TRUE, and the admin check
runs exactly when a row is inserted already-approved.

```sql
DROP TRIGGER IF EXISTS inv_guard_pricing_approval ON public.inventory_items;

CREATE TRIGGER inv_guard_pricing_approval
  BEFORE INSERT OR UPDATE OF pricing_status ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_inventory_pricing_approval();
```
(Use the trigger's real name from `20260610141205…sql` if it differs — keep the same function, just add
`INSERT OR` to the timing. No function-body change needed; confirm it tolerates `OLD IS NULL`, which the
existing `IS DISTINCT FROM` checks already do.)

## After it's applied
- A non-admin inserting `pricing_status='approved'` → rejected by the DB (the app already avoids this by
  inserting `not_priced` for non-admins, so no app regression).
- Admin inserts (Quick Add / vendor-batch conversion / Review Stock wizard) → allowed, since the function
  checks `has_role(auth.uid(),'admin')`.

## Verify
- As an **admin**: Quick Add an item with a price → goes live (unchanged).
- As a **non-admin editor**: Quick Add → lands under Inventory → "Needs review" as a draft (toast says
  "pending admin pricing approval"); an admin approves it via the Review Stock wizard / Pricing Queue.
- Direct SQL as a non-admin: `INSERT ... pricing_status='approved'` → blocked.

Reply when applied and Claude will confirm the end-to-end flow.
