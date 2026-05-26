import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/use-me";
import { useEffect } from "react";

export const Route = createFileRoute("/pending-approval")({ component: PendingPage });

function PendingPage() {
  const nav = useNavigate();
  const { data } = useMe();

  useEffect(() => {
    if (data?.isActive) nav({ to: "/dashboard" });
  }, [data?.isActive, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm text-center">
        <img src="/brand/fish-tank-badge.png" alt="The Fish Tank" className="w-28 h-28 mx-auto mb-4 rounded-full" />
        <h1 className="text-xl font-semibold">Your account is pending approval.</h1>
        <p className="text-sm text-muted-foreground mt-2">
          An admin needs to approve your account before you can access The Fish Tank Workspace.
        </p>
        <Button variant="outline" className="mt-6"
          onClick={async () => { await supabase.auth.signOut(); nav({ to: "/login" }); }}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
