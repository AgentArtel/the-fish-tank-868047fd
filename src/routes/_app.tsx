import {
  createFileRoute,
  Outlet,
  redirect,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { QuickAddFab } from "@/components/quick-add-fab";
import { getWorkload } from "@/lib/workload.functions";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Calendar,
  FileText,
  Image,
  Package,
  Megaphone,
  CheckSquare,
  Settings,
  Users,
  LogOut,
  PackageOpen,
  Truck,
  MapPin,
  ListChecks,
  DollarSign,
  Boxes,
  Menu,
  ChevronDown,
  ChevronRight,
  Store,
  Waves,
  Globe,
} from "lucide-react";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    // The Supabase session lives in localStorage (client-only), so the server
    // can't see it. Running this check during SSR always finds "no user" and
    // redirects to /login — which then flashes the logged-out view before the
    // client hydrates with the real session. Gate the auth check to the client.
    if (typeof window === "undefined") return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
  },
  component: AppLayout,
});

type BadgeKey = "intakeAwaitingReview" | "pricingPending" | "missingTags";
type NavItem = {
  to: string;
  label: string;
  icon: any;
  soon?: boolean;
  adminOnly?: boolean;
  badge?: BadgeKey;
};
type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Today",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/calendar", label: "Calendar", icon: Calendar },
      { to: "/tasks", label: "Tasks / SOPs", icon: ListChecks, soon: true },
    ],
  },
  {
    label: "Inventory",
    items: [
      { to: "/batches", label: "Intake", icon: PackageOpen, badge: "intakeAwaitingReview" },
      {
        to: "/pricing-approval",
        label: "Pricing Queue",
        icon: DollarSign,
        badge: "pricingPending",
      },
      { to: "/inventory", label: "Stock", icon: Boxes, badge: "missingTags" },
      { to: "/inventory/coral-discovery", label: "Coral Discovery", icon: Waves },
      { to: "/store-locations", label: "Locations", icon: MapPin },
      { to: "/vendors", label: "Vendors", icon: Truck },
    ],
  },
  {
    label: "Vendor Watch",
    items: [
      { to: "/vendor-watch", label: "Watch Sources", icon: Globe },
    ],
  },
  {
    label: "Marketing",
    items: [
      { to: "/content", label: "Posts", icon: FileText },
      { to: "/publishing", label: "Publishing", icon: CheckSquare },
      { to: "/campaigns", label: "Campaigns", icon: Megaphone },
      { to: "/media", label: "Media Library", icon: Image },
      { to: "/products", label: "Products", icon: Package },
    ],
  },
  {
    label: "Settings",
    items: [
      { to: "/settings/meta", label: "Workspace", icon: Settings },
      { to: "/settings/ai", label: "AI keys", icon: Settings, adminOnly: true },
      { to: "/settings/clover", label: "Clover POS", icon: Store },
      { to: "/settings/users", label: "Users", icon: Users, adminOnly: true },
    ],
  },
];

function NavBadge({ count, tone = "default" }: { count: number; tone?: "default" | "warn" }) {
  if (!count) return null;
  const cls =
    tone === "warn"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "bg-primary/15 text-primary";
  return (
    <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 ${cls}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

function SidebarBody({
  me,
  isAdmin,
  pathname,
  onNavigate,
  onSignOut,
}: {
  me: any;
  isAdmin: boolean;
  pathname: string;
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  const fn = useServerFn(getWorkload);
  const { data: workload } = useQuery({
    queryKey: ["workload"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem("nav.collapsed") ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("nav.collapsed", JSON.stringify(collapsed));
    }
  }, [collapsed]);

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      <div className="p-4 border-b flex items-center gap-2.5">
        <img src="/brand/fish-tank-mascot.png" alt="" className="w-9 h-9 rounded-md object-cover" />
        <div className="leading-tight">
          <div className="font-semibold text-sm">The Fish Tank</div>
          <div className="text-xs text-muted-foreground">Workspace</div>
        </div>
      </div>
      <nav className="flex-1 p-2 space-y-2 overflow-y-auto">
        {GROUPS.map((group) => {
          const visibleItems = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;
          const hasActive = visibleItems.some(
            (i) => pathname === i.to || (i.to !== "/dashboard" && pathname.startsWith(i.to + "/")),
          );
          const isCollapsed = !!collapsed[group.label] && !hasActive;
          const groupBadge = visibleItems.reduce((sum, i) => {
            if (!i.badge || !workload) return sum;
            return sum + ((workload as any)[i.badge] ?? 0);
          }, 0);

          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [group.label]: !c[group.label] }))}
                className="w-full flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                <span className="flex-1 text-left">{group.label}</span>
                {isCollapsed && groupBadge > 0 && <NavBadge count={groupBadge} tone="warn" />}
              </button>
              {!isCollapsed && (
                <div className="space-y-0.5 mt-0.5">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const active =
                      pathname === item.to ||
                      (item.to !== "/dashboard" && pathname.startsWith(item.to + "/"));
                    const count = item.badge && workload ? ((workload as any)[item.badge] ?? 0) : 0;
                    if (item.soon && item.to !== "/tasks") {
                      return (
                        <div
                          key={item.to}
                          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground/70 cursor-not-allowed"
                          title="Coming soon"
                        >
                          <Icon className="w-4 h-4" />
                          <span className="flex-1">{item.label}</span>
                          <span className="text-[9px] uppercase font-semibold tracking-wide bg-muted text-muted-foreground rounded px-1.5 py-0.5">
                            Soon
                          </span>
                        </div>
                      );
                    }
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
                        {!item.soon && count > 0 && (
                          <NavBadge
                            count={count}
                            tone={item.badge === "pricingPending" ? "warn" : "default"}
                          />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
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
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (me && !me.isActive) {
    throw redirect({ to: "/pending-approval" });
  }

  const isAdmin = !!me?.roles.includes("admin");
  const signOut = async () => {
    await supabase.auth.signOut();
    nav({ to: "/login" });
  };

  const activeLabel =
    GROUPS.flatMap((g) => g.items).find(
      (i) => pathname === i.to || (i.to !== "/dashboard" && pathname.startsWith(i.to + "/")),
    )?.label ?? "The Fish Tank";

  return (
    <div className="min-h-screen flex bg-muted/20">
      <aside className="hidden md:flex w-60 border-r flex-col shrink-0">
        <SidebarBody me={me} isAdmin={isAdmin} pathname={pathname} onSignOut={signOut} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
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

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <QuickAddFab />
    </div>
  );
}
