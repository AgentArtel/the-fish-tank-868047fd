import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings/meta")({ component: MetaSettings });

function MetaSettings() {
  const { data, refetch } = useQuery({
    queryKey: ["meta-settings"],
    queryFn: async () => (await supabase.from("meta_connection_settings").select("*").limit(1).maybeSingle()).data,
  });
  const [f, setF] = useState<any>({});
  useEffect(() => { if (data) setF(data); }, [data]);

  const save = async () => {
    const payload = {
      meta_business_id: f.meta_business_id || null,
      facebook_page_id: f.facebook_page_id || null,
      instagram_business_account_id: f.instagram_business_account_id || null,
      connected_status: f.connected_status || "not_connected",
      notes: f.notes || null,
    };
    if (data?.id) {
      await supabase.from("meta_connection_settings").update(payload).eq("id", data.id);
    } else {
      await supabase.from("meta_connection_settings").insert(payload);
    }
    toast.success("Saved"); refetch();
  };

  return (
    <div className="p-8 max-w-2xl">
      <PageHeader title="Meta integration" description="Placeholder configuration only — no API calls, no tokens, no OAuth." />
      <div className="rounded-lg border bg-amber-50 text-amber-900 p-4 mb-6 text-sm">
        <strong>Not connected.</strong> The Meta Graph API integration is planned for a future release.
        For now, store IDs and notes here so they're ready when posting is automated via Edge Functions or n8n.
      </div>
      <div className="space-y-4 rounded-lg border bg-card p-5">
        <div className="space-y-1.5"><Label>Meta Business ID</Label><Input value={f.meta_business_id ?? ""} onChange={e=>setF({...f, meta_business_id:e.target.value})} /></div>
        <div className="space-y-1.5"><Label>Facebook Page ID</Label><Input value={f.facebook_page_id ?? ""} onChange={e=>setF({...f, facebook_page_id:e.target.value})} /></div>
        <div className="space-y-1.5"><Label>Instagram Business Account ID</Label><Input value={f.instagram_business_account_id ?? ""} onChange={e=>setF({...f, instagram_business_account_id:e.target.value})} /></div>
        <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={3} value={f.notes ?? ""} onChange={e=>setF({...f, notes:e.target.value})} /></div>
        <Button onClick={save}>Save</Button>
      </div>
    </div>
  );
}
