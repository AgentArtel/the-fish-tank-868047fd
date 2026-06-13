import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getCloverOverview,
  testCloverConnection,
  importCloverCatalog,
} from "@/lib/clover.functions";
import { Loader2, Plug, DownloadCloud, CheckCircle2, AlertTriangle } from "lucide-react";

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
  const overviewFn = useServerFn(getCloverOverview);
  const testFn = useServerFn(testCloverConnection);
  const importFn = useServerFn(importCloverCatalog);
  const { data } = useQuery({ queryKey: ["clover-overview"], queryFn: () => overviewFn() });
  const [testing, setTesting] = useState(false);
  const [importing, setImporting] = useState(false);

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
    try {
      const r = await importFn();
      toast.success(
        `Imported ${r.fetched} Clover items — ${r.created} new (${r.autoLinked} auto-linked), ${r.updated} updated`,
      );
      qc.invalidateQueries({ queryKey: ["clover-overview"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl">
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
                : "Set CLOVER_API_TOKEN / CLOVER_MERCHANT_ID in the app secrets to enable."}
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
          <p className="text-xs text-muted-foreground mt-2">
            Pulls every Clover item and maps it to a workspace item by name (read-only — nothing is
            written to Clover). Items it can't match stay <span className="font-medium">unlinked</span>{" "}
            for you to map. Re-run anytime to pick up Clover changes.
          </p>
        </div>
      </div>
    </div>
  );
}
