import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import type { ContentStatus } from "@/lib/workflow";
import { STATUS_LABELS } from "@/lib/workflow";

const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [items, upcoming, needsMedia] = await Promise.all([
      supabase.from("content_items").select("id,status"),
      supabase.from("content_items").select("id,title,status,scheduled_date")
        .not("scheduled_date","is",null).gte("scheduled_date", new Date().toISOString())
        .order("scheduled_date").limit(10),
      supabase.from("content_items").select("id,title").eq("status","needs_media").limit(10),
    ]);
    const counts: Record<string, number> = {};
    (items.data ?? []).forEach((r: any) => counts[r.status] = (counts[r.status] ?? 0) + 1);
    return { counts, upcoming: upcoming.data ?? [], needsMedia: needsMedia.data ?? [] };
  });

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

function Dashboard() {
  const fn = useServerFn(getDashboard);
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => fn() });
  const statuses: ContentStatus[] = ["idea","needs_media","drafting","needs_review","approved","scheduled","posted"];

  return (
    <div className="p-8">
      <div className="mb-6 rounded-xl border p-5 flex items-center gap-4 overflow-hidden" style={{ background: "var(--brand-ink)", color: "white" }}>
        <img src="/brand/fish-tank-mascot.png" alt="" className="w-14 h-14 object-contain flex-shrink-0" />
        <div>
          <h1 className="text-lg font-semibold">The Fish Tank CMS</h1>
          <p className="text-sm opacity-70">Manage content, media, products, campaigns, and publishing workflows.</p>
        </div>
      </div>
      <PageHeader title="Dashboard" description="Pipeline health for The Fish Tank." />
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        {statuses.map(s => (
          <Link key={s} to="/content" search={{ status: s }} className="rounded-lg border bg-card p-4 hover:border-primary transition-colors">
            <div className="text-2xl font-semibold">{data?.counts[s] ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-1">{STATUS_LABELS[s]}</div>
          </Link>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold mb-3">Upcoming scheduled</h2>
          {(data?.upcoming ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}
          <ul className="space-y-2">
            {(data?.upcoming ?? []).map((i: any) => (
              <li key={i.id} className="flex justify-between items-center text-sm">
                <Link to="/content/$id" params={{ id: i.id }} className="hover:underline">{i.title}</Link>
                <span className="text-muted-foreground text-xs">{new Date(i.scheduled_date).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <h2 className="font-semibold mb-3">Needs media</h2>
          {(data?.needsMedia ?? []).length === 0 && <p className="text-sm text-muted-foreground">All clear.</p>}
          <ul className="space-y-2">
            {(data?.needsMedia ?? []).map((i: any) => (
              <li key={i.id} className="flex justify-between items-center text-sm">
                <Link to="/content/$id" params={{ id: i.id }} className="hover:underline">{i.title}</Link>
                <StatusBadge status="needs_media" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
