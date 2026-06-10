import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  getScrapeSource,
  refreshScrapeSource,
  importScrapeItems,
  setScrapeItemStatus,
} from "@/lib/scrape.functions";
import { fmtMoney } from "@/lib/ops";
import {
  RefreshCw,
  Loader2,
  ArrowLeft,
  ExternalLink,
  EyeOff,
  Eye,
  PackagePlus,
} from "lucide-react";

export const Route = createFileRoute("/_app/vendors/scrape/$sourceId")({
  component: ScrapeSourceDetail,
});

type StatusFilter = "new" | "imported" | "ignored" | "unavailable" | "all";

function ScrapeSourceDetail() {
  const { sourceId } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const getFn = useServerFn(getScrapeSource);
  const refreshFn = useServerFn(refreshScrapeSource);
  const importFn = useServerFn(importScrapeItems);
  const setStatusFn = useServerFn(setScrapeItemStatus);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("new");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["scrape-source", sourceId, statusFilter],
    queryFn: () => getFn({ data: { sourceId, statusFilter } }),
  });

  // Generate signed URLs for thumbnails (private bucket)
  useMemo(() => {
    const items = data?.items ?? [];
    const missing = items.filter((it: any) => it.photo_path && !thumbs[it.id]);
    if (missing.length === 0) return;
    (async () => {
      const paths = missing.map((it: any) => it.photo_path).slice(0, 60);
      const { data: signed } = await supabase.storage
        .from("inventory-media")
        .createSignedUrls(paths, 3600);
      if (!signed) return;
      const next: Record<string, string> = {};
      missing.slice(0, signed.length).forEach((it: any, i: number) => {
        if (signed[i]?.signedUrl) next[it.id] = signed[i].signedUrl;
      });
      setThumbs((s) => ({ ...s, ...next }));
    })();
  }, [data?.items]);

  const source = data?.source;
  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((it: any) => selected.has(it.id));

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await refreshFn({ data: { sourceId } });
      toast.success(
        `Scraped ${res.fetched} item${res.fetched === 1 ? "" : "s"} — ${res.added} new, ${res.updated} updated, ${res.imagesDownloaded} photos`,
      );
      qc.invalidateQueries({ queryKey: ["scrape-source", sourceId] });
      qc.invalidateQueries({ queryKey: ["scrape-sources"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const importSelected = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    try {
      const res = await importFn({
        data: { sourceId, itemIds: Array.from(selected) },
      });
      toast.success(`Created draft batch with ${res.lineCount} line${res.lineCount === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["scrape-source", sourceId] });
      qc.invalidateQueries({ queryKey: ["scrape-sources"] });
      qc.invalidateQueries({ queryKey: ["workload"] });
      setSelected(new Set());
      nav({ to: "/batches/$id", params: { id: res.batchId } });
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const ignoreSelected = async () => {
    if (selected.size === 0) return;
    try {
      await setStatusFn({ data: { itemIds: Array.from(selected), status: "ignored" } });
      toast.success(`Ignored ${selected.size}`);
      qc.invalidateQueries({ queryKey: ["scrape-source", sourceId] });
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  const unignoreSelected = async () => {
    if (selected.size === 0) return;
    try {
      await setStatusFn({ data: { itemIds: Array.from(selected), status: "new" } });
      toast.success(`Restored ${selected.size}`);
      qc.invalidateQueries({ queryKey: ["scrape-source", sourceId] });
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <Link
        to="/vendors/scrape"
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
      >
        <ArrowLeft className="w-3 h-3" /> All scrape sources
      </Link>

      <PageHeader
        title={source ? `${(source as any).vendors?.name} — ${source.name}` : "Scrape source"}
        description={source?.source_url}
        action={
          <Button onClick={refresh} disabled={refreshing} size="sm">
            {refreshing ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Refreshing…
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh now
              </>
            )}
          </Button>
        }
      />

      {/* Filter + bulk actions bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">New (not yet imported)</SelectItem>
            <SelectItem value="imported">Imported</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
            <SelectItem value="unavailable">Unavailable at vendor</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        <div className="text-sm text-muted-foreground">
          {items.length} item{items.length === 1 ? "" : "s"}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </div>

        <div className="ml-auto flex gap-2">
          {statusFilter === "new" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={ignoreSelected}
                disabled={selected.size === 0}
              >
                <EyeOff className="w-4 h-4 mr-1" /> Ignore
              </Button>
              <Button onClick={importSelected} disabled={selected.size === 0 || importing} size="sm">
                {importing ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <PackagePlus className="w-4 h-4 mr-1" />
                )}
                Import {selected.size > 0 ? `(${selected.size})` : ""}
              </Button>
            </>
          )}
          {statusFilter === "ignored" && (
            <Button
              variant="outline"
              size="sm"
              onClick={unignoreSelected}
              disabled={selected.size === 0}
            >
              <Eye className="w-4 h-4 mr-1" /> Restore
            </Button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && items.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          {statusFilter === "new"
            ? "Nothing new to import. Click Refresh to check the vendor for new drops."
            : "No items match this filter."}
        </div>
      )}

      {/* Header row */}
      {items.length > 0 && (
        <div className="grid grid-cols-[auto_64px_1fr_120px_120px_120px] gap-3 items-center px-3 py-2 text-[10px] uppercase font-semibold tracking-wider text-muted-foreground border-b">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => {
              if (c) setSelected(new Set(items.map((it: any) => it.id)));
              else setSelected(new Set());
            }}
          />
          <span />
          <span>Coral</span>
          <span>Wholesale</span>
          <span>Suggested 3×</span>
          <span>At vendor</span>
        </div>
      )}

      {items.map((it: any) => {
        const isSel = selected.has(it.id);
        const suggested = it.wholesale_cost != null ? Number(it.wholesale_cost) * 3 : null;
        return (
          <div
            key={it.id}
            onClick={() => statusFilter !== "imported" && toggle(it.id)}
            className={`grid grid-cols-[auto_64px_1fr_120px_120px_120px] gap-3 items-center px-3 py-3 border-b text-sm cursor-pointer hover:bg-muted/30 ${
              isSel ? "bg-primary/5" : ""
            }`}
          >
            <Checkbox
              checked={isSel}
              onCheckedChange={() => toggle(it.id)}
              onClick={(e) => e.stopPropagation()}
              disabled={statusFilter === "imported"}
            />
            <div className="w-14 h-14 rounded bg-muted overflow-hidden flex items-center justify-center">
              {thumbs[it.id] ? (
                <img src={thumbs[it.id]} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-muted-foreground">no photo</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{it.title}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="font-mono">{it.external_id}</span>
                {it.product_url && (
                  <a
                    href={it.product_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-foreground inline-flex items-center gap-0.5"
                  >
                    view <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
            <div className="font-medium">{fmtMoney(it.wholesale_cost)}</div>
            <div className="text-muted-foreground">{suggested != null ? fmtMoney(suggested) : "—"}</div>
            <div>
              {it.available_at_source ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-0">
                  Available
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Gone
                </Badge>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
