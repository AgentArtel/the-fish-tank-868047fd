# The Fish Tank — Product Reality Map

> Brutally honest. Reflects what real users (store staff) would experience today. Pair with VISION.md.
> Detailed sprint history lives in `.lovable/devlog.md`.

## Status legend
- **Stable** — Real users can use end-to-end.
- **Technically working** — Wired up, polish/edge-case gaps remain.
- **Usable in testing** — Internal/seeded data only.
- **Infrastructure only** — Schema/tools exist; no user surface.
- **Not started** — No meaningful code.
- **Parked (intentional)** — Built to a stable foundation, deliberately not expanding.

## Map

| Layer / Feature | Status | Notes |
|---|---|---|
| **Facility location tree + QR labels** | Stable | Nested store_locations is the LOCKED source of truth for the physical shop; QR labels deep-link into `/inventory`. |
| **Vendor intake / receiving** | Technically working | Vendor batches, receiving, barcode scan on receive, bulk paste-import with dedupe, DOA photo enforcement. |
| **Inventory items + per-type attrs** | Technically working | Schema-driven `attrs` per item type (fish/coral/dry-good/etc.); photo-on-file gate before "available". |
| **Coral Discovery (plug/rack tagging)** | Technically working | Just shipped. Catalog corals by tank, tag each with its plug code (B3/X3/H8), drafts only. Pending first real-tank run + demo. |
| **Pricing approval queue** | Technically working | Admin-gated approval on **vendor line items**. Gap: does NOT yet cover inventory-item drafts created by Coral Discovery — see open decision in `.lovable/handoff-coral-discovery.md`. |
| **Public `/catalog`** | Technically working | Unauthenticated, sanitized read-only view of available stock with photos; QR labels deep-link customers in. |
| **Dashboard** | Technically working | Stock value by category (livestock / coral / dry goods). |
| **Marketing (content, publishing, campaigns, media, products)** | Usable in testing | Content calendar + posts + publishing + campaigns + media library exist; not the current focus. |
| **Settings — users & roles** | Stable | Invite, role assignment (admin/manager/creator/reviewer/staff/viewer), active-user gating. |
| **Settings — bring-your-own AI keys** | Technically working | Per-workspace provider/key config with Lovable Gateway fallback; admin-only. |
| **Tasks / SOPs** | Not started | Nav stub ("Coming soon"). Repeatable checklists for store ops. |
| **Clover POS sync** | Not started | Deferred until inventory is stable; needs external API access. |

## Current focus

Organizing the coral inventory: the **Coral Discovery** capture flow (photo + name + plug tag +
role + price, draft-only) and a **review → go-live path** so catalogued corals can be priced and
made available without bypassing the approval gates.

## Parked — do NOT expand without sign-off

- Clover POS sync
- Bulk / automation imports beyond the existing paste-import
- Off-site / bulk storage-unit workflows
- Fish & dry-goods discovery (extend after corals prove the loop)
- HID barcode-wedge input + persisted scan history
- Per-feature AI provider overrides
