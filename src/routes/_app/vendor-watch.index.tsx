import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listScrapeSources, createScrapeSource } from "@/lib/scrape.functions";
import { Globe, ArrowRight, RefreshCw, Plus, Loader2 } from "lucide-react";

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

function AddSourceDialog() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const createFn = useServerFn(createScrapeSource);
  const [open, setOpen] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [cadence, setCadence] = useState("weekly");
  const [preferFirecrawl, setPreferFirecrawl] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setVendorName("");
    setName("");
    setSourceUrl("");
    setCadence("weekly");
    setPreferFirecrawl(false);
  };

  const submit = async () => {
    if (!vendorName.trim() || !name.trim() || !sourceUrl.trim()) {
      toast.error("Vendor, source name, and URL are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await createFn({
        data: { vendorName, name, sourceUrl, cadence: cadence as any, preferFirecrawl },
      });
      toast.success("Source created — click Refresh to pull its catalog.");
      qc.invalidateQueries({ queryKey: ["scrape-sources"] });
      setOpen(false);
      reset();
      nav({ to: "/vendor-watch/$sourceId", params: { sourceId: res.sourceId } });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create source");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : (setOpen(false), reset()))}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1" /> Add source
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a vendor source</DialogTitle>
          <DialogDescription>
            Point at a Shopify <code>products.json</code> feed (e.g.
            <code> store.com/products.json</code> or a collection's
            <code> /collections/x/products.json</code>). Most livestock vendors expose one for free.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="vendorName">Vendor</Label>
            <Input
              id="vendorName"
              placeholder="e.g. Tidal Gardens"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="srcName">Source name</Label>
            <Input
              id="srcName"
              placeholder="e.g. All corals"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="srcUrl">products.json URL</Label>
            <Input
              id="srcUrl"
              placeholder="https://store.com/products.json"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="space-y-1.5 flex-1">
              <Label>Cadence</Label>
              <Select value={cadence} onValueChange={setCadence}>
                <SelectTrigger className="h-9">
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
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={preferFirecrawl} onCheckedChange={setPreferFirecrawl} />
              <span className="text-sm text-muted-foreground">Force Firecrawl</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Leave Firecrawl off — we try the free direct fetch first and only fall back to Firecrawl
            if the vendor blocks us. Turn it on only for a vendor you already know blocks direct
            fetches.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Create source
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScrapeSourcesPage() {
  const fn = useServerFn(listScrapeSources);
  const { data, isLoading } = useQuery({
    queryKey: ["scrape-sources"],
    queryFn: () => fn(),
  });

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <PageHeader
        title="Vendor Watch"
        description="Monitor vendor catalogs — track price & availability over time and catch limited drops. Read-only: Vendor Watch never creates inventory or pricing."
        action={<AddSourceDialog />}
      />

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && data.sources.length === 0 && (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          No scrape sources configured yet.
        </div>
      )}

      <div className="space-y-3">
        {(data?.sources ?? []).map((s: any) => {
          const c = data?.counts?.[s.id] ?? { new: 0, available: 0, imported: 0, sold: 0 };
          return (
            <Link
              key={s.id}
              to="/vendor-watch/$sourceId"
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
                    {c.sold > 0 && (
                      <Badge variant="outline" className="text-muted-foreground">
                        {c.sold} sold / archived
                      </Badge>
                    )}
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
