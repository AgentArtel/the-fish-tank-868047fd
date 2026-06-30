
## Goal
Bring Reef Lounge Coral's whole catalog (fish, inverts, anemones, cleanup crew, corals — names + images) into `vendor_scrape_items` as a named image-anchor library the FB "New Arrivals" export and inventory image-picker can auto-match against. Owner has written permission to reuse product images.

## Steps

1. **Confirm `FIRECRAWL_API_KEY`** is present in the deployed runtime (it's in the project secrets list, but verify via `fetch_secrets`). Reef Lounge 403s on direct fetch — the scrape must use the Firecrawl fallback.

2. **Seed the source via migration** (idempotent, matches the pattern in `handoff-vendor-watch-seed-vendors.md`):
   - `INSERT … ON CONFLICT DO NOTHING` into `public.vendors`:
     - slug `reef-lounge-coral`, name `Reef Lounge Coral`, website `https://reefloungecoral.com`, notes call out the permission.
   - `INSERT … ON CONFLICT DO NOTHING` into `public.vendor_scrape_sources`:
     - name: `Reef Lounge Coral — catalog`
     - kind: `shopify_public`
     - source_url: `https://reefloungecoral.com/products.json` (the scraper paginates itself)
     - cadence: `weekly`
     - prefer_firecrawl: `true`
     - auth_method: `none`
     - notes: `"Official image source — owner has written permission to reuse product images. Permissioned 2026-06-30."`

   Using a seed migration (not the admin Add-Source dialog) so the source is version-controlled and reproducible across environments.

3. **Run the first refresh** by invoking `runScrapeForSource` for the new source id (via the existing app server function, same path the admin "Refresh now" button uses). This populates `vendor_scrape_items` with the whole-catalog `products.json` payload through Firecrawl.

4. **Verify the haul** with read-only SQL against `vendor_scrape_items` for this source:
   - total items ingested
   - count with `image_url IS NOT NULL`
   - rough breakdown by `product_type` (and a fallback bucket count from title keywords for collections that come through as blank `product_type`)
   - spot-check 5–10 titles read as species names ("Blue Hippo Tang", "Dragon Soul Torch", etc.)

5. **Reply with the haul numbers** and the spot-check so you can confirm coverage of fish / inverts / anemones / coral / cleanup-crew.

## Notes / scope
- No new app code. No UI changes. No edge function. Only: one seed migration + one refresh invocation + read-only verification.
- If the first refresh errors with "Firecrawl not configured", I'll stop and surface that before retrying.
- Workspace-level "vendor photos OK" attestation (the optional item 4 in the handoff) is **not** in scope here — the per-source `notes` permission line satisfies provenance for Reef Lounge specifically. Flag separately if you want the attestation setting built.
