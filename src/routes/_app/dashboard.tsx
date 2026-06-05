import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getWorkload } from "@/lib/workload.functions";
import { fmtMoney } from "@/lib/ops";
import {
  PackageOpen, DollarSign, Tag, Boxes, Radio, Image as ImageIcon,
  Calendar as CalendarIcon, ArrowRight,
} from "lucide-react";

const getShopOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [recentIntake, recentInventory, upcomingContent, needsMedia, topValue] = await Promise.all([
      supabase.from("vendor_batches")
        .select("id, invoice_number, intake_status, invoice_total, invoice_date, vendors(name)")
        .order("created_at", { ascending: false }).limit(5),
      supabase.from("inventory_items")
        .select("id, clean_item_name, availability_status, retail_price, created_at, location_id, store_locations(name)")
        .order("created_at", { ascending: false }).limit(6),
      supabase.from("content_items")
        .select("id, title, status, scheduled_date")
        .not("scheduled_date", "is", null)
        .gte("scheduled_date", new Date().toISOString())
        .order("scheduled_date").limit(5),
      supabase.from("content_items")
        .select("id, title").eq("status", "needs_media").limit(5),
      supabase.from("inventory_items")
        .select("retail_price, quantity_available, item_type")
        .eq("availability_status", "available"),
    ]);

    const stockByCat = { livestock: 0, coral: 0, dryGoods: 0, other: 0 };
    let stockValue = 0;
    for (const r of (topValue.data ?? []) as any[]) {
      const price = Number(r.retail_price ?? 0);
      const qty = Number(r.quantity_available ?? 1);
      const v = price * qty;
      stockValue += v;
      const t = r.item_type as string;
      if (t === "fish" || t === "invert" || t === "live_rock") stockByCat.livestock += v;
      else if (t === "coral") stockByCat.coral += v;
      else if (t === "dry_good" || t === "equipment") stockByCat.dryGoods += v;
      else stockByCat.other += v;
    }

    return {
      recentIntake: recentIntake.data ?? [],
      recentInventory: recentInventory.data ?? [],
      upcomingContent: upcomingContent.data ?? [],
      needsMedia: needsMedia.data ?? [],
      stockValue,
      stockByCat,
    };
  });

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

type KpiTone = "default" | "warn" | "good";

