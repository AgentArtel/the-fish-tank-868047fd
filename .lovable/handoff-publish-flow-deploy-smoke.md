# Handoff → Lovable: deploy the publish flow + smoke-test the real intake→publish→live loop

The app side of the availability model is merged to `main` (#112). Two asks: **deploy `main`**, then **extend
the smoke spec** to verify the true staff workflow end to end.

## 1. Deploy `main` (≥ commit `10e0cf7`)
This build adds, and none of it is live until deployed:
- Staff **Website** card on `/inventory/$id`: a **Publish to website** button (invokes your
  `publish-inventory-item` edge fn) + the **sourceable** tri-state (your `set_inventory_sourceable` RPC).
- Public **order-ahead** display: sold-out-but-sourceable items stay listed, look orderable, show
  "Order by Sunday · pickup Wednesday"; WYSIWYG one-offs still drop.

## 2. Smoke-test the real loop (supersedes the manual #110 proof)
Earlier (`handoff-dynamic-update-smoke-test.md`) you were asked to flag a 3rd item website-ready **manually**
via DB. That's now obsolete — we can prove it through the **actual staff workflow**. Please verify, and add the
durable checks to `tests/smoke/storefront_smoke.py`:

**A. Staff publish path (the real loop):**
1. Pick a 3rd inventory item that has approved pricing + a photo + a location (or set those).
2. Trigger publish the way the app does — `supabase.functions.invoke("publish-inventory-item", { body: { inventory_item_id } })` (or click Publish in the deployed UI).
3. Confirm: `is_website_ready` flips true, a `tag='website'` photo now exists in `public-media`, and the item
   appears in `v_public_inventory`.
4. Reload `/shop` → assert the product-card count went **2 → 3** with **no code change / no redeploy**. Capture
   the new slug.

**B. Order-ahead display:**
5. Take a **sourceable** published item and set it `availability_status = 'sold_out'` (or sell it down).
6. Reload its PDP + `/shop` card → assert it **stays listed** (not dropped), shows the pickup-ETA line
   ("Order by Sunday · pickup Wednesday"), is **not** greyed out, and the PDP Offer JSON-LD says `BackOrder`.
7. Take a **non-sourceable** (WYSIWYG) published item, sell it out → assert it **drops** from `v_public_inventory`
   and 404s / not-found on its PDP.

**C. Add these as permanent assertions** in the smoke spec (the `/shop` count + the order-ahead vs dropped
behavior) so they're re-run every phase.

## Reply with
Deploy confirmed; the staff-publish result (new slug, `/shop` count 2→3); the order-ahead vs dropped results;
and the updated smoke-spec run output. That closes the loop on "properly intaking a product makes it appear
on the live site" — through the real workflow, dynamically.
