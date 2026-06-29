# Handoff → Lovable: restore `security_invoker = on` on the public views (the critical scan finding)

The production publish is blocked by **1 critical security finding**. Diagnosis: the availability migration
(`20260628203956_*.sql`) **dropped `WITH (security_invoker = on)`** when it recreated two anon-granted views,
turning them into **SECURITY DEFINER** views — which Supabase's security scanner flags as critical
("Security Definer View"). The prior migration (`20260627200504_*.sql`) had `security_invoker = on`.

Affected (both granted to `anon`):
- `public.v_public_inventory` — recreated at line 45 without the WITH clause.
- `public.v_public_site_settings` — recreated at line 96 without the WITH clause.

## Fix (a new versioned migration — your lane)
```sql
ALTER VIEW public.v_public_inventory   SET (security_invoker = on);
ALTER VIEW public.v_public_site_settings SET (security_invoker = on);
```
(or recreate each with `WITH (security_invoker = on) AS …`). Restores the intended posture: the views run with
the **querying** role's privileges and respect RLS, instead of the owner's.

## Why this is safe (won't break the storefront)
The storefront reads these views **server-side via the service-role client** (`supabaseAdmin` in
`src/lib/public-site.functions.ts`), which bypasses RLS regardless — so products keep rendering. Restoring
`security_invoker = on` only changes **direct anon REST** access: with no anon SELECT policy on
`inventory_items`, a raw anon query returns nothing (defense in depth), which is correct — nothing relies on
direct anon reads of these views. No storefront regression expected; re-run `tests/smoke/storefront_smoke.py`
to confirm `/shop` still shows the published items after the change.

## Please also confirm
1. Run `security--get_scan_results` and confirm this is the (only) critical finding. If a **separate** finding
   flags the **public `public-media` bucket** as publicly readable — that one is **intentional** (product
   images for the storefront, approved). Mark it accepted/ignored rather than locking the bucket.
2. After the fix, re-scan → expect 0 critical → **publish**.

## Reply with
The scan finding(s) confirmed, the fix migration applied, re-scan clean, smoke spec still green, and the live
publish done.
