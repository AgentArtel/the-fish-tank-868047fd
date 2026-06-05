import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { QuickAddFab } from "@/components/quick-add-fab";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Calendar, FileText, Image, Package,
  Megaphone, CheckSquare, Settings, Users, LogOut,
  PackageOpen, Truck, MapPin, ListChecks, DollarSign, Boxes, Menu,
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
      { to: "/batches", label: "Inventory Intake", icon: PackageOpen },
      { to: "/pricing-approval", label: "Pricing Approval", icon: DollarSign },
      { to: "/inventory", label: "Inventory", icon: Boxes },
      { to: "/vendors", label: "Vendors", icon: Truck },
      { to: "/store-locations", label: "Store Locations", icon: MapPin },
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

function SidebarBody({
  me, isAdmin, pathname, onNavigate, onSignOut,
}: {
  me: any; isAdmin: boolean; pathname: string;
  onNavigate?: () => void; onSignOut: () => void;
}) {
  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
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
                      onClick={onNavigate}
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
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onSignOut}>
          <LogOut className="w-4 h-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}

function AppLayout() {
  const nav = useNavigate();
  const { data: me, isLoading } = useMe();
  const pathname = useRouterState({ select: s => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (me && !me.isActive) {
    throw redirect({ to: "/pending-approval" });
  }

  const isAdmin = !!me?.roles.includes("admin");
  const signOut = async () => { await supabase.auth.signOut(); nav({ to: "/login" }); };

  const activeLabel =
    GROUPS.flatMap(g => g.items).find(i => pathname === i.to || (i.to !== "/dashboard" && pathname.startsWith(i.to + "/")))?.label
    ?? "The Fish Tank";

  return (
    <div className="min-h-screen flex bg-muted/20">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 border-r flex-col shrink-0">
        <SidebarBody me={me} isAdmin={isAdmin} pathname={pathname} onSignOut={signOut} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-3 h-12 border-b bg-background">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody
                me={me}
                isAdmin={isAdmin}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
                onSignOut={signOut}
              />
            </SheetContent>
          </Sheet>
          <div className="font-semibold text-sm truncate">{activeLabel}</div>
        </header>

        <main className="flex-1 overflow-auto"><Outlet /></main>
      </div>

      <QuickAddFab />
    </div>
  );
}
