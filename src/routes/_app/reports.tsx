import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSalesReport } from "@/lib/reports.functions";
import { CoralSalesReport } from "@/components/coral-sales-report";
import { fmtMoney, ITEM_TYPE_LABELS, type ItemType } from "@/lib/ops";

export const Route = createFileRoute("/_app/reports")({ component: ReportsPage });

const money = (cents: number) => fmtMoney(cents / 100);

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  right,
}: {
  label: string;
  value: number;
  max: number;
  right: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 text-sm shrink-0 truncate" title={label}>
        {label}
      </div>
      <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
      <div className="w-24 text-right text-xs text-muted-foreground tabular-nums">{right}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        {title}
      </h2>
      <div className="rounded-lg border bg-card p-4">{children}</div>
    </section>
  );
}

function ReportsPage() {
  const fn = useServerFn(getSalesReport);
  const [days, setDays] = useState("30");
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "sales", days],
    queryFn: () => fn({ data: { days: Number(days) } }),
  });

  const s = data?.summary;
  const maxRev = Math.max(1, ...(data?.revenueOverTime ?? []).map((b) => b.revenueCents));
  const maxSeller = Math.max(1, ...(data?.topSellers ?? []).map((r) => r.revenueCents));
  const maxType = Math.max(1, ...(data?.byItemType ?? []).map((r) => r.revenueCents));

  return (
    <div className="p-6 md:p-8 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader
          title="Reports"
          description="What's selling, when, and what's sitting. Read-only insight from the Clover sale ledger."
        />
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-9 w-36 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !s ? (
        <p className="text-sm text-muted-foreground">No data.</p>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Revenue" value={money(s.revenueCents)} sub={`${s.lineCount} line items`} />
            <Kpi label="Orders" value={String(s.orderCount)} />
            <Kpi label="Avg order" value={money(s.aovCents)} />
            <Kpi label="Units sold" value={String(s.unitsSold)} />
          </div>

          {(s.unlinkedSales > 0 || s.needsReview > 0) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
              {s.unlinkedSales > 0 && (
                <>
                  <span className="font-medium">{s.unlinkedSales}</span> sales aren't linked to a
                  workspace item yet — revenue totals include them, but the product breakdowns below
                  don't. Link Clover items to fill these in.
                </>
              )}
              {s.refunds > 0 && <> · {s.refunds} refunds/voids held for review.</>}
            </div>
          )}

          {/* Revenue over time */}
          <Card title={`Revenue over time (last ${days} days)`}>
            {data!.revenueOverTime.every((b) => b.revenueCents === 0) ? (
              <p className="text-sm text-muted-foreground">No sales recorded in this period.</p>
            ) : (
              <div className="flex items-end gap-1 h-40">
                {data!.revenueOverTime.map((b, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group">
                    <div
                      className="w-full bg-primary/80 rounded-t group-hover:bg-primary transition-colors"
                      style={{ height: `${(b.revenueCents / maxRev) * 100}%` }}
                      title={`${b.label}: ${money(b.revenueCents)}`}
                    />
                    {i % Math.ceil(data!.revenueOverTime.length / 12) === 0 && (
                      <div className="text-[9px] text-muted-foreground mt-1 rotate-0 truncate w-full text-center">
                        {b.label}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Top sellers */}
          <Card title="Top sellers (by revenue)">
            {data!.topSellers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales yet in this period.</p>
            ) : (
              <div className="space-y-2">
                {data!.topSellers.map((r, i) => (
                  <BarRow
                    key={i}
                    label={r.label}
                    value={r.revenueCents}
                    max={maxSeller}
                    right={`${money(r.revenueCents)} · ${r.qty}u`}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* By item type */}
          {data!.byItemType.length > 0 && (
            <Card title="Sales by item type">
              <div className="space-y-2">
                {data!.byItemType.map((r) => (
                  <BarRow
                    key={r.type}
                    label={ITEM_TYPE_LABELS[r.type as ItemType] ?? r.type}
                    value={r.revenueCents}
                    max={maxType}
                    right={`${money(r.revenueCents)} · ${r.qty}u`}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Coral detail — reuse the existing component */}
          <CoralSalesReport />

          {/* Slow / no movers */}
          <Card title="Slow movers — available, zero sales this period">
            {data!.slowMovers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing flagged. Once items are marked <span className="font-medium">available</span>,
                this surfaces dead stock that's tying up space.
              </p>
            ) : (
              <div className="space-y-1.5">
                {data!.slowMovers.map((it: any) => (
                  <div key={it.id} className="flex items-center gap-3 text-sm">
                    <div className="flex-1 truncate" title={it.name}>
                      {it.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {it.type ? (ITEM_TYPE_LABELS[it.type as ItemType] ?? it.type) : "—"}
                    </div>
                    <div className="w-20 text-right tabular-nums">
                      {it.retailCents != null ? money(it.retailCents) : "—"}
                    </div>
                    <div className="w-24 text-right text-xs text-muted-foreground tabular-nums">
                      {it.daysListed}d listed
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
