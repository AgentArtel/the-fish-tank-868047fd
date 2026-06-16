# Stack profiles — adapting the four source files

Read this when installing into a specific host stack. The four assets are written for
profile (a); each profile below lists exactly what to change. The **GitHub issue creation
is identical in all profiles** — always `POST https://api.github.com/repos/{repo}/issues`
with a scoped bearer token, labels `["feedback", <type>]`, retry unlabeled on 422.

## (a) TanStack Start + Supabase + shadcn/ui — canonical
The assets match this almost as-is.
- `feedback-dock.tsx`: use the TanStack `useServerFn(submitFeedback)` binding (commented at
  the top of the asset) instead of the `submitViaApi` fetch wrapper. Keep the Supabase
  `uploadScreenshot` variant.
- `submit-feedback.server.ts`: use the `createServerFn` block at the bottom; attach the app's
  auth middleware; resolve the submitter identity in the handler (the `who` string).
- Mount `<FeedbackDock />` in the `_app` route shell beside the existing FAB.
- Storage: Supabase private `feedback` bucket (infra-setup.md SQL).

## (b) Next.js (App Router)
- **Server endpoint:** create `app/api/feedback/route.ts` and use the `POST(req)` block at the
  bottom of `submit-feedback.server.ts`. Move the validation + `createIssue` helpers into it or
  a shared `lib/feedback.ts`. Alternatively a `"use server"` server action with the same logic.
- **Client:** keep `feedback-dock.tsx`'s `submitViaApi` fetch wrapper pointing at `/api/feedback`.
- **Image:** swap the preview `<img>` for `next/image` (or keep `<img>` — the preview is a local
  object URL, so the eslint-disable is fine).
- **Commit env:** `feedback-capture.ts` → read `process.env.NEXT_PUBLIC_GIT_SHA`.
- **Mount:** render `<FeedbackDock />` in the authed segment layout, e.g. `app/(app)/layout.tsx`.
  It's a client component (`"use client"` at the top).
- **Storage:** Supabase, or S3/R2 presigned (see below), or base64 fallback.

## (c) Vite + React (no meta-framework)
- **Server endpoint:** you need a backend. Add an Express/Fastify/edge route `POST /api/feedback`
  that runs the validation + auth guard + `createIssue` from `submit-feedback.server.ts`. The
  GitHub token lives only here, server-side.
- **Client:** keep the `submitViaApi` fetch wrapper.
- **Commit env:** `import.meta.env.VITE_GIT_SHA` (as shipped).
- **Mount:** render `<FeedbackDock />` in the top-level authed layout component.
- **Storage:** S3/R2 presigned or base64 fallback (usually no Supabase here).

## (d) Any stack, no storage
- Use the **base64 fallback** in `uploadScreenshot` (commented in `feedback-dock.tsx`). Note the
  caveat: GitHub strips `data:` URIs from rendered issue images. Options, best first:
  1. Add minimal object storage (S3/R2/Supabase) — strongly preferred; screenshots are the
     highest-signal part of a report.
  2. Have the server fn upload the bytes as a GitHub issue attachment via the (unofficial)
     upload flow, or commit it to a `feedback-assets` branch and link the raw URL.
  3. Ship without screenshots: drop the attach UI and the `screenshotUrl` field entirely.

## Screenshot upload alternatives (profiles b/c/d)
**S3 / R2 presigned (recommended when not on Supabase):**
1. Server route `POST /api/feedback/upload-url` returns a presigned PUT URL for a random key in
   a **private** bucket.
2. Client `uploadScreenshot` does `fetch(putUrl, { method:"PUT", body:file })`.
3. Return a presigned GET URL (long expiry) or a CloudFront/worker-signed URL for the issue body.
Keep the bucket private; never make screenshots world-public.

## UI library swaps
The dock uses shadcn `Dialog`/`Button`/`Textarea` + `lucide-react` + `sonner`. If absent:
- shadcn not installed → `npx shadcn@latest add dialog button textarea` (Tailwind projects), or
  replace with the host's components, or a plain `<div>` overlay + `<button>`/`<textarea>`.
- No `lucide-react` → install it, or swap to the host's icon set / emoji.
- No `sonner` → use the host's toast, or `window.alert` as a stopgap.
The glassmorphic classes are Tailwind; for non-Tailwind hosts, port them to CSS.
