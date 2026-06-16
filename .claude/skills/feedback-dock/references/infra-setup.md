# Infra setup — copy-paste (storage bucket + token + labels)

Three pieces. The dock renders and degrades gracefully until #2 (the token) is set; #1 is
only needed if you keep screenshots; #3 is non-blocking.

---

## 1. Private screenshot storage

### Supabase (default) — versioned migration, not dashboard SQL
Private `feedback` bucket; the app reads screenshots back via a 1-year signed URL.

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('feedback','feedback', false)
  ON CONFLICT DO NOTHING;

-- Authenticated users may upload to + read from the feedback bucket.
CREATE POLICY "feedback authed insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'feedback');
CREATE POLICY "feedback authed select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'feedback');
```
If the host's storage policies are structured differently, match that structure. Requirement:
authenticated `INSERT` + `SELECT` on `bucket_id = 'feedback'`. Private bucket; no public policy.

### S3 / Cloudflare R2 alternative
- Create a **private** bucket (block public access).
- Server route issues a presigned PUT for upload and a long-lived presigned GET for the issue
  body (see `stack-profiles.md` → screenshot alternatives). Credentials stay server-side.

### No storage
Use the base64 fallback or drop screenshots (profile d in `stack-profiles.md`).

---

## 2. `GITHUB_FEEDBACK_TOKEN` secret (required for issue creation)

Create a **fine-grained Personal Access Token** scoped to the one repo, Issues-only:

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens →
   Generate new token**.
2. **Resource owner:** the repo's owner (org or user).
3. **Repository access:** *Only select repositories* → choose this repo (its `origin`).
4. **Permissions → Repository permissions → Issues: Read and write.** Leave everything else
   *No access*. (That's the only scope needed.)
5. Set an expiration; generate; copy the token (shown once).

Install the value:
- Put it in the **deployed app's runtime env** as `GITHUB_FEEDBACK_TOKEN` (and the project's
  secret store / Vault for parity). The server fn reads `process.env.GITHUB_FEEDBACK_TOKEN`.
- Never commit it. The repo owner/boss provides the value.

**Target repo (derive, don't hardcode):**
```bash
git remote get-url origin
# e.g. git@github.com:OWNER/REPO.git  or  https://github.com/OWNER/REPO.git
# → parse to OWNER/REPO (strip protocol, host, and trailing .git)
```
Set `GITHUB_FEEDBACK_REPO=OWNER/REPO` in the env, or bake that parsed default into
`submit-feedback.server.ts` (replace the `"OWNER/REPO"` placeholder).

---

## 3. GitHub labels (non-blocking)

Create five labels so they stick to issues and Option-A can filter `label:bug`:
`feedback`, `bug`, `ui`, `idea`, `question`.

```bash
for L in feedback bug ui idea question; do
  gh label create "$L" --repo OWNER/REPO 2>/dev/null || echo "label $L exists"
done
```
The server fn falls back to creating **unlabeled** issues (GitHub 422 → retry without labels),
so missing labels never block submission.

---

## Verification checklist
- [ ] (if keeping screenshots) storage bucket + policies applied.
- [ ] `GITHUB_FEEDBACK_TOKEN` set in app runtime env; repo derived from `origin`.
- [ ] (optional) the 5 labels created.
- [ ] Dock renders in the authed shell; the 4 buttons open the dialog.
- [ ] File **one test report** with a screenshot → toast shows an issue number.
- [ ] The GitHub issue has the title, Description, Screenshot (renders), Recent logs, and
      device/page/commit metadata.
- [ ] With the token unset, submit shows "feedback isn't configured yet" (no crash).
