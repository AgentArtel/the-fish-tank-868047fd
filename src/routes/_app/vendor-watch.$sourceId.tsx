import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
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
  getScrapeProgress,
  refreshScrapeSource,
  setScrapeItemStatus,
  updateScrapeSource,
  backfillScrapeImages,
  listTrackedCoralTypes,
  setTrackedCoralType,
} from "@/lib/scrape.functions";
import { fmtMoney } from "@/lib/ops";
import { classifyCoralType, CORAL_TYPES, coralTypeLabel } from "@/lib/coral-type";
import { Switch } from "@/components/ui/switch";
import {
  RefreshCw,
  Loader2,
  ArrowLeft,
  ExternalLink,
  EyeOff,
  Eye,
  LayoutGrid,
  List,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Download,
  Star,
  ArrowUpDown,
} from "lucide-react";

export const Route = createFileRoute("/_app/vendor-watch/$sourceId")({
  component: ScrapeSourceDetail,
});

type StatusFilter = "new" | "imported" | "ignored" | "unavailable" | "all";

function fmtRelative(iso: string | null | undefined) {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Display the vendor's own (public) Shopify CDN image directly. It's stored on
// every scraped item as photo_source_url and is always current, so we don't
// depend on the copied-to-storage thumbnail (which can lag a scrape or get
// capped). Shopify CDN supports on-the-fly resizing via the `width` param.
function sizedImageUrl(src: string | null | undefined, width?: number): string | null {
  if (!src) return null;
  if (!width) return src;
  try {
    const u = new URL(src);
    u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return src;
  }
}

function ScrapeSourceDetail() {
  const { sourceId } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getScrapeSource);
  const refreshFn = useServerFn(refreshScrapeSource);
  const progressFn = useServerFn(getScrapeProgress);
  const setStatusFn = useServerFn(setScrapeItemStatus);
  const updateFn = useServerFn(updateScrapeSource);
  const backfillFn = useServerFn(backfillScrapeImages);
  const trackedFn = useServerFn(listTrackedCoralTypes);
  const setTrackedFn = useServerFn(setTrackedCoralType);
  const [savingCfg, setSavingCfg] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("new");
  const [coralFilter, setCoralFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("recent");
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    if (typeof window === "undefined") return "list";
    return (localStorage.getItem("vendor-watch.view") as "list" | "grid") || "list";
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ url: string; title: string } | null>(null);

  const openFull = async (e: React.MouseEvent, it: any) => {
    e.stopPropagation();
    // Prefer the vendor's full-res CDN original directly (public, always there).
    if (it.photo_source_url) {
      setLightbox({ url: it.photo_source_url, title: it.title });
      return;
    }
    if (!it.photo_path) return;
    // Fallback for items without a source URL: cached thumb, then signed original.
    setLightbox({ url: thumbs[it.id] ?? "", title: it.title });
    const { data: signed } = await supabase.storage
      .from("inventory-media")
      .createSignedUrl(it.photo_path, 3600);
    if (signed?.signedUrl) setLightbox({ url: signed.signedUrl, title: it.title });
  };

  // Close the lightbox on Escape (backdrop-click also closes).
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const { data, isLoading } = useQuery({
    queryKey: ["scrape-source", sourceId, statusFilter],
    queryFn: () => getFn({ data: { sourceId, statusFilter } }),
  });

  const { data: trackedData } = useQuery({
    queryKey: ["tracked-coral-types"],
    queryFn: () => trackedFn(),
  });

  // Live progress poll: only runs while a refresh is in-flight.
  const { data: progress } = useQuery({
    queryKey: ["scrape-progress", sourceId],
    queryFn: () => progressFn({ data: { sourceId } }),
    enabled: refreshing,
    refetchInterval: refreshing ? 2000 : false,
    refetchOnWindowFocus: false,
  });

  // Generate signed URLs for thumbnails (private bucket). Ask Supabase to
  // transform the original (often 1500-2500px Shopify masters) down to a
  // 320px webp so list/grid thumbs aren't pulling 500KB+ each.
  useMemo(() => {
    const items = data?.items ?? [];
    // Only sign stored thumbs for the rare item lacking a vendor CDN URL.
    const missing = items.filter(
      (it: any) => it.photo_path && !it.photo_source_url && !thumbs[it.id],
    );
    if (missing.length === 0) return;
    (async () => {
      const paths = missing.map((it: any) => it.photo_path).slice(0, 60);
      const { data: signed } = await supabase.storage
        .from("inventory-media")
        .createSignedUrls(paths, 3600, {
          transform: { width: 320, height: 320, resize: "cover", quality: 70 },
        } as any);
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
  const photoStats = (data as any)?.photoStats as { total: number; missing: number } | undefined;

  // Coral type per item (from title) + the tracked watchlist set.
  const tracked = new Set<string>(trackedData?.types ?? []);
  const decorated = items.map((it: any) => ({ ...it, coralType: classifyCoralType(it.title) }));
  const coralOptions = CORAL_TYPES.filter((ct) => decorated.some((it: any) => it.coralType === ct.slug));
  const hasOther = decorated.some((it: any) => !it.coralType);

  const SORTS: Record<string, (a: any, b: any) => number> = {
    recent: (a, b) => (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? ""),
    newest: (a, b) => (b.first_seen_at ?? "").localeCompare(a.first_seen_at ?? ""),
    price_asc: (a, b) => (a.wholesale_cost ?? Infinity) - (b.wholesale_cost ?? Infinity),
    price_desc: (a, b) => (b.wholesale_cost ?? -Infinity) - (a.wholesale_cost ?? -Infinity),
    name: (a, b) => (a.title ?? "").localeCompare(b.title ?? ""),
  };
  const view = decorated
    .filter(
      (it: any) =>
        (coralFilter === "all" ||
          (coralFilter === "other" ? !it.coralType : it.coralType === coralFilter)) &&
        (!watchlistOnly || (it.coralType && tracked.has(it.coralType))),
    )
    .sort(SORTS[sortBy] ?? SORTS.recent);

  const allSelected = view.length > 0 && view.every((it: any) => selected.has(it.id));

  const toggleTrack = async (slug: string) => {
    const isTracked = tracked.has(slug);
    try {
      await setTrackedFn({ data: { coralType: slug, tracked: !isTracked } });
      qc.invalidateQueries({ queryKey: ["tracked-coral-types"] });
      toast.success(isTracked ? `Untracked ${coralTypeLabel(slug)}` : `Tracking ${coralTypeLabel(slug)}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update watchlist");
    }
  };

  // Vendor CDN image first (always present), stored signed thumb as fallback.
  const thumbFor = (it: any): string | null =>
    sizedImageUrl(it.photo_source_url, 320) ?? thumbs[it.id] ?? null;

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const updateConfig = async (patch: {
    cadence?: "manual" | "daily" | "weekly" | "friday_night";
    is_active?: boolean;
  }) => {
    setSavingCfg(true);
    try {
      await updateFn({ data: { sourceId, ...patch } });
      qc.invalidateQueries({ queryKey: ["scrape-source", sourceId] });
      qc.invalidateQueries({ queryKey: ["scrape-sources"] });
      toast.success(patch.is_active === false ? "Paused" : "Saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    } finally {
      setSavingCfg(false);
    }
  };

  // Drain un-captured images to storage in safe chunks until none remain.
  const backfillImages = async () => {
    setBackfilling(true);
    let stored = 0;
    let remaining = 0;
    try {
      for (let i = 0; i < 40; i++) {
        const res = await backfillFn({ data: { sourceId, limit: 50 } });
        stored += res.downloaded;
        remaining = res.remaining;
        toast.loading(`Downloading images… ${remaining} left`, { id: "backfill" });
        if (remaining === 0 || res.downloaded === 0) break; // done, or no progress
      }
      toast.success(
        `Stored ${stored} image${stored === 1 ? "" : "s"}${remaining > 0 ? ` · ${remaining} still pending` : " · all captured"}`,
        { id: "backfill" },
      );
      qc.invalidateQueries({ queryKey: ["scrape-source", sourceId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Back-fill failed", { id: "backfill" });
    } finally {
      setBackfilling(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await refreshFn({ data: { sourceId } });
      toast.success(
        `Scraped ${res.fetched} item${res.fetched === 1 ? "" : "s"} — ${res.added} new, ${res.updated} updated, ${res.snapshots} history snapshot${res.snapshots === 1 ? "" : "s"}${res.transport === "firecrawl" ? " · via Firecrawl" : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["scrape-source", sourceId] });
      qc.invalidateQueries({ queryKey: ["scrape-sources"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Refresh failed");
    } finally {
      setRefreshing(false);
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
        to="/vendor-watch"
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
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Scraping{progress?.itemCount ? ` · ${progress.itemCount} items` : "…"}
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh now
              </>
            )}
          </Button>
        }
      />

      {/* Scrape status + schedule controls */}
      {source && (
        <div className="rounded-lg border bg-card p-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
          <div className="flex items-center gap-2">
            {(source as any).last_scrape_status === "error" ? (
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            ) : (source as any).last_scrape_status === "ok" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <span className="text-muted-foreground">Last scraped</span>
            <span className="font-medium">{fmtRelative((source as any).last_scraped_at)}</span>
            {typeof (source as any).last_item_count === "number" && (
              <span className="text-muted-foreground">· {(source as any).last_item_count} items</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Runs</span>
            <Select
              value={(source as any).cadence}
              onValueChange={(v) => updateConfig({ cadence: v as any })}
              disabled={savingCfg}
            >
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual only</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="friday_night">Friday night</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={!!(source as any).is_active}
              onCheckedChange={(c) => updateConfig({ is_active: c })}
              disabled={savingCfg}
            />
            <span className="text-muted-foreground">
              {(source as any).is_active ? "Active" : "Paused"}
            </span>
          </div>

          {photoStats && photoStats.total > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Images</span>
              <span className="font-medium">
                {photoStats.total - photoStats.missing}/{photoStats.total} stored
              </span>
              {photoStats.missing > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={backfillImages}
                  disabled={backfilling}
                >
                  {backfilling ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 mr-1" />
                  )}
                  Back-fill {photoStats.missing}
                </Button>
              )}
            </div>
          )}

          {(source as any).last_scrape_status === "error" && (source as any).last_scrape_error && (
            <div className="w-full text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5 break-words">
              Last run failed: {(source as any).last_scrape_error}
            </div>
          )}
        </div>
      )}

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
            <SelectItem value="unavailable">Sold / archived (gone from vendor)</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        {(coralOptions.length > 0 || hasOther) && (
          <Select value={coralFilter} onValueChange={setCoralFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {coralOptions.map((ct) => (
                <SelectItem key={ct.slug} value={ct.slug}>
                  {ct.label}
                </SelectItem>
              ))}
              {hasOther && <SelectItem value="other">Other</SelectItem>}
            </SelectContent>
          </Select>
        )}

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-40 h-9">
            <ArrowUpDown className="w-3.5 h-3.5 mr-1 opacity-60" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Recently seen</SelectItem>
            <SelectItem value="newest">Newest added</SelectItem>
            <SelectItem value="price_asc">Price: low → high</SelectItem>
            <SelectItem value="price_desc">Price: high → low</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={watchlistOnly ? "default" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => setWatchlistOnly((v) => !v)}
          title="Show only your tracked coral types"
        >
          <Star className={`w-4 h-4 mr-1 ${watchlistOnly ? "fill-current" : ""}`} />
          Watchlist{tracked.size > 0 ? ` ${tracked.size}` : ""}
        </Button>

        {coralFilter !== "all" && coralFilter !== "other" && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => toggleTrack(coralFilter)}>
            <Star
              className={`w-4 h-4 mr-1 ${tracked.has(coralFilter) ? "fill-amber-400 text-amber-400" : ""}`}
            />
            {tracked.has(coralFilter) ? "Tracking" : `Track ${coralTypeLabel(coralFilter)}`}
          </Button>
        )}

        <div className="text-sm text-muted-foreground">
          {view.length} item{view.length === 1 ? "" : "s"}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </div>

        <div className="ml-auto flex gap-2">
          {statusFilter === "new" && (
            <Button
              variant="outline"
              size="sm"
              onClick={ignoreSelected}
              disabled={selected.size === 0}
            >
              <EyeOff className="w-4 h-4 mr-1" /> Ignore
            </Button>
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
          <div className="flex border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setViewMode("list");
                localStorage.setItem("vendor-watch.view", "list");
              }}
              className={`px-2 py-1.5 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              title="List view"
              aria-label="List view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode("grid");
                localStorage.setItem("vendor-watch.view", "grid");
              }}
              className={`px-2 py-1.5 ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
              title="Grid view"
              aria-label="Grid view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && view.length === 0 && (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          {items.length === 0 && statusFilter === "new"
            ? "Nothing new. Click Refresh to check the vendor for new drops."
            : "No items match these filters."}
        </div>
      )}

      {/* Header row — list only */}
      {view.length > 0 && viewMode === "list" && (
        <div className="grid grid-cols-[auto_64px_1fr_120px_120px] gap-3 items-center px-3 py-2 text-[10px] uppercase font-semibold tracking-wider text-muted-foreground border-b">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(c) => {
              if (c) setSelected(new Set(view.map((it: any) => it.id)));
              else setSelected(new Set());
            }}
          />
          <span />
          <span>Coral</span>
          <span>Wholesale</span>
          <span>At vendor</span>
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && view.map((it: any) => {
        const isSel = selected.has(it.id);
        return (
          <div
            key={it.id}
            onClick={() => statusFilter !== "imported" && toggle(it.id)}
            className={`grid grid-cols-[auto_64px_1fr_120px_120px] gap-3 items-center px-3 py-3 border-b text-sm cursor-pointer hover:bg-muted/30 ${
              isSel ? "bg-primary/5" : ""
            }`}
          >
            <Checkbox
              checked={isSel}
              onCheckedChange={() => toggle(it.id)}
              onClick={(e) => e.stopPropagation()}
              disabled={statusFilter === "imported"}
            />
            <div
              className="w-14 h-14 rounded bg-muted overflow-hidden flex items-center justify-center cursor-zoom-in"
              onClick={(e) => openFull(e, it)}
            >
              {thumbFor(it) ? (
                <img
                  src={thumbFor(it) as string}
                  alt=""
                  width={56}
                  height={56}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[10px] text-muted-foreground">no photo</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate flex items-center gap-1.5">
                <span className="truncate">{it.title}</span>
                {it.coralType && (
                  <Badge
                    variant="outline"
                    className={`text-[9px] shrink-0 ${tracked.has(it.coralType) ? "border-amber-400 text-amber-700 dark:text-amber-300" : ""}`}
                  >
                    {tracked.has(it.coralType) && <Star className="w-2.5 h-2.5 mr-0.5 fill-amber-400 text-amber-400" />}
                    {coralTypeLabel(it.coralType)}
                  </Badge>
                )}
              </div>
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

      {/* Grid view */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {view.map((it: any) => {
            const isSel = selected.has(it.id);
            return (
              <div
                key={it.id}
                onClick={() => statusFilter !== "imported" && toggle(it.id)}
                className={`rounded-lg border bg-card overflow-hidden cursor-pointer transition-shadow hover:shadow-sm ${
                  isSel ? "ring-2 ring-primary" : ""
                }`}
              >
                <div
                  className="relative aspect-square bg-muted overflow-hidden cursor-zoom-in"
                  onClick={(e) => openFull(e, it)}
                >
                  {thumbFor(it) ? (
                    <img
                      src={thumbFor(it) as string}
                      alt={it.title}
                      width={320}
                      height={320}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">no photo</span>
                    </div>
                  )}
                  {statusFilter !== "imported" && (
                    <div className="absolute top-2 left-2">
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => toggle(it.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                  {!it.available_at_source && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Badge variant="secondary" className="text-xs">Gone</Badge>
                    </div>
                  )}
                </div>
                <div className="p-3 space-y-1.5">
                  <div className="font-medium text-sm line-clamp-2 leading-snug">{it.title}</div>
                  {it.coralType && (
                    <Badge
                      variant="outline"
                      className={`text-[9px] ${tracked.has(it.coralType) ? "border-amber-400 text-amber-700 dark:text-amber-300" : ""}`}
                    >
                      {tracked.has(it.coralType) && <Star className="w-2.5 h-2.5 mr-0.5 fill-amber-400 text-amber-400" />}
                      {coralTypeLabel(it.coralType)}
                    </Badge>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{fmtMoney(it.wholesale_cost)}</span>
                    {it.available_at_source ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-0 text-[10px]">
                        Available
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px]">
                        Gone
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                    <span className="font-mono">{it.external_id}</span>
                    {it.product_url && (
                      <a
                        href={it.product_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-foreground inline-flex items-center gap-0.5"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightbox(null)}
        >
          {lightbox.url ? (
            <img
              src={lightbox.url}
              alt={lightbox.title}
              className="max-w-full max-h-full object-contain rounded shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          )}
        </div>
      )}
    </div>
  );
}
