import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/hooks/use-me";
import { getLoyaltyConfig, saveLoyaltyConfig } from "@/lib/loyalty.functions";
import { DEFAULT_TIERS } from "@/lib/loyalty";
import { Loader2, Save, Waves } from "lucide-react";

export const Route = createFileRoute("/_app/settings/loyalty")({ component: LoyaltySettings });

function LoyaltySettings() {
  const qc = useQueryClient();
  const me = useMe();
  const isAdmin = (me.data?.roles ?? []).includes("admin");

  const getFn = useServerFn(getLoyaltyConfig);
  const saveFn = useServerFn(saveLoyaltyConfig);
  const { data } = useQuery({ queryKey: ["loyalty-config"], queryFn: () => getFn() });

  const [enabled, setEnabled] = useState(false);
  const [earnPercent, setEarnPercent] = useState("5");
  // Seed with the documented defaults so the field is never blank (even pre-fetch).
  const [tiersText, setTiersText] = useState(() => JSON.stringify(DEFAULT_TIERS, null, 2));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setEarnPercent(String(data.earnPercent));
      setTiersText(JSON.stringify(data.tiers?.length ? data.tiers : DEFAULT_TIERS, null, 2));
    }
  }, [data]);

  const save = async () => {
    const pct = parseFloat(earnPercent);
    if (!isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("Earn percent must be between 0 and 100");
      return;
    }
    let tiers: unknown;
    try {
      tiers = JSON.parse(tiersText);
    } catch {
      toast.error("Tiers must be valid JSON");
      return;
    }
    setSaving(true);
    try {
      const r = await saveFn({ data: { enabled, earnPercent: pct, tiers } });
      // Server normalizes tiers — reflect the canonical form back in the editor.
      setTiersText(JSON.stringify(r.tiers, null, 2));
      toast.success("Reef Club settings saved");
      qc.invalidateQueries({ queryKey: ["loyalty-config"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">
      <PageHeader
        title="Reef Club"
        description="Loyalty program. Members earn Reef Credit on purchases and redeem it in store or against corals they win at your live sale auctions."
      />

      <div className="rounded-lg border bg-card p-4 space-y-5">
        <div className="flex items-center gap-3">
          <Waves className="w-5 h-5 text-sky-600" />
          <div className="flex-1">
            <div className="font-medium text-sm">Program status</div>
            <div className="text-xs text-muted-foreground">
              {enabled
                ? "Live — linked member purchases earn Reef Credit on each sales sync."
                : "Off — no credit accrues until you turn this on."}
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!isAdmin} />
        </div>

        <div className="grid gap-1.5 max-w-[12rem] border-t pt-4">
          <Label htmlFor="earn-percent">Earn rate (% of spend)</Label>
          <Input
            id="earn-percent"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={earnPercent}
            onChange={(e) => setEarnPercent(e.target.value)}
            disabled={!isAdmin}
          />
          <p className="text-xs text-muted-foreground">Baseline is 5%.</p>
        </div>

        <div className="grid gap-1.5 border-t pt-4">
          <Label htmlFor="tiers">Tiers</Label>
          <Textarea
            id="tiers"
            value={tiersText}
            onChange={(e) => setTiersText(e.target.value)}
            disabled={!isAdmin}
            rows={16}
            className="font-mono text-xs"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Three reef-themed tiers (ascending). Each:{" "}
            <code>{`{ "name", "min_annual_cents", "earn_multiplier", "perks": [] }`}</code>.{" "}
            <span className="font-medium">min_annual_cents</span> is rolling-12-month spend to reach
            the tier (e.g. <code>100000</code> = $1,000). Invalid or empty resets to the defaults.
          </p>
        </div>

        {isAdmin ? (
          <div className="flex justify-end border-t pt-4">
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Save settings
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground border-t pt-4">
            Only admins can change Reef Club settings.
          </p>
        )}
      </div>
    </div>
  );
}
