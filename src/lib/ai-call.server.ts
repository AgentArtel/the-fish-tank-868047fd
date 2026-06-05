// Server-only helper for AI chat completion calls.
// Resolves provider/model from workspace_ai_settings (admin BYO key) and
// falls back to the Lovable AI Gateway when BYO is not configured or fails.
//
// All three supported providers (Lovable Gateway, OpenAI, Gemini) accept the
// same OpenAI-compatible /chat/completions request shape, including tool calls.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Tier = "pro" | "flash";

export interface AISettings {
  provider: "lovable" | "openai" | "gemini";
  openai_api_key: string | null;
  openai_model_pro: string | null;
  openai_model_flash: string | null;
  gemini_api_key: string | null;
  gemini_model_pro: string | null;
  gemini_model_flash: string | null;
  fallback_to_lovable: boolean;
}

const DEFAULTS: AISettings = {
  provider: "lovable",
  openai_api_key: null,
  openai_model_pro: "gpt-5",
  openai_model_flash: "gpt-5-mini",
  gemini_api_key: null,
  gemini_model_pro: "gemini-2.5-pro",
  gemini_model_flash: "gemini-2.5-flash",
  fallback_to_lovable: true,
};

async function loadSettings(): Promise<AISettings> {
  try {
    const { data } = await supabaseAdmin
      .from("workspace_ai_settings")
      .select("provider,openai_api_key,openai_model_pro,openai_model_flash,gemini_api_key,gemini_model_pro,gemini_model_flash,fallback_to_lovable")
      .limit(1)
      .maybeSingle();
    if (!data) return DEFAULTS;
    return { ...DEFAULTS, ...(data as any) };
  } catch {
    return DEFAULTS;
  }
}

interface Target {
  provider: "lovable" | "openai" | "gemini";
  url: string;
  apiKey: string;
  model: string;
}

function resolveTarget(s: AISettings, tier: Tier, lovableModel: string, lovableKey: string | undefined): Target | null {
  if (s.provider === "openai" && s.openai_api_key) {
    return {
      provider: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: s.openai_api_key,
      model: (tier === "pro" ? s.openai_model_pro : s.openai_model_flash) || (tier === "pro" ? "gpt-5" : "gpt-5-mini"),
    };
  }
  if (s.provider === "gemini" && s.gemini_api_key) {
    return {
      provider: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      apiKey: s.gemini_api_key,
      model: (tier === "pro" ? s.gemini_model_pro : s.gemini_model_flash) || (tier === "pro" ? "gemini-2.5-pro" : "gemini-2.5-flash"),
    };
  }
  if (!lovableKey) return null;
  return {
    provider: "lovable",
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    apiKey: lovableKey,
    model: lovableModel,
  };
}

async function recordUsage(provider: string, error: string | null) {
  try {
    const { data } = await supabaseAdmin.from("workspace_ai_settings").select("id").limit(1).maybeSingle();
    if (!data) return;
    await supabaseAdmin.from("workspace_ai_settings").update({
      last_used_at: new Date().toISOString(),
      last_used_provider: provider,
      last_error: error,
    }).eq("id", (data as any).id);
  } catch { /* best-effort */ }
}

export interface CallAIOptions {
  tier: Tier;                       // "pro" → gemini-2.5-pro / gpt-5, "flash" → gemini-2.5-flash / gpt-5-mini
  lovableModel: string;             // model id to use when going through Lovable Gateway (e.g. "google/gemini-2.5-pro")
  messages: any[];
  tools?: any[];
  tool_choice?: any;
}

export interface CallAIResult {
  json: any;
  provider: "lovable" | "openai" | "gemini";
  fellBack: boolean;
}

/**
 * Call an OpenAI-compatible chat completion endpoint, picking the workspace's
 * configured provider (OpenAI / Gemini / Lovable Gateway) and optionally
 * falling back to the Lovable Gateway when a BYO call fails.
 *
 * Throws on the final failure. The caller should map status codes to
 * user-friendly errors. Look at `err.status` for the upstream HTTP code if set.
 */
export async function callAIChat(opts: CallAIOptions): Promise<CallAIResult> {
  const settings = await loadSettings();
  const lovableKey = process.env.LOVABLE_API_KEY;

  const primary = resolveTarget(settings, opts.tier, opts.lovableModel, lovableKey);
  if (!primary) {
    throw new Error("AI is not configured. Set a workspace OpenAI/Gemini key in Settings → AI, or enable the Lovable AI Gateway.");
  }

  const tryOnce = async (t: Target): Promise<CallAIResult> => {
    const body: any = {
      model: t.model,
      messages: opts.messages,
    };
    if (opts.tools) body.tools = opts.tools;
    if (opts.tool_choice) body.tool_choice = opts.tool_choice;

    const resp = await fetch(t.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${t.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      const e: any = new Error(`AI ${t.provider} returned ${resp.status}: ${txt.slice(0, 300)}`);
      e.status = resp.status;
      e.provider = t.provider;
      throw e;
    }
    return { json: await resp.json(), provider: t.provider, fellBack: false };
  };

  try {
    const r = await tryOnce(primary);
    await recordUsage(primary.provider, null);
    return r;
  } catch (e: any) {
    // Only fall back when (a) the failure came from a BYO provider, and
    // (b) the workspace opted into fallback, and (c) we have a Lovable key.
    const canFallback =
      primary.provider !== "lovable" &&
      settings.fallback_to_lovable &&
      !!lovableKey;
    if (!canFallback) {
      await recordUsage(primary.provider, e?.message ?? "unknown");
      throw e;
    }
    const fallback: Target = {
      provider: "lovable",
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableKey!,
      model: opts.lovableModel,
    };
    try {
      const r = await tryOnce(fallback);
      await recordUsage("lovable", `fell back from ${primary.provider}: ${e?.message ?? "error"}`);
      return { ...r, fellBack: true };
    } catch (e2: any) {
      await recordUsage("lovable", `fallback also failed: ${e2?.message ?? "error"}`);
      throw e2;
    }
  }
}
