import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { slugify } from "@/lib/ops";

export const Route = createFileRoute("/_app/vendors")({ component: VendorsPage });

function VendorsPage() {
  const { data, refetch } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => (await supabase.from("vendors").select("*").order("name")).data ?? [],
  });

  return (
    <div className="p-8">
      <PageHeader title="Vendors" description="Wholesalers and suppliers behind every shipment."
        action={<VendorDialog onDone={refetch} />} />
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Name</th><th className="p-3">Contact</th>
              <th className="p-3">Default carrier</th><th className="p-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((v: any) => (
              <tr key={v.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-medium">{v.name}</td>
                <td className="p-3 text-muted-foreground">{[v.contact_name, v.contact_email].filter(Boolean).join(" · ") || "—"}</td>
                <td className="p-3 text-muted-foreground">{v.default_carrier ?? "—"}</td>
                <td className="p-3">{v.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No vendors yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VendorDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ name: "", is_active: true });
  const submit = async () => {
    const payload = { ...f, slug: slugify(f.name) };
    const { error } = await supabase.from("vendors").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Vendor created"); setOpen(false); setF({ name: "", is_active: true }); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> New vendor</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>New vendor</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={f.name ?? ""} onChange={e=>setF({...f, name:e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Contact name</Label><Input value={f.contact_name ?? ""} onChange={e=>setF({...f, contact_name:e.target.value})} /></div>
            <div className="space-y-1.5"><Label>Contact email</Label><Input value={f.contact_email ?? ""} onChange={e=>setF({...f, contact_email:e.target.value})} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Phone</Label><Input value={f.contact_phone ?? ""} onChange={e=>setF({...f, contact_phone:e.target.value})} /></div>
            <div className="space-y-1.5"><Label>Website</Label><Input value={f.website ?? ""} onChange={e=>setF({...f, website:e.target.value})} /></div>
          </div>
          <div className="space-y-1.5"><Label>Address</Label><Textarea rows={2} value={f.address ?? ""} onChange={e=>setF({...f, address:e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Default terms</Label><Input value={f.default_terms ?? ""} onChange={e=>setF({...f, default_terms:e.target.value})} placeholder="Net 30" /></div>
            <div className="space-y-1.5"><Label>Default carrier</Label><Input value={f.default_carrier ?? ""} onChange={e=>setF({...f, default_carrier:e.target.value})} placeholder="Delta Cargo" /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes ?? ""} onChange={e=>setF({...f, notes:e.target.value})} /></div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!f.is_active} onCheckedChange={c=>setF({...f, is_active:!!c})} /> Active
          </label>
          <Button onClick={submit} disabled={!f.name} className="w-full">Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
