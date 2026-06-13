import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCoralSalesByType } from "@/lib/ops.functions";
import { fmtMoney } from "@/lib/ops";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// "Sold by coral type over time" — rolls up the inventory_sale_events ledger
// (coral lines only, classified from the item name) for the dashboard.
export function CoralSalesReport() {
  const fn = useServerFn(getCoralSalesByType);
  const [days, setDays] = useState("30");
  const { data, isLoading } = useQuery({
    queryKey: ["coral-sales-by-type", days],
    queryFn: () => fn({ data: { days: Number(days) } }),
  });
  const rows = data?.rows ?? [];
  const maxQty = Math.max(1, ...rows.map((r: any) => r.qty));

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Coral sales by type
        </h2>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border bg-card p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No coral sales logged in this period yet — log sales from a coral's item page.
          </p>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-3">
              {data?.totalQty} heads/frags · {fmtMoney((data?.totalRevenueCents ?? 0) / 100)} across{" "}
              {rows.length} type{rows.length === 1 ? "" : "s"}
            </div>
            <div className="space-y-2">
              {rows.map((r: any) => (
                <div key={r.type} className="flex items-center gap-3">
                  <div className="w-28 text-sm shrink-0 truncate">{r.label}</div>
                  <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${(r.qty / maxQty) * 100}%` }}
                    />
                  </div>
                  <div className="w-14 text-right text-sm tabular-nums">{r.qty}</div>
                  <div className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                    {r.revenueCents > 0 ? fmtMoney(r.revenueCents / 100) : "—"}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
