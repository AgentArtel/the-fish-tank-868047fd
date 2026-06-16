## What I can see from here

- **`GITHUB_FEEDBACK_REPO` is not in the runtime secret store.** The current secret list contains `GITHUB_FEEDBACK_TOKEN` but no `GITHUB_FEEDBACK_REPO`, so `process.env.GITHUB_FEEDBACK_REPO` is `undefined` in the deployed function.
- That means the server fn is already falling back to its hard-coded default: `AgentArtel/the-fish-tank-868047fd` (see `src/lib/feedback.functions.ts`, the `repo = process.env.GITHUB_FEEDBACK_REPO ?? "AgentArtel/the-fish-tank-868047fd"` line).
- So #103 is **not** caused by `GITHUB_FEEDBACK_REPO` pointing at the wrong place — there's nothing to unset. The misroute has to be coming from the **token**: a fine-grained PAT or GitHub App installation is bound to whatever repo it was issued for, and GitHub's Issues API will happily create the issue against the token's owning repo even when the URL names a different one (or the token belongs to a fork/another account that the issuer has access to).

## Plan

1. **Confirm the token is the root cause.** Boss verifies on GitHub which account/repo the current `GITHUB_FEEDBACK_TOKEN` is scoped to. Expected fix: re-issue it as a fine-grained PAT (or GitHub App install) on `AgentArtel/the-fish-tank-868047fd` with **Issues: Read & write** only.
2. **Rotate the secret.** Once the boss has the new token value, I'll call `secrets--update_secret` for `GITHUB_FEEDBACK_TOKEN` so the new value is picked up on the next deploy.
3. **(Optional belt-and-suspenders)** Add `GITHUB_FEEDBACK_REPO=AgentArtel/the-fish-tank-868047fd` as an explicit secret so the target repo is visible/auditable in the secret list instead of implicit in code. Skippable — the code default is already correct.
4. **Re-test.** Boss fires one feedback submission from the dock; we confirm the new issue lands in `AgentArtel/the-fish-tank-868047fd` and Claude reads it back via GitHub.

No app code changes. No migration. Only a secret rotation once the boss has the correctly-scoped token.

## Question back to you

Want me to (a) just stage the `GITHUB_FEEDBACK_TOKEN` rotation prompt now so the boss can paste the new token as soon as they generate it, or (b) also add the explicit `GITHUB_FEEDBACK_REPO` secret while we're in here?
