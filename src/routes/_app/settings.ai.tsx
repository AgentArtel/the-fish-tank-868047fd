import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getAISettings, updateAISettings, testAISettings } from "@/lib/ai-settings.functions";

export const Route = createFileRoute("/_app/settings/ai")({ component: AISettingsPage });

type Provider = "lovable" | "openai" | "gemini";

function AISettingsPage() {
  const fetchSettings = useServerFn(getAISettings);
  const updateFn = useServerFn(updateAISettings);
  const testFn = useServerFn(testAISettings);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: () => fetchSettings(),
  });

  const [provider, setProvider] = useState<Provider>("lovable");
  const [fallback, setFallback] = useState(true);
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiPro, setOpenaiPro] = useState("gpt-5");
  const [openaiFlash, setOpenaiFlash] = useState("gpt-5-mini");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiPro, setGeminiPro] = useState("gemini-2.5-pro");
  const [geminiFlash, setGeminiFlash] = useState("gemini-2.5-flash");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!data) return;
    setProvider(data.provider);
    setFallback(data.fallback_to_lovable);
    setOpenaiPro(data.openai_model_pro ?? "gpt-5");
    setOpenaiFlash(data.openai_model_flash ?? "gpt-5-mini");
    setGeminiPro(data.gemini_model_pro ?? "gemini-2.5-pro");
    setGeminiFlash(data.gemini_model_flash ?? "gemini-2.5-flash");
    setOpenaiKey("");
    setGeminiKey("");
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      await updateFn({
        data: {
          provider,
          fallback_to_lovable: fallback,
          // Empty string = leave alone (don't overwrite stored key).
          openai_api_key: openaiKey.trim() === "" ? undefined : openaiKey.trim(),
          openai_model_pro: openaiPro,
          openai_model_flash: openaiFlash,
          gemini_api_key: geminiKey.trim() === "" ? undefined : geminiKey.trim(),
          gemini_model_pro: geminiPro,
          gemini_model_flash: geminiFlash,
        },
      });
      toast.success("AI settings saved");
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async (which: "openai" | "gemini") => {
    setSaving(true);
    try {
      await updateFn({
        data: {
          provider,
          fallback_to_lovable: fallback,
          openai_api_key: which === "openai" ? "" : undefined,
          gemini_api_key: which === "gemini" ? "" : undefined,
        },
      });
      toast.success(`${which === "openai" ? "OpenAI" : "Gemini"} key cleared`);
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const r = await testFn();
      if (r.ok) {
        toast.success(
          `OK via ${r.provider}${r.fellBack ? " (fell back to Lovable)" : ""} — "${r.reply.slice(0, 60)}"`,
        );
      } else {
        toast.error(`Test failed${r.status ? ` (${r.status})` : ""}: ${r.error}`);
      }
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? "Test failed");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <PageHeader
        title="AI keys"
        description="Use your own OpenAI or Gemini key for invoice / label / list parsing. Falls back to the Lovable AI gateway when no key is set, or optionally when your key fails."
      />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <section className="rounded-lg border bg-card p-5 space-y-4">
            <div>
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lovable">Lovable AI Gateway (default, no key needed)</SelectItem>
                  <SelectItem value="openai" disabled={!data?.openai_api_key_set && openaiKey.trim() === ""}>
                    OpenAI (uses workspace key)
                  </SelectItem>
                  <SelectItem value="gemini" disabled={!data?.gemini_api_key_set && geminiKey.trim() === ""}>
                    Google Gemini (uses workspace key)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1.5">
                Pick which provider serves AI calls. Disabled options need a key entered below first.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Fall back to Lovable AI on failure</div>
                <div className="text-xs text-muted-foreground">
                  If your key fails (rate limit, expired, network), retry through the Lovable gateway.
                </div>
              </div>
              <Switch checked={fallback} onCheckedChange={setFallback} />
            </div>
          </section>

          <section className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">OpenAI</h3>
              {data?.openai_api_key_set ? (
                <span className="text-xs text-muted-foreground">Stored: {data.openai_api_key_masked}</span>
              ) : (
                <span className="text-xs text-muted-foreground">No key stored</span>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>API key</Label>
              <Input
                type="password"
                placeholder={data?.openai_api_key_set ? "Leave blank to keep existing" : "sk-…"}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pro model (invoice extraction)</Label>
                <Input value={openaiPro} onChange={(e) => setOpenaiPro(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Flash model (labels, list parsing)</Label>
                <Input value={openaiFlash} onChange={(e) => setOpenaiFlash(e.target.value)} />
              </div>
            </div>
            {data?.openai_api_key_set && (
              <Button variant="outline" size="sm" onClick={() => clearKey("openai")} disabled={saving}>
                Clear OpenAI key
              </Button>
            )}
          </section>

          <section className="rounded-lg border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Google Gemini</h3>
              {data?.gemini_api_key_set ? (
                <span className="text-xs text-muted-foreground">Stored: {data.gemini_api_key_masked}</span>
              ) : (
                <span className="text-xs text-muted-foreground">No key stored</span>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>API key</Label>
              <Input
                type="password"
                placeholder={data?.gemini_api_key_set ? "Leave blank to keep existing" : "AIza…"}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Create at <span className="font-mono">aistudio.google.com/app/apikey</span>. We call the OpenAI-compatible endpoint.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pro model</Label>
                <Input value={geminiPro} onChange={(e) => setGeminiPro(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Flash model</Label>
                <Input value={geminiFlash} onChange={(e) => setGeminiFlash(e.target.value)} />
              </div>
            </div>
            {data?.gemini_api_key_set && (
              <Button variant="outline" size="sm" onClick={() => clearKey("gemini")} disabled={saving}>
                Clear Gemini key
              </Button>
            )}
          </section>

          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
            <Button variant="secondary" onClick={runTest} disabled={testing}>
              {testing ? "Testing…" : "Send test ping"}
            </Button>
          </div>

          {(data?.last_used_at || data?.last_error) && (
            <div className="text-xs text-muted-foreground rounded-md border bg-muted/30 p-3 space-y-1">
              {data?.last_used_at && (
                <div>
                  Last call: <span className="font-mono">{data.last_used_provider ?? "?"}</span> at{" "}
                  {new Date(data.last_used_at).toLocaleString()}
                </div>
              )}
              {data?.last_error && (
                <div className="text-amber-700 dark:text-amber-400">Last error: {data.last_error}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
