# Remaining Roadmap — Grouped Sprints

Goal: ship all 9 deferred items from `.lovable/plan.md`, preceded by a small dashboard stock-value breakdown, with a static + browser automation audit gating the final POS work. Devlog (`.lovable/devlog.md`) gets an append-only entry per sprint with planned-vs-shipped table, migrations referenced, and the refreshed "what's next" list mirrored from roadmap memory.

## Sprint 5 — Dashboard stock value by category (NEW, pre-1)

Small, scoped addition before tackling the queue. The current dashboard shows one aggregate "Stock value" KPI; the owner wants to see value split across the three categories that drive the business.

- Extend `getShopOverview` (in `src/routes/_app/dashboard.tsx`) so its stock-value query also returns `item_type`, then aggregate three sums server-side:
  - **Livestock** = `fish` + `invert` + `live_rock`
  - **Coral** = `coral`
  - **Dry goods** = `dry_good` + `equipment` (+ `other` as a small "Other" footnote)
- Replace the single "Stock value" KPI with a row of three KPIs (Livestock / Coral / Dry goods) under "Shop at a glance". Keep the existing total stock value as a small subtitle line under the section header, so nothing is lost.
- Each KPI links to `/inventory?type=:itemType` (which becomes meaningful once Sprint 6 adds query filtering). Until then it links to `/inventory`.
- No migration. Pure read + UI change.

## Sprint 6 — QR deep-linking + customer-facing catalog

Both are read-side filtering on the inventory list; shipping together keeps the URL + query layer consistent. Also adds `?type=` filtering so the new dashboard KPIs deep-link cleanly.

- `/inventory` accepts `?location=:id` (+ `&descendants=1`) and `?type=:itemType`, filters list, shows active-filter chips with clear buttons.
- QR label generator updated so each printed label encodes the deep-link URL.
- New public route `/catalog` (no auth): read-only, only items where `availability_status='available'` and at least one photo; search by name / sci name; filter by location and type. Server fn (or `/api/public/catalog` route) returns a sanitized projection — no cost, vendor, or internal fields.

Migrations: likely none. If a SQL view is preferred for the public projection, add one with explicit `GRANT SELECT … TO anon`.

## Sprint 7 — Intake capture upgrades

Both touch the bulk-add / receive flow.

- **Barcode scan on receive**: ZXing + `getUserMedia` button in receive UI, looks up `vendor_item_id` and prefills the row.
- **Bulk-add per-row photo**: replace the shared-photo control with a per-row uploader; shared photo becomes an "apply to empty rows" shortcut. Photos upload to `inventory-media` as today.

Migrations: none expected; extend the row schema to carry an optional photo path.

## Sprint 8 — Type-aware fields + pricing approval queue

Both extend the item/pricing schema; one migration covers both.

- **Per-type fields** on `inventory_items` (JSONB `attrs` column):
  - coral: frag size, mother colony, fragged_at
  - dry_good: sku, upc
  - fish: size, sex, age_estimate
  Forms render conditionally on `item_type`; server fn validates with Zod discriminated union.
- **Pricing approval queue**: new `pricing_overrides` table (item_id, proposed_price, reason, requested_by, status, decided_by, decided_at). Admin-only `/pricing/queue` page to approve/reject; approval writes through to `inventory_items.retail_price`. RLS: editors insert, admin update. GRANTs included in same migration.

## Sprint 9 — AI parsing: bring-your-own key

- Admin-only setting in `/settings/workspace` for OpenAI / Gemini keys, stored in a `workspace_ai_keys` table; never exposed to client — fetched server-side only.
- Intake parsing server fn uses workspace key when present, else falls back to Lovable AI Gateway. Per-draft badge shows which provider was used. "Test key" button.

Migration: `workspace_ai_keys` with admin-only RLS + GRANTs.

## Sprint 10 — Audit gate, then Clover

Audit MUST pass before Clover work starts.

1. **Static audit**: typecheck, lint, dead-code sweep, route inventory vs sidebar, RLS coverage check (every public table has policies + GRANTs), server-fn role-guard check.
2. **Browser automation audit**: scripted flows for intake → reconcile → convert; bulk import (create/merge/skip); photo-on-file intercept; missing-tags export; QR deep-link; public catalog; barcode scan; pricing approval; AI key fallback. Findings logged to `.lovable/audit-2026-06.md`.
3. Fix blockers (hotfix sub-sprint if needed).
4. **Clover POS sync**: read-only first pass — pull Clover inventory, map by SKU/UPC, surface mismatches on `/integrations/clover`. Write-back is a follow-up. Activate the existing Clover placeholder route.

Migration: Clover connection table (workspace_id, merchant_id, access_token, last_sync_at) with admin-only RLS + GRANTs.

## Devlog discipline (every sprint)

After each sprint ships, prepend a new dated section to `.lovable/devlog.md` containing:

- Short narrative of what changed and why.
- Planned-vs-shipped table.
- Migrations referenced by filename/description.
- Files created/edited.
- "What's next" list mirroring the updated order in `mem://features/intake-roadmap` and `.lovable/plan.md`.

Also update `.lovable/plan.md` (move sprint to Shipped, trim queue) and the roadmap memory in the same turn the sprint ships.

## Technical notes

- Dashboard breakdown: do the aggregation in the server fn, not the client — fetch `retail_price, quantity_available, item_type` once and reduce server-side.
- Public catalog endpoint goes through a server fn or `/api/public/catalog` route — never expose the authenticated inventory query to anon.
- Per-type fields: prefer a typed JSONB column over many sparse columns; validate shape with Zod discriminated unions on `item_type`.
- BYO API keys: store in DB, never in `.env`; decrypt server-side only inside the parsing handler.
- Audit script lives at `scripts/audit.ts` and is re-runnable; browser automation uses the existing browser tools, not a new dependency.
