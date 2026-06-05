import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Tag, Printer } from "lucide-react";
import { INVENTORY_AVAILABILITY_LABELS, fmtMoney } from "@/lib/ops";

export const Route = createFileRoute("/_app/inventory/missing-tags")({
  component: MissingTagsPage,
});

type Row = {
  id: string;
  item_name: string;
  scientific_name: string | null;
  size: string | null;
  retail_price: number | null;
  availability_status: string;
  quantity_available: number;
  pricing_status: string;
  location_id: string | null;
  location_name: string;
  location_path: string;
  vendor_name: string;
};

const ACTIVE_STATUSES = ["available", "on_hold", "needs_id", "quarantine", "incoming"] as const;

function MissingTagsPage() {
  const { data: locations } = useQuery({
    queryKey: ["all-locations-full"],
    queryFn: async () =>
      (await supabase
        .from("store_locations")
        .select("id,name,parent_location_id,is_active")).data ?? [],
    staleTime: 60_000,
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["missing-tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("id,item_name,scientific_name,size,retail_price,availability_status,quantity_available,pricing_status,location_id,vendors(name),inventory_media(has_price_tag)")
        .in("availability_status", ACTIVE_STATUSES as unknown as string[])
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows: Row[] = useMemo(() => {
    if (!items || !locations) return [];
    const byId = new Map(locations.map((l: any) => [l.id, l]));
    const pathOf = (id: string | null): string => {
      if (!id) return "— Unassigned —";
      const parts: string[] = [];
      let cur: any = byId.get(id);
      let safety = 10;
      while (cur && safety-- > 0) {
        parts.unshift(cur.name);
        cur = cur.parent_location_id ? byId.get(cur.parent_location_id) : null;
      }
      return parts.join(" › ") || "—";
    };

    return (items as any[])
      .filter(it => {
        const media = (it.inventory_media ?? []) as { has_price_tag: boolean }[];
        return !media.some(m => m.has_price_tag === true);
      })
      .map(it => ({
        id: it.id,
        item_name: it.item_name,
        scientific_name: it.scientific_name,
        size: it.size,
        retail_price: it.retail_price,
        availability_status: it.availability_status,
        quantity_available: it.quantity_available,
        pricing_status: it.pricing_status,
        location_id: it.location_id,
        location_name: it.location_id ? (byId.get(it.location_id) as any)?.name ?? "—" : "— Unassigned —",
        location_path: pathOf(it.location_id),
        vendor_name: it.vendors?.name ?? "",
      }));
  }, [items, locations]);

  const grouped = useMemo(() => {
    const map = new Map<string, { path: string; items: Row[] }>();
    for (const r of rows) {
      const key = r.location_id ?? "__unassigned__";
      if (!map.has(key)) map.set(key, { path: r.location_path, items: [] });
      map.get(key)!.items.push(r);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, path: v.path, items: v.items }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [rows]);

  const downloadCsv = () => {
    const header = ["Location", "Item", "Scientific name", "Size", "Qty avail", "Retail price", "Pricing status", "Availability", "Vendor", "Item ID"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cols = [
        r.location_path,
        r.item_name,
        r.scientific_name ?? "",
        r.size ?? "",
        String(r.quantity_available),
        r.retail_price != null ? String(r.retail_price) : "",
        r.pricing_status,
        r.availability_status,
        r.vendor_name,
        r.id,
      ].map(v => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(cols.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `missing-price-tags-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/inventory"><ArrowLeft className="w-4 h-4 mr-1" /> Inventory</Link>
        </Button>
      </div>
      <PageHeader
        title="Missing price tags"
        description="Items that don't have a photo with a visible price tag yet. Grouped by location so you can walk the floor."
      />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="text-sm text-muted-foreground">
          {isLoading ? "Loading…" : `${rows.length} item${rows.length === 1 ? "" : "s"} across ${grouped.length} location${grouped.length === 1 ? "" : "s"}`}
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()} disabled={rows.length === 0}>
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
          <Button size="sm" onClick={downloadCsv} disabled={rows.length === 0}>
            <Download className="w-4 h-4 mr-1" /> Download CSV
          </Button>
        </div>
      </div>

      {!isLoading && rows.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center">
          <Tag className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <div className="font-medium">Everything's tagged</div>
          <div className="text-sm text-muted-foreground">No active inventory items are missing a price-tag photo.</div>
        </div>
      )}

      <div className="space-y-6 print:space-y-3">
        {grouped.map(g => (
          <section key={g.key} className="rounded-lg border bg-card overflow-hidden break-inside-avoid">
            <div className="px-4 py-2 bg-muted/40 border-b flex items-center justify-between">
              <div className="font-medium text-sm">{g.path}</div>
              <div className="text-xs text-muted-foreground">{g.items.length} item{g.items.length === 1 ? "" : "s"}</div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Qty</th>
                  <th className="px-4 py-2">Retail</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2">
                      <Link to="/inventory/$id" params={{ id: r.id }} className="font-medium hover:underline">
                        {r.item_name}
                      </Link>
                      {r.scientific_name && <div className="text-xs italic text-muted-foreground">{r.scientific_name}</div>}
                      {r.size && <div className="text-xs text-muted-foreground">{r.size}</div>}
                    </td>
                    <td className="px-4 py-2">{r.quantity_available}</td>
                    <td className="px-4 py-2">{fmtMoney(r.retail_price)}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {INVENTORY_AVAILABILITY_LABELS[r.availability_status as keyof typeof INVENTORY_AVAILABILITY_LABELS]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
