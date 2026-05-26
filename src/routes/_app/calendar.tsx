import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_app/calendar")({ component: CalendarPage });

function CalendarPage() {
  const { data } = useQuery({
    queryKey: ["calendar"],
    queryFn: async () => (await supabase.from("content_items")
      .select("id,title,status,scheduled_date")
      .not("scheduled_date","is",null)
      .order("scheduled_date")).data ?? [],
  });

  const groups: Record<string, any[]> = {};
  (data ?? []).forEach((i:any) => {
    const day = new Date(i.scheduled_date).toDateString();
    (groups[day] ??= []).push(i);
  });

  return (
    <div className="p-8">
      <PageHeader title="Calendar" description="Items with a scheduled date, grouped by day." />
      {Object.keys(groups).length === 0 && <p className="text-muted-foreground">Nothing scheduled yet.</p>}
      <div className="space-y-6">
        {Object.entries(groups).map(([day, items]) => (
          <div key={day}>
            <h3 className="font-semibold text-sm mb-2">{day}</h3>
            <div className="space-y-2">
              {items.map(i => (
                <Link key={i.id} to="/content/$id" params={{id:i.id}}
                  className="block rounded-md border bg-card p-3 text-sm hover:border-primary">
                  <div className="flex justify-between">
                    <span className="font-medium">{i.title}</span>
                    <span className="text-muted-foreground text-xs">{new Date(i.scheduled_date).toLocaleTimeString()}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
