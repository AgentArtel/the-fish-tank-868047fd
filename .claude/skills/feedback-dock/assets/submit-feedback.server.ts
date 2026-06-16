// submit-feedback.server.ts — Server endpoint that turns a feedback submission into a
// labeled GitHub issue via the REST API. Runs server-side ONLY (reads the secret token).
//
// ───────────────────────────────────────────────────────────────────────────────────
// WHAT TO ADAPT PER STACK
//  1. Transport wrapper:
//     - TanStack Start (canonical, shown): `createServerFn({ method:"POST" }).middleware(...)
//       .inputValidator(...).handler(...)`.
//     - Next.js App Router: export `async function POST(req: Request)` from
//       app/api/feedback/route.ts — parse+validate `await req.json()`, run the auth guard,
//       then call `createIssue(...)` below and `return Response.json(...)`.
//     - Next.js server action: a `"use server"` async fn taking the same payload.
//     - Vite + Express: `router.post("/api/feedback", ...)` doing the same.
//     The validation, body builder, and createIssue() logic are stack-agnostic — reuse them.
//  2. Auth guard: replace the `// TODO: your app's auth guard` block with the host app's
//     server-side user check (Supabase auth middleware / NextAuth session / JWT). The
//     submitter MUST be an authenticated user. `who` is just a display string for the body.
//  3. Repo: GITHUB_FEEDBACK_REPO env, defaulting to the host's origin "owner/name". During
//     install, parse `git remote get-url origin` and bake that default in — do NOT ship a
//     hardcoded foreign repo.
// ───────────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

// ─── Validation (stack-agnostic) ─────────────────────────────────────────────────────
const contextSchema = z
  .object({
    url: z.string().max(2000).optional(),
    path: z.string().max(500).optional(),
    userAgent: z.string().max(1000).optional(),
    platform: z.string().max(200).optional(),
    language: z.string().max(50).optional(),
    viewport: z.string().max(50).optional(),
    screen: z.string().max(50).optional(),
    dpr: z.number().optional(),
    appCommit: z.string().max(100).optional(),
    capturedAt: z.string().max(50).optional(),
    logs: z
      .array(z.object({ level: z.string().max(40), msg: z.string().max(2000), at: z.string().max(50) }))
      .max(50)
      .optional(),
  })
  .optional();

export const feedbackInputSchema = z.object({
  type: z.enum(["bug", "ui", "idea", "question"]),
  message: z.string().trim().min(1).max(5000),
  context: contextSchema,
  screenshotUrl: z.string().url().max(2000).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  bug: { label: "Bug", emoji: "🐞" },
  ui: { label: "UI issue", emoji: "🎨" },
  idea: { label: "Idea", emoji: "💡" },
  question: { label: "Question", emoji: "❓" },
};

// ─── Core: build the issue body + POST to GitHub (stack-agnostic) ─────────────────────
// `reportedBy` is a display string (email/name/id) resolved from the authed session.
export async function createIssue(
  data: FeedbackInput,
  reportedBy: string,
): Promise<{ ok: true; url: string; number: number }> {
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  // INSTALL: replace the fallback with the parsed origin "owner/name" of THIS repo.
  const repo = process.env.GITHUB_FEEDBACK_REPO ?? "OWNER/REPO";
  if (!token) {
    throw new Error("Feedback isn't configured yet — an admin needs to set GITHUB_FEEDBACK_TOKEN.");
  }

  const meta = TYPE_META[data.type];
  const firstLine = data.message.split("\n")[0].slice(0, 80);
  const title = `${meta.emoji} [${meta.label}] ${firstLine}`;

  const ctx = data.context ?? {};
  const logsBlock = (ctx.logs ?? []).map((l) => `[${l.at}] ${l.level}: ${l.msg}`).join("\n");
  // Fixed section headers so the optional Option-A auto-triage workflow can parse this.
  const body = [
    `**Type:** ${meta.label}`,
    `**Reported by:** ${reportedBy}`,
    `**Page:** ${ctx.url ?? "—"}`,
    `**Device:** ${ctx.userAgent ?? "—"}`,
    `**Viewport / screen:** ${ctx.viewport ?? "—"} / ${ctx.screen ?? "—"} @${ctx.dpr ?? 1}x`,
    `**App commit:** ${ctx.appCommit ?? "unknown"}`,
    `**Captured:** ${ctx.capturedAt ?? "—"}`,
    ``,
    `### Description`,
    data.message,
    ``,
    data.screenshotUrl ? `### Screenshot\n![screenshot](${data.screenshotUrl})\n` : "",
    logsBlock ? `### Recent logs\n\`\`\`\n${logsBlock}\n\`\`\`\n` : "",
    `<sub>Filed from the in-app feedback dock.</sub>`,
  ]
    .filter(Boolean)
    .join("\n");

  const create = (withLabels: boolean) =>
    fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "in-app-feedback-dock",
      },
      body: JSON.stringify(
        withLabels ? { title, body, labels: ["feedback", data.type] } : { title, body },
      ),
    });

  // Try with labels; if they don't exist yet GitHub 422s, so retry unlabeled.
  let res = await create(true);
  if (res.status === 422) res = await create(false);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Couldn't file the issue (GitHub ${res.status}). ${detail.slice(0, 200)}`);
  }
  const issue = (await res.json()) as { html_url: string; number: number };
  return { ok: true, url: issue.html_url, number: issue.number };
}

// ─── TanStack Start binding (canonical). Delete this block for other stacks. ──────────
// import { createServerFn } from "@tanstack/react-start";
//
// export const submitFeedback = createServerFn({ method: "POST" })
//   // .middleware([requireAuthMiddleware])   // <- your app's auth middleware
//   .inputValidator((d) => feedbackInputSchema.parse(d))
//   .handler(async ({ data, context }) => {
//     // TODO: your app's auth guard ----------------------------------------------------
//     //   Ensure context.userId is a real, active user. Throw to reject. Example:
//     //   const { data: prof } = await context.supabase.from("profiles")
//     //     .select("is_active,email").eq("id", context.userId).maybeSingle();
//     //   if (!prof?.is_active) throw new Error("Forbidden: account pending approval");
//     //   const who = prof?.email ?? context.userId;
//     // ---------------------------------------------------------------------------------
//     const who = "authenticated-user"; // replace with the resolved identity above
//     return createIssue(data, who);
//   });

// ─── Next.js App Router binding. Delete the TanStack block above and use this instead. ─
// export async function POST(req: Request) {
//   // TODO: your app's auth guard — resolve the session; 401 if not signed in.
//   //   const session = await auth(); if (!session?.user) return new Response("Unauthorized", { status: 401 });
//   const session = { user: { email: "authenticated-user" } }; // replace with real session
//   let data: FeedbackInput;
//   try {
//     data = feedbackInputSchema.parse(await req.json());
//   } catch {
//     return new Response("Bad request", { status: 400 });
//   }
//   try {
//     const r = await createIssue(data, session.user.email ?? "authenticated-user");
//     return Response.json(r);
//   } catch (e: any) {
//     return new Response(e?.message ?? "error", { status: 500 });
//   }
// }
