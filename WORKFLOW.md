# The Fish Tank Team Workflow

> **Who reads this:** the human owner, Claude Code, and Lovable. Canonical, version-controlled
> definition of who does what and how we coordinate.
>
> **Companion docs:** VISION.md (why we build), REALITY_MAP.md (what's built), CLAUDE.md (rules).

## Roles

| Who | Role | Owns |
|---|---|---|
| **Human (owner)** | Product owner & final approver. Holds the "baton" — controls who works when. | Vision, priorities, approving plans, testing in the real app, go/no-go. |
| **Claude Code** | Technical lead + reviewer + frontend implementer. Plans work, writes specs for Lovable, **reviews/audits everything before it's done**. | Frontend logic, hooks, components, wiring, bug fixes; repo docs; builds/tests; review of Lovable's output. |
| **Lovable** | Backend/Supabase specialist + fast first-draft UI on request. | Everything under `supabase/` — migrations, RLS, GRANTs, edge functions, storage, auth — plus applying/deploying them. |
| **Codex** | *(Not active by default.)* Future async batch worker for well-scoped, independent cleanup tasks. | The maintenance backlog only — never feature dev or DB schema. |

The human does NOT message-pass between two AIs. **Claude Code writes Lovable's prompts and
reviews its output; the human approves at the gates.**

## Ownership lanes

- **Lovable's lane:** `supabase/` (migrations, edge functions, RLS, storage) + applying/deploying.
- **Claude Code's lane:** the frontend (`src/`), repo docs, build/test/review.
- **Neither crosses lanes without an explicit hand-off.** DB change needed? Claude writes a spec,
  Lovable implements it as a migration.

## The coordination loop

```
1. DECIDE   Human + Claude: pick the task. Claude writes a plan; human approves.
2. SPLIT    Claude splits into lanes:
              • DB / RLS / edge functions  → Claude drafts the exact Lovable prompt
              • Frontend logic / wiring / fixes → Claude does it directly
3. BUILD    Lovable executes backend → migration approved → synced to main.
            Claude executes frontend on a claude/<task> branch.
4. REVIEW   Claude pulls, runs typecheck + build, audits RLS, cache invalidation,
            CORS, caller-auth, wiring-bug patterns. (THE REVIEW GATE)
5. APPROVE  Human tests the real flow. Thumbs up → merge. Else → back to step 2.
```

## Branch & sync protocol

- **`main` is the integration branch and source of truth.** Everything lands here.
- **Lovable** publishes backend work straight to `main` (its default; it works in a temporary
  `edit/edt-*` branch internally and merges on publish). To put it on a dedicated branch instead,
  enable Lovable Labs → GitHub Branch Switching in Account Settings.
- **Claude Code** works on short-lived `claude/<task>` branches → PR → **human merges to `main`.**
- **One driver at a time, per change.** The human holds the baton:
  - Before a Claude task: ensure Lovable has finished/published.
  - Before a Lovable task: ensure Claude's related PRs are merged (two-way sync then pulls them in).
- **Never** run a Lovable session and a Claude task on the SAME change at once; never both edit
  the same edge function in one session.
- *Escalation:* if collisions persist, enable Lovable Labs → GitHub Branch Switching and point it
  at a `lovable/` branch so `main` is pure integration.

## Golden Rules (non-negotiable)

1. **All database/RLS/GRANT/edge-function/storage changes go through Lovable's migration/deploy
   flow.** Claude Code and the human NEVER run SQL against the live DB or change schema/RLS via the
   Supabase dashboard or CLI. This keeps the repo and live DB from diverging. Migrations are
   versioned files in `supabase/migrations/`, so every DB change is reviewable as a diff.
2. **Nothing is "done" until Claude Code has reviewed it.** (See Definition of Done.)
3. **Stay in your lane. Hand-offs are explicit and human-controlled.** One driver at a time.
4. **Scope comes from the human + the vision/reality docs.** No agent expands parked layers or
   changes routing/navigation/architecture without explicit sign-off.
5. **Read before writing; plan fully, edit once.**

## Definition of Done

- **Builds clean** (typecheck + build pass); lint no worse than before.
- **If the DB was touched:** migration committed AND applied via approval; RLS reviewed (right rows,
  no IDOR); types regenerated.
- **If an edge function was touched:** deployed; caller auth/JWT verified; CORS correct; no secrets logged.
- **Frontend:** data-cache keys invalidated on every mutation; no white-screen on empty/null data;
  dialogs reset between opens.
- **The human has tested the actual flow in the running app** — not just "it compiles."

## Hand-off log

Cross-lane hand-offs for this project are recorded as dated docs in `.lovable/` (e.g.
`.lovable/handoff-coral-discovery.md`) and summarized in `.lovable/devlog.md`. When Claude writes a
spec for Lovable (or vice-versa), drop the coordination note there so the trail is reviewable.

## Adding Codex later

Stay two-agent until the product is stable. Add Codex only when there's a backlog of ~5+ small,
independent, clearly-specified, independently-testable tickets. Then: Claude scopes them → human
fires them at Codex as parallel async jobs → Claude reviews the returned PRs.
