import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { slugify, STORE_LOCATION_KINDS, STORE_LOCATION_KIND_LABELS, type StoreLocationKind } from "@/lib/ops";

export const Route = createFileRoute("/_app/store-locations")({ component: LocationsPage });

function LocationsPage() {
  const { data, refetch } = useQuery({
    queryKey: ["store-locations"],
    queryFn: async () => (await supabase.from("store_locations").select("*").order("name")).data ?? [],
  });
  return (
    <div className="p-8">
      <PageHeader title="Store Locations" description="Physical tanks, zones, coral flats, live-sale tanks, quarantine/holding, and dry-goods locations."
        action={<LocationDialog onDone={refetch} />} />
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-3">Name</th><th className="p-3">Kind</th><th className="p-3">Live sale</th><th className="p-3">Active</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((l: any) => (
              <tr key={l.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-medium">{l.name}</td>
                <td className="p-3"><Badge variant="outline">{STORE_LOCATION_KIND_LABELS[l.kind as StoreLocationKind] ?? l.kind}</Badge></td>
                <td className="p-3">{l.is_live_sale ? <Badge className="bg-blue-100 text-blue-800 border-0">Live-sale</Badge> : <span className="text-muted-foreground">—</span>}</td>
                <td className="p-3">{l.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No locations yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LocationDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ name: "", kind: "display_tank", is_active: true, is_live_sale: false });
  const submit = async () => {
    const payload = { ...f, slug: slugify(f.name) };
    const { error } = await supabase.from("store_locations").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Location created"); setOpen(false);
    setF({ name: "", kind: "display_tank", is_active: true, is_live_sale: false }); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> New location</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New store location</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={f.name ?? ""} onChange={e=>setF({...f, name:e.target.value})} placeholder="Tank 4A" /></div>
          <div className="space-y-1.5"><Label>Kind</Label>
            <Select value={f.kind} onValueChange={v=>setF({...f, kind:v, is_live_sale: v === "live_sale_tank" || f.is_live_sale})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STORE_LOCATION_KINDS.map(k => <SelectItem key={k} value={k}>{STORE_LOCATION_KIND_LABELS[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Capacity notes</Label><Input value={f.capacity_notes ?? ""} onChange={e=>setF({...f, capacity_notes:e.target.value})} placeholder="40 gal, 8 corals" /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes ?? ""} onChange={e=>setF({...f, notes:e.target.value})} /></div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!f.is_live_sale} onCheckedChange={c=>setF({...f, is_live_sale:!!c})} /> Used for live sales
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!f.is_active} onCheckedChange={c=>setF({...f, is_active:!!c})} /> Active
          </label>
          <Button onClick={submit} disabled={!f.name} className="w-full">Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
