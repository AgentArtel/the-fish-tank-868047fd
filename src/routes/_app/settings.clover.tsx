import { createFileRoute } from "@tanstack/react-router";
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
import {
  getCloverOverview,
  testCloverConnection,
  importCloverCatalog,
  createWorkspaceItemsFromClover,
  syncCloverSales,
  getCloverSettings,
  saveCloverSettings,
} from "@/lib/clover.functions";
import {
  Loader2,
  Plug,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Save,
  KeyRound,
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

function CloverSettings() {
  const qc = useQueryClient();
  const me = useMe();
  const isAdmin = (me.data?.roles ?? []).includes("admin");

  const overviewFn = useServerFn(getCloverOverview);
  const testFn = useServerFn(testCloverConnection);
  const importFn = useServerFn(importCloverCatalog);
  const createItemsFn = useServerFn(createWorkspaceItemsFromClover);
  const syncSalesFn = useServerFn(syncCloverSales);
  const { data } = useQuery({ queryKey: ["clover-overview"], queryFn: () => overviewFn() });

  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const test = async () => {
    setTesting(true);
    try {
      const r = await testFn();
      toast.success(`Connected to ${r.merchant.name}`);
      qc.invalidateQueries({ queryKey: ["clover-overview"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  const runImport = async () => {
    setImporting(true);
    setImportStatus("Syncing Clover catalog…");
    try {
      // Step 1 — sync the link rows (cheap, one request).
      const r = await importFn();
      // Step 2 — create the workspace items in small chunks the Worker can finish,
      // looping from the browser until nothing is left to create.
      let createdTotal = 0;
      let guard = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const c = await createItemsFn({ data: { limit: 200 } });
        createdTotal += c.created + c.relinked;
        setImportStatus(
          `Creating workspace items… ${createdTotal} linked, ${c.remaining} to go`,
        );
        qc.invalidateQueries({ queryKey: ["clover-overview"] });
        if (c.done || c.processed === 0) break;
        if (++guard > 100) break; // safety: never loop forever
      }
      toast.success(
        `Imported ${r.fetched} Clover items — ${createdTotal} created/linked this run`,
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
    try {
      const r = await syncSalesFn();
      toast.success(
        `Synced ${r.lineItemsSeen} Clover line items — ${r.applied} applied to stock, ${r.needsReview} need review`,
      );
      if (r.errors.length) toast.warning(`${r.errors.length} line items errored — check logs`);
      qc.invalidateQueries({ queryKey: ["clover-overview"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Sale sync failed");
    } finally {
      setSyncing(false);
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
          {data?.connected ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          )}
          <div className="flex-1">
            <div className="font-medium text-sm">
              {data?.connected ? "Connected" : data?.configured ? "Not yet connected" : "Not configured"}
            </div>
            <div className="text-xs text-muted-foreground">
              {data?.configured
                ? `Last import ${fmtRel(data?.lastImportAt)}`
                : isAdmin
                  ? "Enter your Clover API token and merchant ID below to enable."
                  : "An admin needs to enter Clover API credentials below."}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={test} disabled={testing || !data?.configured}>
            {testing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plug className="w-4 h-4 mr-1" />}
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
            <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
              {data?.salesNeedingReview} sales need review
            </Badge>
          )}
        </div>

        <div className="border-t pt-3">
          <Button onClick={runImport} disabled={importing || !data?.configured} size="sm">
            {importing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <DownloadCloud className="w-4 h-4 mr-1" />
            )}
            Import / re-sync Clover catalog
          </Button>
          {importStatus && (
            <p className="text-xs text-primary mt-2 font-medium">{importStatus}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            Pulls every Clover item and <span className="font-medium">creates a linked workspace
            item</span> for it (read-only against Clover). New items come in as drafts — quantity 0,
            priced from Clover, <span className="font-medium">not for sale</span> until you add a
            photo. Items are created in small batches with a live count above, so it's safe even for
            large catalogs — keep this tab open until it finishes. Re-run anytime to pick up Clover
            changes (already-linked items keep your workspace edits).
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
            <span className="text-xs text-muted-foreground">
              Last sale sync {fmtRel(data?.lastSaleSyncedAt)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Pulls recent Clover orders and records each sale. Sales of{" "}
            <span className="font-medium">linked</span> items decrement workspace stock; refunds,
            voids, and sales of unmatched items are held as{" "}
            <span className="font-medium">need review</span> (no stock change) until you reconcile
            them. Safe to re-run — already-recorded sales are skipped.
          </p>
        </div>
      </div>

      {isAdmin && <CloverApiSettingsCard onSaved={() => qc.invalidateQueries({ queryKey: ["clover-overview"] })} />}
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
            placeholder={settings?.hasToken ? "•••••••• (leave blank to keep current)" : "Paste API token"}
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
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Save credentials
        </Button>
      </div>
    </div>
  );
}
