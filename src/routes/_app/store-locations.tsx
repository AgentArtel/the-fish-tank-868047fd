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
import { Plus, Pencil } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { slugify, STORE_LOCATION_KINDS, STORE_LOCATION_KIND_LABELS, type StoreLocationKind } from "@/lib/ops";

export const Route = createFileRoute("/_app/store-locations")({ component: LocationsPage });

function LocationsPage() {
  const { data, refetch } = useQuery({
    queryKey: ["store-locations"],
    queryFn: async () => (await supabase.from("store_locations").select("*").order("name")).data ?? [],
  });

  const { zones, byParent } = useMemo(() => {
    const list: any[] = data ?? [];
    const zones = list.filter(l => l.kind === "zone");
    const byParent: Record<string, any[]> = {};
    for (const l of list) {
      if (l.kind === "zone") continue;
      const key = l.parent_location_id ?? "_none";
      (byParent[key] ||= []).push(l);
    }
    return { zones, byParent };
  }, [data]);

  return (
    <div className="p-8 space-y-6">
      <PageHeader
        title="Store Locations"
        description="Group physical space into zones (rooms, racks, systems), then add tanks and other locations inside each zone."
        action={<LocationDialog zones={zones} onDone={refetch} />}
      />

      {zones.map(z => (
        <ZoneCard key={z.id} zone={z} children={byParent[z.id] ?? []} zones={zones} onDone={refetch} />
      ))}

      <ZoneCard key="_none" zone={null} children={byParent["_none"] ?? []} zones={zones} onDone={refetch} />

      {!data?.length && (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
          No locations yet. Start by creating a zone (e.g. "Front coral system"), then add tanks inside it.
        </div>
      )}
    </div>
  );
}

function ZoneCard({ zone, children, zones, onDone }: { zone: any | null; children: any[]; zones: any[]; onDone: () => void }) {
  if (!zone && children.length === 0) return null;
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
        <div>
          <div className="font-semibold">{zone ? zone.name : "Unassigned (no zone)"}</div>
          {zone?.capacity_notes && <div className="text-xs text-muted-foreground">{zone.capacity_notes}</div>}
        </div>
        <div className="flex items-center gap-2">
          {zone && <LocationDialog location={zone} zones={zones} onDone={onDone} />}
          {zone && <LocationDialog zones={zones} defaultParent={zone.id} onDone={onDone} />}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/20 text-left">
          <tr><th className="p-3">Name</th><th className="p-3">Kind</th><th className="p-3">Live sale</th><th className="p-3">Active</th><th className="p-3 w-24">Edit</th></tr>
        </thead>
        <tbody>
          {children.map((l: any) => (
            <tr key={l.id} className="border-t hover:bg-muted/30">
              <td className="p-3 font-medium">{l.name}</td>
              <td className="p-3"><Badge variant="outline">{STORE_LOCATION_KIND_LABELS[l.kind as StoreLocationKind] ?? l.kind}</Badge></td>
              <td className="p-3">{l.is_live_sale ? <Badge className="bg-blue-100 text-blue-800 border-0">Live-sale</Badge> : <span className="text-muted-foreground">—</span>}</td>
              <td className="p-3">{l.is_active ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</td>
              <td className="p-3"><LocationDialog location={l} zones={zones} onDone={onDone} /></td>
            </tr>
          ))}
          {children.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">No tanks in this zone yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function LocationDialog({ location, zones, defaultParent, onDone }: { location?: any; zones: any[]; defaultParent?: string; onDone: () => void }) {
  const isEdit = !!location;
  const [open, setOpen] = useState(false);
  const initial = () => isEdit
    ? { ...location }
    : { name: "", kind: defaultParent ? "display_tank" : "zone", parent_location_id: defaultParent ?? null, is_active: true, is_live_sale: false };
  const [f, setF] = useState<any>(initial);

  const submit = async () => {
    const payload: any = { ...f, slug: slugify(f.name) };
    if (payload.kind === "zone") payload.parent_location_id = null;
    delete payload.id; delete payload.created_at; delete payload.updated_at;

    if (isEdit) {
      const { error } = await supabase.from("store_locations").update(payload).eq("id", location.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Location updated");
    } else {
      const { error } = await supabase.from("store_locations").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Location created");
    }
    setOpen(false);
    if (!isEdit) setF(initial());
    onDone();
  };

  const triggerLabel = isEdit
    ? <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="w-4 h-4" /></Button>
    : defaultParent
      ? <Button size="sm" variant="outline"><Plus className="w-3 h-3 mr-1" /> Add tank</Button>
      : <Button><Plus className="w-4 h-4 mr-1" /> New zone or tank</Button>;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v && !isEdit) setF(initial()); }}>
      <DialogTrigger asChild>{triggerLabel}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "Edit location" : "New location"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={f.name ?? ""} onChange={e=>setF({...f, name:e.target.value})} placeholder={f.kind === "zone" ? "Front coral system" : "Tank 4A"} /></div>
          <div className="space-y-1.5"><Label>Kind</Label>
            <Select value={f.kind} onValueChange={v=>setF({...f, kind:v, is_live_sale: v === "live_sale_tank" || f.is_live_sale, parent_location_id: v === "zone" ? null : f.parent_location_id})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STORE_LOCATION_KINDS.map(k => <SelectItem key={k} value={k}>{STORE_LOCATION_KIND_LABELS[k]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {f.kind !== "zone" && (
            <div className="space-y-1.5"><Label>Zone (optional)</Label>
              <Select value={f.parent_location_id ?? "_none"} onValueChange={v=>setF({...f, parent_location_id: v === "_none" ? null : v})}>
                <SelectTrigger><SelectValue placeholder="No zone" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No zone</SelectItem>
                  {zones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label>Capacity notes</Label><Input value={f.capacity_notes ?? ""} onChange={e=>setF({...f, capacity_notes:e.target.value})} placeholder="40 gal, 8 corals" /></div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes ?? ""} onChange={e=>setF({...f, notes:e.target.value})} /></div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!f.is_live_sale} onCheckedChange={c=>setF({...f, is_live_sale:!!c})} /> Used for live sales
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!f.is_active} onCheckedChange={c=>setF({...f, is_active:!!c})} /> Active
          </label>
          <Button onClick={submit} disabled={!f.name} className="w-full">{isEdit ? "Save changes" : "Create"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
