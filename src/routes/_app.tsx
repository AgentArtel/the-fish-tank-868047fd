import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Calendar, FileText, Image, Package,
  Megaphone, CheckSquare, Settings, Users, LogOut,
  PackageOpen, Truck, MapPin, ListChecks,
} from "lucide-react";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

type NavItem = { to: string; label: string; icon: any; soon?: boolean; adminOnly?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Content",
    items: [
      { to: "/calendar", label: "Calendar", icon: Calendar },
      { to: "/content", label: "Content Items", icon: FileText },
      { to: "/publishing", label: "Publishing", icon: CheckSquare },
      { to: "/campaigns", label: "Campaigns", icon: Megaphone },
    ],
  },
  {
    label: "Media",
    items: [{ to: "/media", label: "Media Library", icon: Image }],
  },
  {
    label: "Products",
    items: [{ to: "/products", label: "Products", icon: Package }],
  },
  {
    label: "Operations",
    items: [
      { to: "/inventory-intake", label: "Inventory Intake", icon: PackageOpen, soon: true },
      { to: "/vendors", label: "Vendors", icon: Truck, soon: true },
      { to: "/store-placement", label: "Store Placement", icon: MapPin, soon: true },
      { to: "/tasks", label: "Tasks / SOPs", icon: ListChecks, soon: true },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/settings/meta", label: "Meta Placeholder", icon: Settings },
      { to: "/settings/users", label: "Users", icon: Users, adminOnly: true },
    ],
  },
];

function AppLayout() {
  const nav = useNavigate();
  const { data: me, isLoading } = useMe();
  const pathname = useRouterState({ select: s => s.location.pathname });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (me && !me.isActive) {
    throw redirect({ to: "/pending-approval" });
  }

  const isAdmin = me?.roles.includes("admin");

  return (
    <div className="min-h-screen flex bg-muted/20">
      <aside className="w-60 border-r bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-4 border-b flex items-center gap-2.5">
          <img src="/brand/fish-tank-mascot.png" alt="" className="w-9 h-9 rounded-md object-cover" />
          <div className="leading-tight">
            <div className="font-semibold text-sm">The Fish Tank</div>
            <div className="text-xs text-muted-foreground">Workspace</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-4 overflow-y-auto">
          {GROUPS.map(group => {
            const visibleItems = group.items.filter(i => !i.adminOnly || isAdmin);
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {visibleItems.map(item => {
                    const Icon = item.icon;
                    const active = pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to + "/"));
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : item.soon
                              ? "text-muted-foreground hover:bg-sidebar-accent/40"
                              : "hover:bg-sidebar-accent/50"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="flex-1">{item.label}</span>
                        {item.soon && (
                          <span className="text-[9px] uppercase font-semibold tracking-wide bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                            Soon
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <div className="text-xs text-muted-foreground mb-2 truncate">{me?.profile?.email}</div>
          <Button variant="ghost" size="sm" className="w-full justify-start"
            onClick={async () => { await supabase.auth.signOut(); nav({ to: "/login" }); }}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  );
}
