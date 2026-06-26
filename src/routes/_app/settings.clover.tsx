import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/use-me";
import { supabase } from "@/integrations/supabase/client";
import { getCloverOverview, getCloverSettings, saveCloverSettings } from "@/lib/clover.functions";
import {
  Loader2,
  Plug,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Save,
  KeyRound,
  ArrowRight,
  ShieldCheck,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_app/settings/clover")({ component: CloverSettings });

function fmtRel(iso: string | null | undefined) {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Auto-sync health: the cron runs every ~10 min, so a watermark older than ~30 min
// means the scheduled sync has stalled (or was never wired up).
function syncHealth(iso: string | null | undefined): { tone: "ok" | "warn"; label: string } {
  if (!iso) return { tone: "warn", label: "Auto-sync not running" };
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m > 30) return { tone: "warn", label: "Auto-sync stale" };
  return { tone: "ok", label: "Auto-syncing" };
}

function CloverSettings() {
  const qc = useQueryClient();
  const me = useMe();
  const isAdmin = (me.data?.roles ?? []).includes("admin");

  const overviewFn = useServerFn(getCloverOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["clover-overview"],
    queryFn: () => overviewFn(),
  });

  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // All external Clover work runs in Supabase Edge Functions (clover-test-connection /
  // clover-import-catalog / clover-sync-sales). The app just invokes them and reacts to
  // the table state they write (counts come from the clover-overview query, refreshed
  // here). The import edge fn does the full catalog pass server-side — no browser loop.
  const test = async () => {
    setTesting(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("clover-test-connection", {
        body: {},
      });
      if (error) throw new Error(error.message);
      toast.success(r?.merchant?.name ? `Connected to ${r.merchant.name}` : "Connected to Clover");
      qc.invalidateQueries({ queryKey: ["clover-overview"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  const runImport = async () => {
    setImporting(true);
    setImportStatus("Importing Clover catalog…");
    try {
      const { data: r, error } = await supabase.functions.invoke("clover-import-catalog", {
        body: {},
      });
      if (error) throw new Error(error.message);
      const fetched = r?.fetched;
      toast.success(
        typeof fetched === "number"
          ? `Imported ${fetched} Clover items`
          : "Clover catalog import complete",
      );
      qc.invalidateQueries({ queryKey: ["clover-overview"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setImporting(false);
      setImportStatus(null);
    }
  };

  const runSyncSales = async () => {
    setSyncing(true);
    setSyncStatus("Syncing recent Clover sales…");
    try {
      const { data: r, error } = await supabase.functions.invoke("clover-sync-sales", {
        body: {},
      });
      if (error) throw new Error(error.message);
      const applied = r?.applied;
      const needsReview = r?.needsReview;
      toast.success(
        typeof applied === "number"
          ? `Sale sync complete — ${applied} applied to stock${
              typeof needsReview === "number" ? `, ${needsReview} need review` : ""
            }`
          : "Clover sale sync complete",
      );
      qc.invalidateQueries({ queryKey: ["clover-overview"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Sale sync failed");
    } finally {
      setSyncing(false);
      setSyncStatus(null);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl space-y-6">
      <PageHeader
        title="Clover POS"
        description="Sync your Clover catalog and sales into the workspace. The workspace is the source of truth; Clover sales flow back here."
      />

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          ) : data?.connected ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          )}
          <div className="flex-1">
            <div className="font-medium text-sm">
              {isLoading
                ? "Checking connection…"
                : data?.connected
                  ? "Connected"
                  : data?.configured
                    ? "Not yet connected"
                    : "Not configured"}
            </div>
            <div className="text-xs text-muted-foreground">
              {isLoading
                ? "Loading Clover status…"
                : data?.configured
                  ? `Last import ${fmtRel(data?.lastImportAt)}`
                  : isAdmin
                    ? "Enter your Clover API token and merchant ID below to enable."
                    : "An admin needs to enter Clover API credentials below."}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={test}
            disabled={testing || !data?.configured}
          >
            {testing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Plug className="w-4 h-4 mr-1" />
            )}
            Test connection
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">{data?.total ?? 0} Clover items</Badge>
          <Badge variant="outline">{data?.linked ?? 0} linked</Badge>
          {(data?.unlinked ?? 0) > 0 && (
            <Badge variant="outline" className="text-muted-foreground">
              {data?.unlinked} unlinked
            </Badge>
          )}
          {(data?.salesNeedingReview ?? 0) > 0 && (
            <Badge
              variant="outline"
              className="border-amber-400 text-amber-700 dark:text-amber-300"
            >
              {data?.salesNeedingReview} sales need review
            </Badge>
          )}
        </div>

        {((data?.unlinked ?? 0) > 0 || (data?.salesNeedingReview ?? 0) > 0) && (
          <Button asChild size="sm" variant="outline" className="w-fit">
            <Link to="/inventory/clover-reconcile">
              Open Clover reconcile <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        )}

        <div className="border-t pt-3">
          <Button onClick={runImport} disabled={importing || !data?.configured} size="sm">
            {importing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <DownloadCloud className="w-4 h-4 mr-1" />
            )}
            Import / re-sync Clover catalog
          </Button>
          {importStatus && <p className="text-xs text-primary mt-2 font-medium">{importStatus}</p>}
          <p className="text-xs text-muted-foreground mt-2">
            Pulls every Clover item and{" "}
            <span className="font-medium">creates a linked workspace item</span> for it (read-only
            against Clover). New items come in as drafts — quantity 0, priced from Clover,{" "}
            <span className="font-medium">not for sale</span> until you add a photo. The import runs
            server-side in one pass; the counts above refresh when it finishes. Re-run anytime to
            pick up Clover changes (already-linked items keep your workspace edits).
          </p>
        </div>

        <div className="border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              onClick={runSyncSales}
              disabled={syncing || !data?.configured}
              size="sm"
              variant="outline"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Sync sales now
            </Button>
            <div className="flex items-center gap-2">
              {data?.configured &&
                (() => {
                  const h = syncHealth(data?.lastSaleSyncedAt);
                  return (
                    <Badge
                      variant="outline"
                      className={
                        h.tone === "ok"
                          ? "border-emerald-400 text-emerald-700 dark:text-emerald-300"
                          : "border-amber-400 text-amber-700 dark:text-amber-300"
                      }
                    >
                      {h.label}
                    </Badge>
                  );
                })()}
              <span className="text-xs text-muted-foreground">
                Last sale sync {fmtRel(data?.lastSaleSyncedAt)}
              </span>
            </div>
          </div>
          {syncStatus && <p className="text-xs text-primary mt-2 font-medium">{syncStatus}</p>}
          <p className="text-xs text-muted-foreground mt-2">
            Pulls recent Clover orders and records each sale. Sales of{" "}
            <span className="font-medium">linked</span> items decrement workspace stock; refunds,
            voids, and sales of unmatched items are held as{" "}
            <span className="font-medium">need review</span> (no stock change) until you reconcile
            them. Safe to re-run — already-recorded sales are skipped. It also runs automatically on
            a schedule; the badge above shows whether that scheduled sync is healthy.
          </p>
        </div>
      </div>

      {isAdmin && (
        <CloverApiSettingsCard
          onSaved={() => qc.invalidateQueries({ queryKey: ["clover-overview"] })}
        />
      )}

      {isAdmin && data?.configured && <TokenCapabilityCard />}
    </div>
  );
}

// Write-back readiness: probes what the Clover token can actually do (create/update/
// stock) via the clover-token-check edge fn. Gates the write-back build — if create/
// update come back denied, the token needs wider scope before we push anything.
function CapabilityRow({
  label,
  state,
  info,
}: {
  label: string;
  state: boolean | null | undefined;
  info?: boolean;
}) {
  const skipped = state == null;
  return (
    <div className="flex items-center gap-2 text-sm">
      {skipped ? (
        <span className="w-4 h-4 rounded-full border border-muted-foreground/40 shrink-0" />
      ) : state ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
      ) : (
        <XCircle
          className={`w-4 h-4 shrink-0 ${info ? "text-muted-foreground" : "text-red-600"}`}
        />
      )}
      <span className={skipped ? "text-muted-foreground" : ""}>{label}</span>
      {skipped && <span className="text-xs text-muted-foreground">— not tested</span>}
    </div>
  );
}

function TokenCapabilityCard() {
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<any>(null);

  const run = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("clover-token-check", { body: {} });
      if (error) throw new Error(error.message);
      setReport(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Token check failed — is the edge function deployed yet?");
    } finally {
      setChecking(false);
    }
  };

  const writeReady = report?.canCreateItem && report?.canUpdateItem;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Write-back readiness
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Checks whether your Clover token can create &amp; update items — required before pushing
            the app's catalog/prices back to Clover.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={run} disabled={checking}>
          {checking ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <ShieldCheck className="w-4 h-4 mr-1" />
          )}
          {report ? "Re-check" : "Check token"}
        </Button>
      </div>

      {report && (
        <div className="space-y-2 border-t pt-3">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            <CapabilityRow label="Read catalog" state={report.canRead} />
            <CapabilityRow label="Create items" state={report.canCreateItem} />
            <CapabilityRow label="Update price / name" state={report.canUpdateItem} />
            <CapabilityRow label="Set stock (Scope 3)" state={report.canSetStock} info />
            <CapabilityRow label="Delete items" state={report.canDelete} info />
          </div>

          <div
            className={`text-sm font-medium rounded-md px-3 py-2 ${
              writeReady
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "bg-red-500/10 text-red-700 dark:text-red-300"
            }`}
          >
            {writeReady
              ? "Token can write — safe to build the push queue."
              : "Token can't create/update items — widen its scope before write-back."}
          </div>

          {report.leakedItemId && (
            <div className="flex items-start gap-2 text-xs rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                A probe item couldn't be auto-deleted (Clover id{" "}
                <span className="font-mono">{report.leakedItemId}</span>). It's hidden, but remove
                it in Clover to be safe.
              </span>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            {report.mode === "sandbox" ? "Ran against sandbox" : "Ran against the live merchant"} ·{" "}
            {report.permissionsEndpointUsed
              ? "read from token scopes"
              : "verified with a self-cleaning probe item"}
            .
          </p>
        </div>
      )}
    </div>
  );
}

function CloverApiSettingsCard({ onSaved }: { onSaved: () => void }) {
  const getSettingsFn = useServerFn(getCloverSettings);
  const saveSettingsFn = useServerFn(saveCloverSettings);
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["clover-settings"],
    queryFn: () => getSettingsFn(),
  });

  const [merchantId, setMerchantId] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.clover.com");
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setMerchantId(settings.merchantId);
      setBaseUrl(settings.baseUrl);
    }
  }, [settings]);

  const save = async () => {
    if (!merchantId.trim()) {
      toast.error("Merchant ID is required");
      return;
    }
    if (!settings?.hasToken && !apiToken.trim()) {
      toast.error("API token is required on first save");
      return;
    }
    setSaving(true);
    try {
      await saveSettingsFn({ data: { merchantId, baseUrl, apiToken } });
      setApiToken("");
      toast.success("Clover API settings saved");
      qc.invalidateQueries({ queryKey: ["clover-settings"] });
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-muted-foreground" />
        <div className="flex-1">
          <div className="font-medium text-sm">API credentials</div>
          <div className="text-xs text-muted-foreground">
            Admin-only. Stored encrypted at rest in your backend with admin-only access policies.
          </div>
        </div>
        {settings?.hasToken && (
          <Badge variant="outline" className="text-xs">
            Token on file
          </Badge>
        )}
      </div>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="clover-merchant">Merchant ID</Label>
          <Input
            id="clover-merchant"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            placeholder="e.g. A1B2C3D4E5F6G"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="clover-base">Base URL</Label>
          <Input
            id="clover-base"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.clover.com"
          />
          <p className="text-xs text-muted-foreground">
            Use <code>https://apisandbox.dev.clover.com</code> for sandbox / test credentials.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="clover-token">API token</Label>
          <Input
            id="clover-token"
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={
              settings?.hasToken ? "•••••••• (leave blank to keep current)" : "Paste API token"
            }
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            From Clover Dashboard → Setup → API Tokens. Needs read access to <em>Inventory</em> and{" "}
            <em>Orders</em>.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1" />
          )}
          Save credentials
        </Button>
      </div>
    </div>
  );
}
