import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Printer, ShoppingCart } from "lucide-react";
import { ITEM_TYPE_LABELS, fmtMoney } from "@/lib/ops";

export const Route = createFileRoute("/_app/inventory/restock")({ component: RestockPage });

type Row = {
  id: string;
  item_name: string;
  scientific_name: string | null;
  item_type: string | null;
  retail_price: number | null;
  isColony: boolean;
  retiredAt: string | null;
  location_path: string;
  vendor_name: string;
};

type Scope = "all" | "colonies";

function RestockPage() {
  const [scope, setScope] = useState<Scope>("all");

  const { data: locations } = useQuery({
    queryKey: ["all-locations-full"],
    queryFn: async () =>
      (await supabase.from("store_locations").select("id,name,parent_location_id,is_active"))
        .data ?? [],
    staleTime: 60_000,
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["restock-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select(
          "id,item_name,scientific_name,item_type,retail_price,attrs,colony_gone,colony_gone_at,location_id,updated_at,vendors(name)",
        )
        .eq("availability_status", "sold_out")
        .order("colony_gone_at", { ascending: false, nullsFirst: false })
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
    return (items as any[]).map((it) => {
      const isColony = (it.attrs as any)?.stock_mode === "colony" || it.colony_gone === true;
      return {
        id: it.id,
        item_name: it.item_name,
        scientific_name: it.scientific_name,
        item_type: it.item_type,
        retail_price: it.retail_price,
        isColony,
        retiredAt: it.colony_gone_at ?? it.updated_at ?? null,
        location_path: pathOf(it.location_id),
        vendor_name: it.vendors?.name ?? "",
      };
    });
  }, [items, locations]);

  const scoped = useMemo(
    () => (scope === "colonies" ? rows.filter((r) => r.isColony) : rows),
    [rows, scope],
  );

  // Group by vendor so you can build a per-supplier re-order; colonies pinned first.
  const grouped = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of scoped) {
      const key = r.vendor_name || "— No vendor —";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .map(([vendor, list]) => ({
        vendor,
        items: list.sort((a, b) => Number(b.isColony) - Number(a.isColony)),
      }))
      .sort((a, b) => a.vendor.localeCompare(b.vendor));
  }, [scoped]);

  const totalEstCents = scoped.reduce(
    (n, r) => n + Math.round(Number(r.retail_price ?? 0) * 100),
    0,
  );

  const fmtRel = (iso: string | null) => {
    if (!iso) return "—";
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const downloadCsv = () => {
    const header = [
      "Vendor",
      "Item",
      "Type",
      "Colony",
      "Location",
      "Retired",
      "Last price",
      "Item ID",
    ];
    const lines = [header.join(",")];
    for (const r of scoped) {
      const cols = [
        r.vendor_name,
        r.item_name,
        r.item_type ?? "",
        r.isColony ? "yes" : "",
        r.location_path,
        r.retiredAt ?? "",
        r.retail_price != null ? String(r.retail_price) : "",
        r.id,
      ].map((v) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(cols.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `restock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/inventory">
            <ArrowLeft className="w-4 h-4 mr-1" /> Inventory
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Restock"
        description="Sold-out and retired stock to re-order — retired coral colonies first. Grouped by vendor so you can send a re-order; an item drops off once it's restocked."
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-md border p-0.5">
          {(["all", "colonies"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-2.5 py-1 text-xs rounded ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {s === "all" ? "All sold-out" : "Colonies only"}
            </button>
          ))}
        </div>
        <div className="text-sm text-muted-foreground">
          {isLoading
            ? "Loading…"
            : `${scoped.length} item${scoped.length === 1 ? "" : "s"} · ${fmtMoney(totalEstCents / 100)} est. value`}
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            disabled={scoped.length === 0}
          >
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
          <Button size="sm" onClick={downloadCsv} disabled={scoped.length === 0}>
            <Download className="w-4 h-4 mr-1" /> Download CSV
          </Button>
        </div>
      </div>

      {!isLoading && scoped.length === 0 && (
        <div className="rounded-lg border bg-card p-10 text-center">
          <ShoppingCart className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <div className="font-medium">Nothing to restock</div>
          <div className="text-sm text-muted-foreground">
            No {scope === "colonies" ? "retired colonies" : "sold-out items"} right now.
          </div>
        </div>
      )}

      <div className="space-y-6 print:space-y-3">
        {grouped.map((g) => (
          <section
            key={g.vendor}
            className="rounded-lg border bg-card overflow-hidden break-inside-avoid"
          >
            <div className="px-4 py-2 bg-muted/40 border-b flex items-center justify-between">
              <div className="font-medium text-sm">{g.vendor}</div>
              <div className="text-xs text-muted-foreground">
                {g.items.length} item{g.items.length === 1 ? "" : "s"}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Location</th>
                  <th className="px-4 py-2">Retired</th>
                  <th className="px-4 py-2 text-right">Last price</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/inventory/$id"
                          params={{ id: r.id }}
                          className="font-medium hover:underline"
                        >
                          {r.item_name}
                        </Link>
                        {r.isColony && (
                          <Badge variant="outline" className="text-[10px]">
                            Colony
                          </Badge>
                        )}
                      </div>
                      {r.scientific_name && (
                        <div className="text-xs italic text-muted-foreground">
                          {r.scientific_name}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {ITEM_TYPE_LABELS[r.item_type as keyof typeof ITEM_TYPE_LABELS] ??
                          r.item_type ??
                          "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.location_path}</td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtRel(r.retiredAt)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {fmtMoney(r.retail_price)}
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
