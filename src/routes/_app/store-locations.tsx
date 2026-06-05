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
import { Plus, Pencil, ChevronRight, ChevronDown } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  slugify, STORE_LOCATION_KINDS, STORE_LOCATION_KIND_LABELS,
  STORE_LOCATION_CONTAINER_KINDS, type StoreLocationKind,
} from "@/lib/ops";

export const Route = createFileRoute("/_app/store-locations")({ component: LocationsPage });

type Loc = any;

export default function LocationsPage() {
  const { data, refetch } = useQuery({
    queryKey: ["store-locations"],
    queryFn: async () => (await supabase.from("store_locations").select("*").order("name")).data ?? [],
  });

  const list: Loc[] = data ?? [];

  const { roots, byParent } = useMemo(() => {
    const byParent: Record<string, Loc[]> = {};
    const roots: Loc[] = [];
    for (const l of list) {
      if (l.parent_location_id) (byParent[l.parent_location_id] ||= []).push(l);
      else roots.push(l);
    }
    return { roots, byParent };
  }, [list]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader
        title="Store Locations"
        description="Build out your store layout. Group anything inside anything — a room can hold racks, racks hold shelves, shelves hold bins or tanks. Add what fits your store."
        action={<LocationDialog allLocations={list} onDone={refetch} />}
      />

      <div className="rounded-lg border bg-card overflow-hidden">
        {roots.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No locations yet. Create your first one — e.g. a Room ("Storefront"), then nest a Freezer, then a Shelf inside that.
          </div>
        )}
        <ul className="divide-y">
          {roots.map(root => (
            <LocationNode key={root.id} node={root} byParent={byParent} depth={0} allLocations={list} onDone={refetch} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function LocationNode({ node, byParent, depth, allLocations, onDone }: {
  node: Loc; byParent: Record<string, Loc[]>; depth: number; allLocations: Loc[]; onDone: () => void;
}) {
  const children = byParent[node.id] ?? [];
  const [open, setOpen] = useState(depth < 2);
  const canContain = STORE_LOCATION_CONTAINER_KINDS.includes(node.kind);

  return (
    <li>
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30"
        style={{ paddingLeft: `${12 + depth * 18}px` }}
      >
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="shrink-0 w-5 h-5 inline-flex items-center justify-center text-muted-foreground"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {children.length > 0
            ? (open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)
            : <span className="w-4 h-4 inline-block" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{node.name}</span>
            <Badge variant="outline" className="text-[10px]">{STORE_LOCATION_KIND_LABELS[node.kind as StoreLocationKind] ?? node.kind}</Badge>
            {node.is_live_sale && <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px]">Live-sale</Badge>}
            {!node.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
          </div>
          {node.capacity_notes && <div className="text-xs text-muted-foreground truncate">{node.capacity_notes}</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {canContain && (
            <LocationDialog
              allLocations={allLocations}
              defaultParent={node.id}
              onDone={onDone}
              trigger={<Button size="sm" variant="outline" className="h-7 px-2 text-xs"><Plus className="w-3 h-3 mr-1" />Inside</Button>}
            />
          )}
          <LocationDialog
            location={node}
            allLocations={allLocations}
            onDone={onDone}
            trigger={<Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="w-3.5 h-3.5" /></Button>}
          />
        </div>
      </div>
      {open && children.length > 0 && (
        <ul className="border-t">
          {children.map(c => (
            <LocationNode key={c.id} node={c} byParent={byParent} depth={depth + 1} allLocations={allLocations} onDone={onDone} />
          ))}
        </ul>
      )}
    </li>
  );
}

function descendantIds(id: string, allLocations: Loc[]): Set<string> {
  const result = new Set<string>([id]);
  const children = allLocations.filter(l => l.parent_location_id === id);
  for (const c of children) for (const d of descendantIds(c.id, allLocations)) result.add(d);
  return result;
}

function LocationDialog({ location, allLocations, defaultParent, onDone, trigger }: {
  location?: Loc; allLocations: Loc[]; defaultParent?: string; onDone: () => void; trigger?: React.ReactNode;
}) {
  const isEdit = !!location;
  const [open, setOpen] = useState(false);
  const initial = () => isEdit
    ? { ...location }
    : { name: "", kind: defaultParent ? "shelf" : "zone", parent_location_id: defaultParent ?? null, is_active: true, is_live_sale: false };
  const [f, setF] = useState<any>(initial);

  // Parents available: any container kind, excluding self and own descendants when editing.
  const blocked = isEdit ? descendantIds(location.id, allLocations) : new Set<string>();
  const parentOptions = allLocations.filter(l =>
    STORE_LOCATION_CONTAINER_KINDS.includes(l.kind) && !blocked.has(l.id)
  );

  const submit = async () => {
    const payload: any = { ...f, slug: slugify(f.name) };
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

  const defaultTrigger = isEdit
    ? <Button variant="ghost" size="icon" className="h-8 w-8"><Pencil className="w-4 h-4" /></Button>
    : <Button><Plus className="w-4 h-4 mr-1" /> Add location</Button>;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) setF(initial()); }}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? "Edit location" : "New location"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={f.name ?? ""}
              onChange={e=>setF({...f, name:e.target.value})}
              placeholder={f.kind === "zone" ? "Storefront" : f.kind === "freezer" ? "Front freezer" : "Shelf 3"}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select
              value={f.kind}
              onValueChange={v=>setF({
                ...f,
                kind:v,
                is_live_sale: v === "live_sale_tank" ? true : f.is_live_sale,
              })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STORE_LOCATION_KINDS.map(k => (
                  <SelectItem key={k} value={k}>{STORE_LOCATION_KIND_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Inside (parent)</Label>
            <Select
              value={f.parent_location_id ?? "_none"}
              onValueChange={v=>setF({...f, parent_location_id: v === "_none" ? null : v})}
            >
              <SelectTrigger><SelectValue placeholder="Top level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Top level (no parent)</SelectItem>
                {parentOptions.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {STORE_LOCATION_KIND_LABELS[p.kind as StoreLocationKind] ?? p.kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Pick anything that can contain other locations — rooms, racks, shelves, freezers, coolers, or zones.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Capacity / size notes</Label>
            <Input value={f.capacity_notes ?? ""} onChange={e=>setF({...f, capacity_notes:e.target.value})} placeholder="40 gal · 6 slots · etc." />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={f.notes ?? ""} onChange={e=>setF({...f, notes:e.target.value})} />
          </div>
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
