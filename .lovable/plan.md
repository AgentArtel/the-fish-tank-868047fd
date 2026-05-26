
# Reposition app as "The Fish Tank Workspace"

Positioning, navigation, and copy update only. CMS stays fully functional as one module; Operations appears as "Soon" placeholders. No schema, auth, RLS, workflow, or integration changes.

## 1. Rename across user-facing surfaces

Replace "The Fish Tank CMS" with "The Fish Tank Workspace" wherever it appears as the app name. Keep "CMS" only when referring to the content module specifically.

- `src/routes/__root.tsx` — `<title>` → "The Fish Tank Workspace"; meta description → "Internal business operations workspace for The Fish Tank."
- `src/routes/_app.tsx` — sidebar header: "The Fish Tank" / "Workspace".
- `src/routes/login.tsx` — title "The Fish Tank Workspace", subtitle "Internal Business Operations Workspace".
- `src/routes/signup.tsx` — title "The Fish Tank Workspace", helper "New accounts require admin approval before accessing The Fish Tank Workspace."
- `src/routes/pending-approval.tsx` — "Your account is pending approval." + "An admin needs to approve your account before you can access The Fish Tank Workspace."
- `src/routes/_app/dashboard.tsx` — welcome card title "The Fish Tank Workspace" + subtitle "Manage content, media, products, publishing workflows, and future store operations from one internal workspace." `PageHeader` description → "Content pipeline health across the workspace."

## 2. Sidebar reorganization (`src/routes/_app.tsx`)

Rewrite the `NAV` constant into labeled groups rendered with small uppercase group headers. "Soon" items use muted styling + a small pill but are real links to their coming-soon page.

```text
Workspace
  - Dashboard
Content
  - Calendar
  - Content Items
  - Publishing
  - Campaigns
Media
  - Media Library
Products
  - Products
Operations
  - Inventory Intake   (Soon)
  - Vendors            (Soon)
  - Store Placement    (Soon)
  - Tasks / SOPs       (Soon)
Settings
  - Meta Placeholder
  - Users              (admin only, unchanged)
```

## 3. Coming-soon placeholder routes

- `src/components/coming-soon.tsx` — shared component: `PageHeader` with title + description, "Coming soon" `Badge` in the action slot, a "Planned capabilities" list of bullets, and an optional footnote line.
- `src/routes/_app/inventory-intake.tsx` — bullets: vendor shipments, invoice batches, uploaded PDFs, shipment line items, approval into inventory records. **Footnote:** "Future Clover integration: approved product and inventory records may later sync to Clover. No Clover API calls, OAuth, tokens, webhooks, or sync logic are active in this version."
- `src/routes/_app/vendors.tsx` — wholesalers, vendor contacts, invoice/order history, shipment records.
- `src/routes/_app/store-placement.tsx` — tank location, shelf/display placement, signage needs, photo/content needs, website readiness.
- `src/routes/_app/tasks.tsx` — repeatable workflows, content checklists, product intake checklists, weekly store operations tasks.

No DB tables, no server functions, no schema changes for any of these.

## 4. Meta settings copy (`src/routes/_app/settings.meta.tsx`)

`PageHeader` title → "Meta Placeholder", description → "Future integration settings for Meta Business tools. No OAuth, tokens, or API posting are active in this version." Amber banner reworded to match. Form behavior unchanged.

## 5. Content module language

Page-header `title` strings only (no logic changes):
- Calendar → "Content Calendar"
- Content list → "Content Items"
- Publishing → "Publishing Checklist"
- Media → "Media Library"
- Campaigns → unchanged

## 6. Products page positioning copy

`src/routes/_app/products.tsx` `PageHeader` description → "Products in the workspace should eventually support content, website readiness, inventory workflows, and future Clover sync. For now these are lightweight content-support records — not full inventory." No fields, tables, or behavior changes.

## What is explicitly NOT changing

- No DB migrations, RLS edits, or new tables (no Clover, vendor, inventory, or task tables).
- No auth/signup/approval logic changes.
- No content workflow, status, or publishing logic changes.
- No Meta or Clover API integration, OAuth, tokens, webhooks, or sync logic.
- No visual redesign — current Fish Tank palette, mascot, and badge stay.

## Acceptance check (manual, after build)

1. Sidebar shows grouped sections with Operations items badged "Soon".
2. Login, signup, pending-approval, dashboard card, and browser tab all read "The Fish Tank Workspace".
3. Each Operations link loads a clean coming-soon page; Inventory Intake shows the Clover footnote; Products page shows the future-Clover-sync sentence.
4. Existing flows still work: log in, dashboard counters, create content item, upload media, create product/campaign, edit publishing checklist, save Meta settings, deactivate user (admin).
