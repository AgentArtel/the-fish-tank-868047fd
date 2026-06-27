import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    throw redirect({ to: "/dashboard" });
  },
  // Always paint something — never a blank shell. The empty redirect-only route
  // showed a white screen when launched as a standalone (home-screen) PWA.
  component: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  ),
});
