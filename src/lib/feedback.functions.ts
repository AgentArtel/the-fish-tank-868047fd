import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Any active (approved) user may file feedback — no editor/admin gate.
async function requireActive(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active) throw new Error("Forbidden: account pending approval");
}

const TYPE_META: Record<string, { label: string; emoji: string }> = {
  bug: { label: "Bug", emoji: "🐞" },
  ui: { label: "UI issue", emoji: "🎨" },
  idea: { label: "Idea", emoji: "💡" },
  question: { label: "Question", emoji: "❓" },
};

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
      .array(
        z.object({
          level: z.string().max(40),
          msg: z.string().max(2000),
          at: z.string().max(50),
        }),
      )
      .max(50)
      .optional(),
  })
  .optional();

// Turn a feedback submission into a labeled GitHub issue. Body uses fixed section
// headers so a future auto-triage workflow (Option A) can parse it reliably.
export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        type: z.enum(["bug", "ui", "idea", "question"]),
        message: z.string().trim().min(1).max(5000),
        context: contextSchema,
        screenshotUrl: z.string().url().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireActive(context.supabase, context.userId);

    const token = process.env.GITHUB_FEEDBACK_TOKEN;
    const repo = process.env.GITHUB_FEEDBACK_REPO ?? "AgentArtel/the-fish-tank-868047fd";
    if (!token)
      throw new Error(
        "Feedback isn't configured yet — an admin needs to set GITHUB_FEEDBACK_TOKEN.",
      );

    // Submitter identity for the issue body.
    const { data: prof } = await (context.supabase as any)
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    const who =
      prof?.email ?? prof?.full_name ?? prof?.display_name ?? prof?.name ?? context.userId;

    const meta = TYPE_META[data.type];
    const firstLine = data.message.split("\n")[0].slice(0, 80);
    const title = `${meta.emoji} [${meta.label}] ${firstLine}`;

    const ctx = data.context ?? {};
    const logsBlock = (ctx.logs ?? []).map((l) => `[${l.at}] ${l.level}: ${l.msg}`).join("\n");
    const body = [
      `**Type:** ${meta.label}`,
      `**Reported by:** ${who}`,
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
          "User-Agent": "fish-tank-feedback-dock",
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
  });
