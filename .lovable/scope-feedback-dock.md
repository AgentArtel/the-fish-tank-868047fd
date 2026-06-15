# Scope — In-app Feedback Dock → GitHub issues (Option B now, A-ready)

## Goal
A floating, glassmorphic dock in the app where anyone logged in can file a **bug / UI issue / idea /
question** in two taps. On submit it captures device + page + recent logs + an optional user screenshot
and opens a **GitHub issue** (labeled by type). Claude triages on demand now (**Option B**); the issue
format + labels are built so a GitHub Action can later auto-trigger a Claude session (**Option A**) with
zero rework.

## UX (Claude's lane)
- **Dock:** fixed bottom-left, glassmorphic (`backdrop-blur`, translucent, ring/shadow), 4 icon buttons:
  🐞 Bug · 🎨 UI · 💡 Idea · ❓ Question. Mirrors the existing Quick-Add FAB pattern.
- **Form (Dialog):** type switcher, a description textarea, and **attach screenshot** (file picker +
  paste-from-clipboard, with thumbnail preview). Submit → toast with the new issue number.
- Only renders inside the authed app shell (`_app`), so submitters are always known users.

## Capture (auto, on submit)
- **Context:** URL/route, `navigator.userAgent`, platform, language, viewport + screen + DPR, app commit,
  timestamp, submitter (email/role).
- **Logs:** a lightweight **console ring buffer** (`console-buffer.ts`) records the last ~50 `error`/`warn`
  entries + `window.onerror` + unhandledrejections. (Browsers can't read past console history, so we start
  recording at app load.)
- **Screenshot:** user-attached image → uploaded to a **private `feedback` bucket** → embedded in the
  issue via a **1-year signed URL** (GitHub's image proxy caches it, so it persists).

## Pipeline (Claude's lane)
`submitFeedback` server fn (any active user):
1. Validates input (type, message ≤5000, bounded context, screenshot URL).
2. Builds a structured, machine-parseable Markdown body (fixed section headers) + title
   `🐞 [Bug] <first line>`.
3. `POST https://api.github.com/repos/{repo}/issues` with `Bearer $GITHUB_FEEDBACK_TOKEN`, labels
   `["feedback", <type>]`. Falls back to no-labels on 422 so an issue is always created.
4. Returns the issue URL/number.

## Option A readiness (later, no rework)
- Every issue is **labeled** (`feedback` + type) and has a **stable section format**, so a future
  workflow `on: issues.opened` (filter `label:bug`) can launch a Claude Code session to triage → fix →
  open a PR (which Claude can then watch via `subscribe_pr_activity`). That workflow file + trigger is
  the only addition needed for A.

## Infra needed (Lovable's lane — see handoff-feedback-infra.md)
1. Private **`feedback`** storage bucket + RLS (authenticated insert/select), mirroring `inventory-media`.
2. **`GITHUB_FEEDBACK_TOKEN`** in the app runtime env (+ Vault), a fine-grained PAT / GitHub App token with
   **Issues: read & write** on `AgentArtel/the-fish-tank-868047fd`. Optional `GITHUB_FEEDBACK_REPO` env
   (defaults to that repo).
3. One-time: create the GitHub **labels** `feedback`, `bug`, `ui`, `idea`, `question` (so labels stick and
   Option A can filter). Not blocking — the fn degrades to no-labels until they exist.

## Until infra lands
The dock ships and renders; submit returns a friendly "feedback isn't configured yet" until the token +
bucket exist. No other behavior changes.

## Invariants / notes
- Submitter must be an active user (`requireActive`); no admin gate (any staffer can report).
- Logs are capped + truncated; screenshots live in a private bucket (signed URLs only).
- No new route/nav — the dock is a global overlay in the existing shell.
