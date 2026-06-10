# The Fish Tank Development Rules

## Product Vision (North Star)
- **Vision / intent:** [`VISION.md`](./VISION.md) — read for *why* a feature exists.
- **Current reality:** [`REALITY_MAP.md`](./REALITY_MAP.md) — what's actually built today.
- **Current focus:** organizing the coral inventory (catalog by tank with plug/rack tags, then the
  review → go-live path). Later phases are direction, not scope — don't expand parked layers
  without sign-off.

## Team Workflow
- **Roles & coordination:** [`WORKFLOW.md`](./WORKFLOW.md) — who does what across the human,
  Claude Code, and Lovable; the branch/sync protocol; the review gate; the Definition of Done.
  Read this before backend work or anything that crosses lanes.
- **Sprint history & hand-offs:** `.lovable/devlog.md` (running log) and dated
  `.lovable/handoff-*.md` notes (cross-lane coordination with Lovable).

## Engineering Rules
1. **Reuse first** — check for existing components/hooks before creating new ones.
2. **No architecture changes without approval** — never change routing/navigation/component
   hierarchy without explicit sign-off.
3. **Read before writing** — understand the existing data flow before modifying a file.
4. **Plan fully, edit once.**
5. **Cache invalidation** — wire mutation `onSuccess` to invalidate the right TanStack Query keys.
6. **Don't reinvent the wheel** — reuse and restyle what exists.

## Project invariants (domain rules — never override without sign-off)
- **AI is draft-only.** AI parsing cannot approve pricing, mark review approved, convert to
  inventory, or create `inventory_items`. A human always decides.
- **Pricing approval is admin-only.** Baseline is 3× wholesale; admin must approve before an item
  goes live. Per-line overrides are allowed but still admin-approved.
- **No item is `available` without a photo.** Enforced by a DB trigger *and* the UI photo-on-file
  wizard. (Discovery drafts stay `incoming`/`not_for_sale`/`on_hold` until reviewed.)
- **All mutating server fns check `is_active` + role** (`requireEditor` for editors, admin check
  for admin-only actions).
- **DB changes are Lovable's lane.** Every schema/RLS/storage change is a versioned migration in
  `supabase/migrations/` — never dashboard SQL. See WORKFLOW.md Golden Rules.
