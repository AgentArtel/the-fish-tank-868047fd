// Workspace AI settings (Bring-Your-Own key) server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callAIChat } from "@/lib/ai-call.server";
import { requireAdmin } from "@/lib/auth-guards";

function mask(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export const getAISettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { data } = await supabaseAdmin
      .from("workspace_ai_settings")
      .select(
        "id, provider, openai_api_key, openai_model_pro, openai_model_flash, gemini_api_key, gemini_model_pro, gemini_model_flash, fallback_to_lovable, last_used_at, last_used_provider, last_error, updated_at",
      )
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const d = data as any;
    return {
      id: d.id as string,
      provider: d.provider as "lovable" | "openai" | "gemini",
      openai_api_key_masked: mask(d.openai_api_key),
      openai_api_key_set: !!d.openai_api_key,
      openai_model_pro: d.openai_model_pro as string | null,
      openai_model_flash: d.openai_model_flash as string | null,
      gemini_api_key_masked: mask(d.gemini_api_key),
      gemini_api_key_set: !!d.gemini_api_key,
      gemini_model_pro: d.gemini_model_pro as string | null,
      gemini_model_flash: d.gemini_model_flash as string | null,
      fallback_to_lovable: !!d.fallback_to_lovable,
      last_used_at: d.last_used_at as string | null,
      last_used_provider: d.last_used_provider as string | null,
      last_error: d.last_error as string | null,
      updated_at: d.updated_at as string,
    };
  });

const updateSchema = z.object({
  provider: z.enum(["lovable", "openai", "gemini"]),
  fallback_to_lovable: z.boolean(),
  // Optional updates. Empty string = clear. undefined = leave alone.
  openai_api_key: z.string().max(500).optional(),
  openai_model_pro: z.string().min(1).max(120).optional(),
  openai_model_flash: z.string().min(1).max(120).optional(),
  gemini_api_key: z.string().max(500).optional(),
  gemini_model_pro: z.string().min(1).max(120).optional(),
  gemini_model_flash: z.string().min(1).max(120).optional(),
});

export const updateAISettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);

    const payload: Record<string, any> = {
      provider: data.provider,
      fallback_to_lovable: data.fallback_to_lovable,
      updated_by: context.userId,
    };
    const set = (k: string, v: string | undefined) => {
      if (v === undefined) return;
      payload[k] = v.trim() === "" ? null : v.trim();
    };
    set("openai_api_key", data.openai_api_key);
    set("openai_model_pro", data.openai_model_pro);
    set("openai_model_flash", data.openai_model_flash);
    set("gemini_api_key", data.gemini_api_key);
    set("gemini_model_pro", data.gemini_model_pro);
    set("gemini_model_flash", data.gemini_model_flash);

    const { data: existing } = await supabaseAdmin
      .from("workspace_ai_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (existing) {
      const { error } = await supabaseAdmin
        .from("workspace_ai_settings")
        .update(payload as any)
        .eq("id", (existing as any).id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("workspace_ai_settings").insert(payload as any);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// Send a tiny request to the currently configured AI provider to verify the key works.
export const testAISettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    try {
      const r = await callAIChat({
        tier: "flash",
        lovableModel: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Reply with the single word: pong" },
          { role: "user", content: "ping" },
        ],
      });
      const text = r.json?.choices?.[0]?.message?.content?.toString?.() ?? "";
      return {
        ok: true,
        provider: r.provider,
        fellBack: r.fellBack,
        reply: text.slice(0, 200),
      };
    } catch (e: any) {
      return {
        ok: false,
        provider: null as any,
        fellBack: false,
        error: e?.message ?? "AI call failed",
        status: e?.status ?? null,
      };
    }
  });
