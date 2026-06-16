# Option A — auto-triage (optional, later)

The core install (**Option B**) is "Claude triages on demand": feedback becomes a labeled,
well-structured GitHub issue that a human (or Claude, when asked) picks up. **Option A** is the
opt-in extension that closes the loop automatically. Install it only when the user explicitly
asks for full automation — the dock works completely without it.

## What it does
A GitHub Actions workflow fires on `issues.opened` filtered to `label:bug` (the label the dock
applies). It launches a Claude Code run that reads the issue (which uses the dock's **fixed
section headers** — Description / Screenshot / Recent logs / metadata — so it parses reliably),
attempts a fix on a new branch, and opens a PR referencing the issue. If a safe fix isn't
possible, it comments root-cause analysis instead. It never pushes to the default branch.

This is why Option B was built "A-ready": every issue is already labeled and structured, so
adding Option A is **just dropping in the workflow file** — no rework of the dock or server fn.

## Install
1. Copy `assets/feedback-autotriage.yml` → `.github/workflows/feedback-autotriage.yml`.
2. Add repo secret **`ANTHROPIC_API_KEY`** (Settings → Secrets and variables → Actions).
3. Workflow permissions: the file sets `contents:write` + `pull-requests:write` + `issues:write`.
   Also enable Settings → Actions → "Allow GitHub Actions to create and approve pull requests".
4. Choose the label filter: `bug` (only bugs) or `feedback` (all dock issues). Edit the `if:` and
   tune the prompt to the codebase's conventions.

## Secrets / permissions summary
- `ANTHROPIC_API_KEY` (or the action's provider/region config).
- `GITHUB_TOKEN` (default, same-repo) for issue/PR access — no extra PAT for same-repo PRs.
- The feedback dock's `GITHUB_FEEDBACK_TOKEN` is **separate** and unrelated to this workflow.

## Cautions
- Always review auto-opened PRs before merge — treat them as drafts.
- Scope the trigger narrowly (start with `label:bug`) to avoid noisy runs and API spend.
- Consider a manual gate: trigger on a `labeled` event for a `triage:auto` label a maintainer
  adds, rather than every opened bug, if you want a human in front of each run.
