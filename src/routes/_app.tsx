import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Calendar, FileText, Image, Package,
  Megaphone, CheckSquare, Settings, Users, LogOut,
} from "lucide-react";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/content", label: "Content", icon: FileText },
  { to: "/media", label: "Media", icon: Image },
  { to: "/products", label: "Products", icon: Package },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/publishing", label: "Publishing", icon: CheckSquare },
] as const;

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
            <div className="text-xs text-muted-foreground">CMS</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map(item => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.to);
            return (
              <Link key={item.to} to={item.to}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "hover:bg-sidebar-accent/50"
                }`}>
                <Icon className="w-4 h-4" /> {item.label}
              </Link>
            );
          })}
          <div className="pt-3 mt-3 border-t space-y-0.5">
            <Link to="/settings/meta"
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${pathname==="/settings/meta"?"bg-sidebar-accent font-medium":"hover:bg-sidebar-accent/50"}`}>
              <Settings className="w-4 h-4" /> Meta settings
            </Link>
            {isAdmin && (
              <Link to="/settings/users"
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${pathname==="/settings/users"?"bg-sidebar-accent font-medium":"hover:bg-sidebar-accent/50"}`}>
                <Users className="w-4 h-4" /> Users
              </Link>
            )}
          </div>
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
