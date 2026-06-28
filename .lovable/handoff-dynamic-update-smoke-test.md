# Handoff → Lovable: prove the storefront auto-updates (dynamic data-driven smoke test)

**Goal:** demonstrate that adding a qualifying product makes the public site show it — **no code change, no
deploy** — which is the core promise of the data-driven storefront. Today `/shop` shows **2** products; this
test confirms a **3rd** appears automatically once it's website-ready.

## Background (the mechanism — already built, just confirming it end to end)
`v_public_inventory` returns only rows where `is_website_ready = true`. That flag is auto-flipped by the
`compute_inventory_website_ready` trigger when **all five** hold for an item:
1. `pricing_status = 'approved'`
2. `retail_price IS NOT NULL`
3. `needs_photo = false`
4. `item_name` non-empty
5. a photo row with `tag = 'website'` exists (file in the public `public-media` bucket)

The storefront server fns (`listProducts`, `getProductBySlug`) read that view on each load, so a newly-ready
item shows on the next page render. This test proves that loop.

## Please do
1. **Flag a 3rd existing inventory item website-ready** the same way you seeded the first two: confirm 1–4,
   then add a `website`-tagged photo in `public-media`. Pick any real dry-good or livestock item so the card
   looks legitimate. Capture its **slug**.
2. **Extend the committed smoke spec** (`tests/smoke/storefront_smoke.py`) with a **product-count assertion**
   on `/shop` (and/or the home "New Arrivals" strip): assert the rendered product-card count is now **3**
   (was 2). Keep it resilient (count by the product-card selector, not a hardcoded list). This makes the
   "site auto-updates" guarantee a permanent regression check.
3. **Run the full spec against prod** and report: the new slug, the before/after `/shop` count, and the spec
   result (expect all green incl. the new count check).

## Why this matters / what it proves
- ✅ Proves: **intake/flag a product → it appears on the live site automatically**, with zero redeploy.
- It does **not** yet prove the staff-facing *Publish to website* button (that UI isn't built — see below);
  this test uses the same manual/DB publish path you used for the first two items.

## Related (heads-up, not part of this test)
The staff-facing **"Publish to website"** flow is the app-side follow-up (Claude's lane for the UI + invoke).
Because it must copy a photo from the private `inventory-media` bucket into public `public-media`, the byte
copy belongs in an **edge function** (your deploy lane; either party authors the Deno). Claude will send a
separate scoping handoff for that — this doc is only the dynamic-update proof.

## Reply with
The 3rd item's slug, `/shop` product count before/after, and the smoke-spec run output (with the new count
assertion). Then we've confirmed the storefront is truly dynamic and data-driven.
