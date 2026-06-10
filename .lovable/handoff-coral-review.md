# Hand-off — Coral review → go-live (for Lovable / DB owner)

Date: 2026-06-10 · Claude Code shipped the app side (Pricing Queue now has a **Coral drafts**
section: admin approves price → take live, reusing the existing photo gate). This is **optional
defense-in-depth** — the feature works without it. No frontend change depends on this.

## What the app side does now

- New admin-only server fn `approveInventoryPricing(inventoryItemId, approvedRetailPrice)` —
  sets `retail_price` + `pricing_status='approved'` on `inventory_items` (admin enforced in the
  server fn, same pattern as the existing `approveLinePricing`).
- "Take live" reuses `setInventoryAvailability` → `available`; the existing `inv_guard_gates` +
  photo triggers still enforce approved pricing + retail + location + qty + photo.

## Requested DB task (optional hardening)

Add a migration mirroring the existing `guard_vli_pricing_approval` (vendor lines), but for
`inventory_items`:

1. `CREATE FUNCTION public.guard_inventory_pricing_approval()` — `BEFORE UPDATE OF pricing_status
   ON public.inventory_items`, `FOR EACH ROW`. If `NEW.pricing_status = 'approved'` AND
   `OLD.pricing_status IS DISTINCT FROM 'approved'` AND `NOT public.has_role(auth.uid(),'admin')`,
   `RAISE EXCEPTION` (ERRCODE `check_violation`) `'Only admins can approve inventory pricing'`.
   `SECURITY DEFINER`, `SET search_path = public`. `REVOKE EXECUTE` from public/anon/authenticated.

   **CRITICAL — trigger on `UPDATE OF pricing_status` ONLY, never on INSERT.** The existing
   Quick Add / bulk-import flow inserts items already `pricing_status='approved'` as a *non-admin*
   editor (in-store restock). An INSERT-time guard would break that. Confirm there's no existing
   non-admin **UPDATE** path that sets `pricing_status='approved'` before shipping (there isn't
   today — only the new admin-only `approveInventoryPricing` does it).

2. **(Confirm + fix if needed)** Storage RLS on the `inventory-media` bucket must allow
   authenticated editor uploads under the `coral-discovery/` path prefix (same as the working
   `quick-add/` prefix). Add a policy if the bucket is path-restricted. (Carried over from
   `handoff-coral-discovery.md` — still open.)

3. No new columns → no type regen needed. Ship with a review summary: what changed + RLS impact.

## Still open from before (not blocking)

- The bigger product decision in `handoff-coral-discovery.md` item 2 is now **answered**: coral
  drafts get their review surface on the **Pricing Queue** (this work). No separate queue table needed.