function Kpi({
  label, value, sub, icon: Icon, to, tone = "default",
}: {
  label: string; value: string | number; sub?: string;
  icon: any; to: string; tone?: KpiTone;
}) {
  const ring = tone === "warn"
    ? "border-amber-300/60 hover:border-amber-400"
    : tone === "good"
      ? "border-emerald-300/60 hover:border-emerald-400"
      : "hover:border-primary";
  const iconCls = tone === "warn"
    ? "text-amber-600"
    : tone === "good"
      ? "text-emerald-600"
      : "text-muted-foreground";
  return (
    <Link to={to} className={`block rounded-xl border bg-card p-4 transition-colors ${ring}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
        <Icon className={`w-4 h-4 ${iconCls}`} />
      </div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </Link>
  );
}

function intakeStatusLabel(s: string) {
  return ({ draft: "Draft", uploaded: "Uploaded", parsing: "Parsing", review: "Review", approved: "Approved", converted: "Converted", archived: "Archived" } as Record<string,string>)[s] ?? s;
}

function Dashboard() {
  const workloadFn = useServerFn(getWorkload);
  const overviewFn = useServerFn(getShopOverview);
  const { data: w } = useQuery({ queryKey: ["workload"], queryFn: () => workloadFn() });
  const { data } = useQuery({ queryKey: ["shop-overview"], queryFn: () => overviewFn() });

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="rounded-xl border p-5 flex items-center gap-4 overflow-hidden" style={{ background: "var(--brand-ink)", color: "white" }}>
        <img src="/brand/fish-tank-mascot.png" alt="" className="w-14 h-14 object-contain flex-shrink-0" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Good day at the shop</h1>
          <p className="text-sm opacity-70">Here's what needs your attention right now.</p>
        </div>
      </div>

      {/* Workload — needs action */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Needs attention</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            label="Intake to review"
            value={w?.intakeAwaitingReview ?? "—"}
            sub={(w?.intakeOpen ?? 0) > 0 ? `${w?.intakeOpen} open batches` : "No open batches"}
            icon={PackageOpen}
            to="/batches"
            tone={(w?.intakeAwaitingReview ?? 0) > 0 ? "warn" : "default"}
          />
          <Kpi
            label="Pricing queue"
            value={w?.pricingPending ?? "—"}
            sub="Awaiting admin approval"
            icon={DollarSign}
            to="/pricing-approval"
            tone={(w?.pricingPending ?? 0) > 0 ? "warn" : "default"}
          />
          <Kpi
            label="Missing price tags"
            value={w?.missingTags ?? "—"}
            sub="Items without a tagged photo"
            icon={Tag}
            to="/inventory/missing-tags"
            tone={(w?.missingTags ?? 0) > 0 ? "warn" : "default"}
          />
          <Kpi
            label="Posts needing media"
            value={(w?.contentCounts?.needs_media ?? 0)}
            sub="Drafts waiting on photos"
            icon={ImageIcon}
            to="/content"
            tone={(w?.contentCounts?.needs_media ?? 0) > 0 ? "warn" : "default"}
          />
        </div>
      </section>

      {/* Health — at a glance */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Shop at a glance</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi
            label="Available stock"
            value={w?.available ?? "—"}
            sub={`${w?.inventoryTotal ?? 0} total items`}
            icon={Boxes}
            to="/inventory"
            tone="good"
          />
          <Kpi
            label="On hold / quarantine"
            value={w?.hold ?? "—"}
            sub="Not yet for sale"
            icon={Boxes}
            to="/inventory"
          />
          <Kpi
            label="Live sale"
            value={w?.liveSale ?? "—"}
            sub="Staged or live"
            icon={Radio}
            to="/inventory"
            tone={(w?.liveSale ?? 0) > 0 ? "good" : "default"}
          />
          <Kpi
            label="Total stock value"
            value={data ? fmtMoney(data.stockValue) : "—"}
            sub="Retail × available qty"
            icon={DollarSign}
            to="/inventory"
          />
        </div>
      </section>

      {/* Stock value by category */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Stock value by category</h2>
          <span className="text-xs text-muted-foreground">
            Total {data ? fmtMoney(data.stockValue) : "—"}
            {data && data.stockByCat.other > 0 ? ` · Other ${fmtMoney(data.stockByCat.other)}` : ""}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Kpi
            label="Livestock"
            value={data ? fmtMoney(data.stockByCat.livestock) : "—"}
            sub="Fish, inverts, live rock"
            icon={Boxes}
            to="/inventory"
          />
          <Kpi
            label="Coral"
            value={data ? fmtMoney(data.stockByCat.coral) : "—"}
            sub="All coral"
            icon={Boxes}
            to="/inventory"
          />
          <Kpi
            label="Dry goods"
            value={data ? fmtMoney(data.stockByCat.dryGoods) : "—"}
            sub="Dry goods & equipment"
            icon={Boxes}
            to="/inventory"
          />
        </div>
      </section>


      {/* Recents */}
      <section className="grid lg:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Recent intake</h3>
            <Link to="/batches" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {(data?.recentIntake ?? []).length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No batches yet.</div>
          ) : (
            <ul className="divide-y">
              {data!.recentIntake.map((b: any) => (
                <li key={b.id} className="p-3 text-sm">
                  <Link to="/batches/$id" params={{ id: b.id }} className="block hover:bg-muted/40 -m-3 p-3 rounded">
                    <div className="flex justify-between gap-2">
                      <div className="font-medium truncate">{b.vendors?.name ?? "Unknown vendor"}</div>
                      <span className="text-xs text-muted-foreground shrink-0">{intakeStatusLabel(b.intake_status)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex justify-between">
                      <span>{b.invoice_number ?? "—"}</span>
                      <span>{b.invoice_total != null ? fmtMoney(b.invoice_total) : ""}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Recently added inventory</h3>
            <Link to="/inventory" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {(data?.recentInventory ?? []).length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nothing yet — convert an intake batch.</div>
          ) : (
            <ul className="divide-y">
              {data!.recentInventory.map((i: any) => (
                <li key={i.id} className="p-3 text-sm">
                  <Link to="/inventory/$id" params={{ id: i.id }} className="block hover:bg-muted/40 -m-3 p-3 rounded">
                    <div className="flex justify-between gap-2">
                      <div className="font-medium truncate">{i.clean_item_name ?? "Unnamed"}</div>
                      <span className="text-xs text-muted-foreground shrink-0">{i.retail_price != null ? fmtMoney(i.retail_price) : ""}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex justify-between">
                      <span>{i.store_locations?.name ?? "No location"}</span>
                      <span>{i.availability_status}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-card">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Upcoming posts</h3>
            <Link to="/calendar" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Calendar <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {(data?.upcomingContent ?? []).length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nothing scheduled.</div>
          ) : (
            <ul className="divide-y">
              {data!.upcomingContent.map((c: any) => (
                <li key={c.id} className="p-3 text-sm">
                  <Link to="/content/$id" params={{ id: c.id }} className="block hover:bg-muted/40 -m-3 p-3 rounded">
                    <div className="flex justify-between gap-2">
                      <div className="font-medium truncate">{c.title}</div>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" />
                      {new Date(c.scheduled_date).toLocaleString()}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
