# Handoff → Lovable: add Reef Lounge Coral as an official (permissioned) image source

The owner has **explicit permission** to use `reefloungecoral.com`'s product images (black-background style that
matches our look). It's a Shopify store, so its `products.json` is exactly the format
`runScrapeForSource` already ingests. Adding it widens our **named image-anchor library** — which the
FB "New Arrivals" export (Option A) and the inventory image-picker auto-match against by name
(`searchVendorImages` on `vendor_scrape_items.title`).

## 1. Confirm Firecrawl is enabled  `[Env=Lovable]`
Reef Lounge **403s on direct fetch** (confirmed), so the scrape needs the Firecrawl fallback. Please confirm
`FIRECRAWL_API_KEY` is set in the deployed runtime env (you've wired Firecrawl before — likely already there).
If missing, the refresh errors with "Firecrawl not configured".

## 2. Add the source (or confirm the owner can self-serve)  `[App/DB]`
The Vendor Watch **Add Source** flow (`createScrapeSource`, admin-gated) already does this. Suggested values:
- **Vendor:** Reef Lounge Coral
- **Source name:** Reef Lounge Coral — catalog
- **Source URL:** `https://reefloungecoral.com`  (the scraper paginates `…/products.json` itself)
- **Cadence:** weekly (or manual)
- **Prefer Firecrawl:** **ON** (it 403s direct)
- **Notes:** "Official image source — owner has written permission to reuse product images. Permissioned <date>."
  ← please record the permission in the source `notes` (provenance) so image reuse is auditable.

## 3. Run the first refresh + report the haul  `[Ops]`
Trigger a refresh and reply with: items ingested, how many have images, and a spot-check that titles read as
species names (e.g. "Blue Hippo Tang", "Dragon Soul Torch"). The collections the owner flagged
(`fish-1`, `anemones`, `cleanup-crew`, plus corals) should all come through the whole-catalog `products.json`.

## 4. Provenance / "vendor photos OK" attestation  `[DB — optional, for the FB feature]`
The PO→Facebook scope (`scope-cms-po-to-facebook.md`) flagged image-use legality as a real gate. Recording
permission per-source (step 2 notes) covers Reef Lounge specifically. If you already planned a workspace-level
"vendor photos OK" attestation setting, this is the moment to land it — otherwise the per-source note suffices
for now.

## Reply with
Firecrawl confirmed; source added (or confirm owner self-served); first-refresh counts (items / with-images);
and whether a workspace attestation setting exists. Then the FB export's name auto-match has a real library to
draw from.
