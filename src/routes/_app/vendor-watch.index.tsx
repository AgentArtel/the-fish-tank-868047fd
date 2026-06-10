import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listScrapeSources } from "@/lib/scrape.functions";
import { Globe, ArrowRight, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/vendor-watch/")({
  component: ScrapeSourcesPage,
});

function fmtRelative(iso: string | null | undefined) {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const CADENCE_LABEL: Record<string, string> = {
  manual: "Manual",
  daily: "Daily",
  weekly: "Weekly",
  friday_night: "Friday night",
};

function ScrapeSourcesPage() {
  const fn = useServerFn(listScrapeSources);
  const { data, isLoading } = useQuery({
    queryKey: ["scrape-sources"],
    queryFn: () => fn(),
  });

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <PageHeader
        title="Vendor Scrapes"
        description="Pull live drops from vendor websites. Scraped items become draft vendor batches — pricing still goes through admin approval before anything goes live."
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && data.sources.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          No scrape sources configured yet.
        </div>
      )}

      <div className="space-y-3">
        {(data?.sources ?? []).map((s: any) => {
          const c = data?.counts?.[s.id] ?? { new: 0, available: 0, imported: 0 };
          return (
            <Link
              key={s.id}
              to="/vendors/scrape/$sourceId"
              params={{ sourceId: s.id }}
              className="block rounded-lg border bg-card p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{s.vendors?.name}</h3>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-sm">{s.name}</span>
                    {!s.is_active && (
                      <Badge variant="outline" className="text-xs">
                        Paused
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {s.source_url}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                    <Badge variant="secondary">{CADENCE_LABEL[s.cadence] ?? s.cadence}</Badge>
                    {c.new > 0 && (
                      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0">
                        {c.new} new
                      </Badge>
                    )}
                    <Badge variant="outline">{c.available} live at vendor</Badge>
                    <Badge variant="outline">{c.imported} imported</Badge>
                    <span className="text-muted-foreground ml-auto flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      {fmtRelative(s.last_scraped_at)}
                      {s.last_scrape_status === "error" && (
                        <span className="text-destructive">· error</span>
                      )}
                    </span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
