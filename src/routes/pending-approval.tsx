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
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm text-center">
        <h1 className="text-xl font-semibold">Pending approval</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Your account has been created. An admin needs to approve you before you can access the CMS.
        </p>
        <Button variant="outline" className="mt-6"
          onClick={async () => { await supabase.auth.signOut(); nav({ to: "/login" }); }}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
