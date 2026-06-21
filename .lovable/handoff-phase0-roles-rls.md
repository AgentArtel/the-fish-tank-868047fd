# Handoff → Lovable: Phase 0 — collapse to 3 roles + floor-staff write tier

> The foundation that unblocks the **entire employee-wizard layer** (`.lovable/brainstorm-employee-wizards.md`).
> Owner decision (2026-06-21): the role set is **just three — `admin · dev · floor staff`**, and **floor
> staff is the employee write-tier**. This handoff is the DB side; the app side (auth-guards, users UI,
> wizard guards) is Claude's and follows once the enum/RLS land.

## 1. Collapse the role enum (6 → 3) `[DB=Lovable]`
Current `app_role`: `admin, manager, creator, reviewer, staff, viewer`. Target: **`admin, dev, floor_staff`**.

**Migration (map existing `user_roles` rows):**
| Old | New | Note |
|---|---|---|
| `admin` | `admin` | — |
| `manager` | `admin` | oversight → admin |
| `reviewer` | `admin` | approval authority → admin |
| `creator` | `admin` | content authoring → admin *(see open decision)* |
| `staff` | `floor_staff` | the employee write-tier |
| `viewer` | `floor_staff` | ⚠️ gains write — **review existing viewer accounts first**; deactivate any that shouldn't |
| *(new)* | `dev` | **no auto-mapping** — owner assigns `dev` to the technical superuser(s) manually |

Drop the unused enum values after backfilling. Keep it a versioned migration (no dashboard edits).

## 2. Role helper functions `[DB=Lovable]`
- **`dev` = admin-tier.** Everywhere RLS/helpers check admin, allow dev too. Recommend a helper
  `is_admin_or_dev(uid)` = `has_role(uid,'admin') OR has_role(uid,'dev')`, and repoint `can_edit_content`
  (currently active + admin|creator|reviewer|manager) to **active + `is_admin_or_dev`**.
- **New `is_floor_staff_or_above(uid)`** = active AND (`admin` OR `dev` OR `floor_staff`). This is the
  predicate the floor-staff operations check.

## 3. RLS / write model — narrow, not broad `[DB=Lovable]` `[Decision to confirm]`
**Keep direct-table writes editor-only** (admin/dev via `can_edit_content`) on `inventory_items`,
`content_items`, pricing, Clover config, etc. — do **not** broadly add floor_staff to those policies.
Instead, **floor-staff actions go through `SECURITY DEFINER` RPCs** that internally check
`is_floor_staff_or_above(auth.uid())` and perform one specific, safe write. This keeps staff's blast radius
to exactly the defined operations (count, mortality, hold, relocate, manual sale, receive, trade-in) — they
can't arbitrarily edit inventory, pricing, or go-live.

These per-wizard RPCs are defined **as each wizard is built** (Claude specs them with you). For **Phase 0**,
just ship the foundation above + this one to unblock the first P0 wizard (mortality):
- **`record_inventory_loss(_inventory_item_id uuid, _qty numeric, _reason text, _note text DEFAULT NULL)`** —
  `SECURITY DEFINER`, checks `is_floor_staff_or_above`. Atomically: moves `_qty` from `quantity_available`
  → `quantity_lost` (clamped), flips `availability_status='sold_out'`/`dead_lost` at the boundary, and
  writes an `inventory_activity_logs` row. (Fixes the audited bug where `dead_lost` never moves
  `quantity_lost`.) Granted to `authenticated`.

## 4. App side (Claude, after this lands) — for your awareness
- `src/lib/auth-guards.ts`: `requireAdmin` → admin|dev; `requireEditor` → admin|dev; **new
  `requireFloorStaff`** → admin|dev|floor_staff. Wizard server fns / RPC calls use `requireFloorStaff`;
  pricing/go-live/Clover-config stay `requireAdmin`.
- `settings.users.tsx`: present the 3 roles only.
- Each employee wizard calls its `SECURITY DEFINER` RPC (gated client-side by `requireFloorStaff`, enforced
  server-side by the RPC's `is_floor_staff_or_above` check).

## Open decisions (owner) — not blockers for the enum, but confirm
1. **Content authoring** — does `floor_staff` draft CMS posts, or is content admin-only? (Above assumes
   admin-only → `creator`→`admin`.) If staff should draft, we add a content RPC/policy for floor_staff.
2. **Store credit** — separate feature (underpins trade-ins/returns), **not** Phase 0. Decide later.

## Reply with
Confirm the enum migration + the `is_admin_or_dev` / `is_floor_staff_or_above` helpers + the
`record_inventory_loss` RPC are in, and I'll do the app-side auth-guard + users-UI refactor and build the
mortality wizard against it.
