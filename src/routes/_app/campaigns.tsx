import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_app/campaigns")({ component: CampaignsPage });

function CampaignsPage() {
  const { data, refetch } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => (await supabase.from("campaigns").select("*").order("created_at",{ascending:false})).data ?? [],
  });
  return (
    <div className="p-8">
      <PageHeader title="Campaigns" action={<NewCampaign onDone={refetch} />} />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data ?? []).map((c:any) => (
          <div key={c.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold">{c.name}</h3>
              <Badge variant="outline">{c.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2 line-clamp-3">{c.purpose}</p>
            {(c.start_date || c.end_date) && (
              <p className="text-xs text-muted-foreground mt-2">
                {c.start_date ?? "—"} → {c.end_date ?? "—"}
              </p>
            )}
          </div>
        ))}
        {data?.length===0 && <p className="text-muted-foreground">No campaigns yet.</p>}
      </div>
    </div>
  );
}

function NewCampaign({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name:"", purpose:"", status:"planning", start_date:"", end_date:"" });
  const submit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("campaigns").insert({
      ...f, start_date: f.start_date || null, end_date: f.end_date || null, created_by: user?.id,
    } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Created"); setOpen(false); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> New campaign</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New campaign</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={f.name} onChange={e=>setF({...f,name:e.target.value})} /></div>
          <div className="space-y-1.5"><Label>Purpose</Label><Textarea rows={3} value={f.purpose} onChange={e=>setF({...f,purpose:e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Start</Label><Input type="date" value={f.start_date} onChange={e=>setF({...f,start_date:e.target.value})} /></div>
            <div className="space-y-1.5"><Label>End</Label><Input type="date" value={f.end_date} onChange={e=>setF({...f,end_date:e.target.value})} /></div>
          </div>
          <div className="space-y-1.5"><Label>Status</Label>
            <Select value={f.status} onValueChange={v=>setF({...f,status:v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} disabled={!f.name} className="w-full">Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
