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
7. **External integrations are Supabase Edge Functions — NEVER app server functions.** Any third-party
   HTTP/`fetch`, web scraping, AI inference (`callAIChat`), external API/SDK, image download/OCR, or
   long-running/heavy I/O lives in a Supabase Edge Function (`supabase/functions/`) — never a TanStack
   `createServerFn` (those run on the Cloudflare Worker and hit its subrequest/CPU/time budget). App
   server fns are limited to **auth-gated DB reads/writes**; the UI is **data-driven** — it invokes the
   edge fn and reacts to the table state the edge fn writes, never blocking on external I/O. Division of
   labor: **Lovable owns edge-function deploy, secrets, and integration-testing; either party may author
   the Deno code** (Claude authors most once the foundation + reusable AI/Firecrawl helpers exist). The app
   stays a thin invoke + table-read consumer. If you're about to add a `fetch` to a third party or an AI
   call inside a server fn — **stop**, it belongs in an edge fn.

## Project invariants (domain rules — never override without sign-off)
- **External integrations live in edge functions, not the app Worker.** (Engineering Rule 7.) Third-party
  I/O, scraping, and AI inference belong in Supabase Edge Functions; the app invokes them and reacts to the
  data they write. No new app-side external I/O — ever — without explicit sign-off. The existing violations
  (all integrations are currently app-side — there are *no* edge functions yet) are being migrated
  incrementally: see `.lovable/scope-edge-function-migration.md`.
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
