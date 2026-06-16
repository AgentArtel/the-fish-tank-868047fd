---
name: feedback-dock
description: Add an in-app feedback widget (bug/UI/idea/question) that captures device + page + console logs + a screenshot and files a GitHub issue. Use when the user wants in-app bug reporting, a feedback button/dock, or to turn user reports into GitHub issues.
---

# Feedback Dock → GitHub Issues

Installs a floating, glassmorphic feedback dock into the host web app. A logged-in
user picks a type (bug / UI / idea / question), writes a note, optionally attaches or
pastes a screenshot, and submits. The app captures page + device + viewport + recent
console logs, uploads the screenshot to private storage, and opens a **labeled GitHub
issue** via the REST API. Until infra (token/bucket) lands, it degrades gracefully with
a "not configured yet" message.

This skill is **stack-adaptive**. The four reference files in `assets/` are written for
the canonical TanStack-Start + Supabase + shadcn/ui app; adapt them to the host stack as
you install. Keep `SKILL.md` as the map — read the asset/reference files when you need
the actual code.

## 0. Decisions & invariants (state these to the user, keep them true)
- **Graceful until configured.** If `GITHUB_FEEDBACK_TOKEN` is unset, submit returns a
  friendly "feedback isn't configured yet" — the dock still renders. Don't crash.
- **Submitter must be an authenticated user.** Mount inside the authed shell and guard the
  server endpoint with the host app's auth check.
- **Private screenshots.** Upload to a *private* bucket; embed via a long-lived **signed
  URL** (GitHub's image proxy caches it). Never a public bucket.
- **Token scoped to issues only.** Fine-grained PAT with **Issues: Read and write** on the
  one repo. Nothing else.
- **No new route.** The dock is a global overlay mounted once in the app shell.
- **Repo is derived, never hardcoded.** Default the target repo from the host project's
  `origin` remote (see step 4). The example repo string in the assets is a placeholder.
- **Issue body has fixed section headers** so the optional Option-A auto-triage workflow
  can parse it later.

## 1. Detect the host stack (do this first)
Inspect the project before copying anything:
- **Framework / server model:** `package.json` deps + config. Look for `@tanstack/react-start`
  (TanStack Start server fns), `next` (App Router route handler / server action), or plain
  Vite + React (needs a separate API route — Express/edge/serverless).
- **UI lib:** shadcn/ui (`@/components/ui/*`, `lucide-react`)? MUI? plain CSS? Adapt the
  dialog/button/textarea imports accordingly, or fall back to plain elements.
- **Storage:** Supabase (`@supabase/supabase-js`)? S3/R2? none? Drives the screenshot path.
- **Auth:** how the app identifies the current user server-side (Supabase auth middleware,
  NextAuth session, JWT, etc.). This replaces the marked `// TODO: your app's auth guard`.

State what you detected, then map to one of the install profiles in step 2.

## 2. Install profiles (pick by detected stack)
Read `references/stack-profiles.md` for the full per-stack details. Quick map:

| Stack | Server endpoint | Screenshot upload | Image tag |
|-------|-----------------|-------------------|-----------|
| **(a) TanStack Start + Supabase + shadcn** (canonical) | `createServerFn` (assets as-is) | Supabase Storage signed URL | `<img>` |
| **(b) Next.js App Router** | route handler `app/api/feedback/route.ts` **or** a server action | Supabase Storage / S3 presigned, or base64 fallback | `next/image` |
| **(c) Vite + React (no meta-framework)** | Express/edge route `/api/feedback` | S3/R2 presigned, or base64 fallback | `<img>` |
| **(d) any, no storage** | (as above) | **base64-in-issue fallback** (embed a small data-URI image, or skip) | `<img>` |

In every profile: **issue creation is always the GitHub REST API** (`POST /repos/{repo}/issues`)
with a scoped bearer token, labels `["feedback", <type>]`, falling back to unlabeled on 422.

## 3. Place & wire the four source files
Copy from `assets/`, adapting per the profile, into the host's conventional locations:
- `feedback-dock.tsx` → components dir. The dock UI + dialog + submit flow. Adapt UI imports,
  the storage upload block, and the `<img>`/`next/image` tag.
- `feedback-capture.ts` → lib/util dir. Page/device/viewport/commit capture. Adapt the commit
  env var (`VITE_GIT_SHA` → `NEXT_PUBLIC_GIT_SHA`/`process.env`/`"unknown"`).
- `console-buffer.ts` → lib/util dir. Stack-agnostic; copy verbatim.
- `submit-feedback.server.ts` → server fn / route handler. Replace the `// TODO: your app's
  auth guard`, read `GITHUB_FEEDBACK_TOKEN` + derived repo, build the Markdown body.

Then **mount the dock once** in the global authed shell/layout (Next: `app/(app)/layout.tsx`;
TanStack: the `_app` route; Vite: the top-level authed layout). Render `<FeedbackDock />`
beside any existing FAB — do not add a route.

## 4. Provision infra
See `references/infra-setup.md` for copy-paste SQL + token steps + labels. Summary:

**Derive the repo** (do not hardcode):
```bash
git remote get-url origin   # → parse owner/name, strip .git / git@ / https://
```
Set it as the default for `GITHUB_FEEDBACK_REPO` (or bake the parsed `owner/name` into the
server fn default).

**Storage bucket** — example is Supabase (private `feedback` bucket + authed insert/select RLS).
For S3/R2: a private bucket + server-side presigned PUT/GET. For no storage: use the base64
fallback (profile d) and skip this.

**`GITHUB_FEEDBACK_TOKEN` secret** — fine-grained PAT, **Issues: Read and write** on the repo
only. Put it in the deployed app's runtime env (and the project's secret store). Exact GitHub
steps in `references/infra-setup.md`. The boss provides the value; never commit it.

**Labels** (non-blocking) — create `feedback`, `bug`, `ui`, `idea`, `question` on the repo so
labels stick. The server fn falls back to unlabeled until they exist.

## 5. Verify
- Dock renders in the authed shell; the 4 type buttons open the dialog.
- With the token + bucket set, file **one test report** (attach a screenshot).
- Confirm a GitHub issue lands with: correct title (`🐞 [Bug] …`), the **Description**,
  **Screenshot** (renders), and **Recent logs** sections, plus device/page/commit metadata.
- Without the token, submit shows the friendly "not configured yet" message (no crash).

## 6. Option A — auto-triage (optional, later)
Only if the user asks for full automation. See `references/option-a-autotriage.md` and the
template `assets/feedback-autotriage.yml`: a GitHub Action on `issues.opened` filtered to
`label:bug` (or `feedback`) that launches a Claude Code run to triage → fix → open a PR. It's
opt-in and needs its own secrets/permissions; the core (Option B) install works without it.
