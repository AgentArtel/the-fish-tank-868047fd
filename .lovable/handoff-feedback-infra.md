# Handoff → Lovable: Feedback dock infra (storage bucket + GitHub token)

Claude built an in-app **feedback dock** that files GitHub issues (scope-feedback-dock.md). The app code
is ready; it needs two infra pieces from you. Until both exist, the dock renders but submit returns
"feedback isn't configured yet" — no other impact.

## 1. Private `feedback` storage bucket (migration)
Screenshots upload here; the app reads them back via a 1-year signed URL (same pattern as the `media` /
`inventory-media` buckets). Mirror the existing storage RLS so authenticated users can upload + read.

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('feedback','feedback', false)
  ON CONFLICT DO NOTHING;

-- Authenticated users can upload to + read from the feedback bucket (mirrors inventory-media policies).
CREATE POLICY "feedback authed insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback');
CREATE POLICY "feedback authed select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'feedback');
```
(If your existing storage policies are structured differently, match that structure — the requirement is:
authenticated `INSERT` + `SELECT` on `bucket_id = 'feedback'`. Private bucket; no public policy.)

## 2. `GITHUB_FEEDBACK_TOKEN` in the app runtime env (+ Vault)
Same mechanism as `SCRAPE_CRON_SECRET` / `CLOVER_API_TOKEN` — the server fn reads
`process.env.GITHUB_FEEDBACK_TOKEN`.
- **Token:** a fine-grained PAT **or** GitHub App installation token scoped to
  `AgentArtel/the-fish-tank-868047fd` with **Issues: Read and write** (nothing else needed).
- Put it in the **deployed app's runtime env** (required) and **Vault** (for parity / future cron use),
  exactly like `SCRAPE_CRON_SECRET`.
- Optional: `GITHUB_FEEDBACK_REPO` env = `AgentArtel/the-fish-tank-868047fd` (the code already defaults to
  this, so only set it if the target repo ever changes).
- **The boss provides the token value** — never commit it.

## 3. One-time: create GitHub labels (nice-to-have, not blocking)
Create labels `feedback`, `bug`, `ui`, `idea`, `question` on the repo so labels stick to issues and the
future auto-triage workflow (Option A) can filter `label:bug`. The server fn falls back to creating
unlabeled issues until these exist, so this isn't a blocker.

## Checklist
- [ ] `feedback` bucket + RLS migration applied
- [ ] `GITHUB_FEEDBACK_TOKEN` set in app runtime env (+ Vault)
- [ ] (optional) repo labels created
- [ ] Reply here → Claude verifies a test submission lands as an issue
