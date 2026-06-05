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
import {
  Plus, Pencil, ChevronRight, ChevronDown, ImagePlus, ArrowUp, ArrowDown,
  Trash2, QrCode, Star, ImageIcon, Check, X,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  slugify, STORE_LOCATION_KINDS, STORE_LOCATION_KIND_LABELS,
  STORE_LOCATION_CONTAINER_KINDS, type StoreLocationKind,
} from "@/lib/ops";

export const Route = createFileRoute("/_app/store-locations")({ component: LocationsPage });

type Loc = any;
type Media = { id: string; location_id: string; storage_path: string; public_url: string; caption: string | null; sort_order: number; is_primary: boolean };

// ===== helpers =====
function buildPath(loc: Loc, byId: Record<string, Loc>): Loc[] {
  const out: Loc[] = [];
  let cur: Loc | undefined = loc;
  while (cur) {
    out.unshift(cur);
    cur = cur.parent_location_id ? byId[cur.parent_location_id] : undefined;
  }
  return out;
}

function descendantIds(id: string, allLocations: Loc[]): Set<string> {
  const result = new Set<string>([id]);
  const children = allLocations.filter(l => l.parent_location_id === id);
  for (const c of children) for (const d of descendantIds(c.id, allLocations)) result.add(d);
  return result;
}

async function signLongLived(path: string): Promise<string> {
  // 1 year signed URL — re-signed on next upload anyway
  const { data, error } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 24 * 365);
  if (error) throw error;
  return data.signedUrl;
}

// ===== page =====
export default function LocationsPage() {
  const { data: locs, refetch: refetchLocs } = useQuery({
    queryKey: ["store-locations"],
    queryFn: async () => (await supabase.from("store_locations").select("*").order("sort_order").order("name")).data ?? [],
  });
  const { data: media, refetch: refetchMedia } = useQuery({
    queryKey: ["store-location-media"],
    queryFn: async () => (await supabase.from("store_location_media").select("*").order("sort_order")).data ?? [],
  });
  const { data: itemCounts } = useQuery({
    queryKey: ["store-location-item-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_items").select("location_id");
      const m: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) if (r.location_id) m[r.location_id] = (m[r.location_id] ?? 0) + 1;
      return m;
    },
  });

  const list: Loc[] = locs ?? [];
  const mediaList: Media[] = (media ?? []) as Media[];
  const counts = itemCounts ?? {};

  const { roots, byParent, byId, subtreeCounts } = useMemo(() => {
    const byParent: Record<string, Loc[]> = {};
    const byId: Record<string, Loc> = {};
    const roots: Loc[] = [];
    for (const l of list) {
      byId[l.id] = l;
      if (l.parent_location_id) (byParent[l.parent_location_id] ||= []).push(l);
      else roots.push(l);
    }
    const sortFn = (a: Loc, b: Loc) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
    roots.sort(sortFn);
    for (const k of Object.keys(byParent)) byParent[k].sort(sortFn);

    // Recursive subtree item counts
    const subtreeCounts: Record<string, number> = {};
    const visit = (id: string): number => {
      let total = counts[id] ?? 0;
      for (const c of byParent[id] ?? []) total += visit(c.id);
      subtreeCounts[id] = total;
      return total;
    };
    for (const r of roots) visit(r.id);
    return { roots, byParent, byId, subtreeCounts };
  }, [list, counts]);

  const mediaByLoc = useMemo(() => {
    const m: Record<string, Media[]> = {};
    for (const x of mediaList) (m[x.location_id] ||= []).push(x);
    return m;
  }, [mediaList]);

  const refetchAll = () => { refetchLocs(); refetchMedia(); };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PageHeader
        title="Store Locations"
        description="Map your store layout. Nest zones, rooms, racks, shelves, bins, tanks — anything inside anything. Add reference photos so staff can spot them on the floor."
        action={
          <div className="flex gap-2">
            <PrintLabelsButton locations={list} byId={byId} />
            <LocationDialog allLocations={list} onDone={refetchAll} />
          </div>
        }
      />

      <div className="rounded-lg border bg-card overflow-hidden">
        {roots.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No locations yet. Create your first one — e.g. a Room ("Storefront"), then nest a Freezer, then a Shelf inside that.
          </div>
        )}
        <ul className="divide-y">
          {roots.map((root, i) => (
            <LocationNode
              key={root.id}
              node={root}
              byParent={byParent}
              byId={byId}
              depth={0}
              allLocations={list}
              mediaByLoc={mediaByLoc}
              directCounts={counts}
              subtreeCounts={subtreeCounts}
              siblings={roots}
              siblingIndex={i}
              onDone={refetchAll}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

// ===== tree node =====
function LocationNode({
  node, byParent, byId, depth, allLocations, mediaByLoc, directCounts, subtreeCounts,
  siblings, siblingIndex, onDone,
}: {
  node: Loc;
  byParent: Record<string, Loc[]>;
  byId: Record<string, Loc>;
  depth: number;
  allLocations: Loc[];
  mediaByLoc: Record<string, Media[]>;
  directCounts: Record<string, number>;
  subtreeCounts: Record<string, number>;
  siblings: Loc[];
  siblingIndex: number;
  onDone: () => void;
}) {
  const children = byParent[node.id] ?? [];
  const [open, setOpen] = useState(depth < 2);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState<string>(node.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const canContain = STORE_LOCATION_CONTAINER_KINDS.includes(node.kind);

  useEffect(() => { if (editingName) inputRef.current?.focus(); }, [editingName]);
  useEffect(() => { setNameDraft(node.name); }, [node.name]);

  const path = buildPath(node, byId);
  const breadcrumb = path.slice(0, -1).map(p => p.name).join(" › ");
  const photos = mediaByLoc[node.id] ?? [];
  const primary = photos.find(p => p.is_primary) ?? photos[0];
  const direct = directCounts[node.id] ?? 0;
  const subtree = subtreeCounts[node.id] ?? 0;

  const saveName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === node.name) { setEditingName(false); setNameDraft(node.name); return; }
    const { error } = await supabase.from("store_locations").update({ name: trimmed, slug: slugify(trimmed) }).eq("id", node.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Renamed");
    setEditingName(false);
    onDone();
  };

  const move = async (dir: -1 | 1) => {
    const target = siblings[siblingIndex + dir];
    if (!target) return;
    const a = node.sort_order ?? siblingIndex;
    const b = target.sort_order ?? siblingIndex + dir;
    // simple swap; if equal, force a delta
    const newA = a === b ? b + dir : b;
    const newB = a === b ? a : a;
    const { error } = await supabase.from("store_locations").upsert([
      { ...node, sort_order: newA },
      { ...target, sort_order: newB },
    ]);
    if (error) { toast.error(error.message); return; }
    onDone();
  };

  return (
    <li>
      <div className="flex items-start gap-2 px-3 py-2 hover:bg-muted/30" style={{ paddingLeft: `${12 + depth * 18}px` }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="shrink-0 w-5 h-5 inline-flex items-center justify-center text-muted-foreground mt-1"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {children.length > 0
            ? (open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />)
            : <span className="w-4 h-4 inline-block" />}
        </button>

        {/* Thumbnail */}
        <div className="shrink-0 w-10 h-10 rounded-md bg-muted overflow-hidden flex items-center justify-center border">
          {primary
            ? <img src={primary.public_url} alt="" className="w-full h-full object-cover" />
            : <ImageIcon className="w-4 h-4 text-muted-foreground/60" />}
        </div>

        <div className="flex-1 min-w-0">
          {breadcrumb && depth > 0 && (
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 truncate">{breadcrumb}</div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {editingName ? (
              <div className="flex items-center gap-1">
                <Input
                  ref={inputRef}
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setEditingName(false); setNameDraft(node.name); } }}
                  className="h-7 text-sm w-48"
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveName}><Check className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingName(false); setNameDraft(node.name); }}><X className="w-3.5 h-3.5" /></Button>
              </div>
            ) : (
              <button
                type="button"
                onDoubleClick={() => setEditingName(true)}
                className="font-medium truncate text-left hover:underline decoration-dotted"
                title="Double-click to rename"
              >
                {node.name}
              </button>
            )}
            <Badge variant="outline" className="text-[10px]">{STORE_LOCATION_KIND_LABELS[node.kind as StoreLocationKind] ?? node.kind}</Badge>
            {node.is_live_sale && <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px]">Live-sale</Badge>}
            {!node.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
            <Badge variant="secondary" className="text-[10px]">
              {direct} item{direct === 1 ? "" : "s"}
              {subtree !== direct && <span className="opacity-60"> · {subtree} total</span>}
            </Badge>
            {photos.length > 0 && <Badge variant="outline" className="text-[10px]">{photos.length} photo{photos.length === 1 ? "" : "s"}</Badge>}
          </div>
          {node.capacity_notes && <div className="text-xs text-muted-foreground truncate">{node.capacity_notes}</div>}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={siblingIndex === 0} onClick={() => move(-1)} title="Move up"><ArrowUp className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={siblingIndex === siblings.length - 1} onClick={() => move(1)} title="Move down"><ArrowDown className="w-3.5 h-3.5" /></Button>
          <PhotoDialog location={node} photos={photos} onDone={onDone} />
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
          {children.map((c, i) => (
            <LocationNode
              key={c.id}
              node={c}
              byParent={byParent}
              byId={byId}
              depth={depth + 1}
              allLocations={allLocations}
              mediaByLoc={mediaByLoc}
              directCounts={directCounts}
              subtreeCounts={subtreeCounts}
              siblings={children}
              siblingIndex={i}
              onDone={onDone}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// ===== photo gallery dialog =====
function PhotoDialog({ location, photos, onDone }: { location: Loc; photos: Media[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const userResp = await supabase.auth.getUser();
      const uid = userResp.data.user?.id;
      let nextOrder = (photos.length > 0 ? Math.max(...photos.map(p => p.sort_order)) : -1) + 1;
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `store-locations/${location.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const signed = await signLongLived(path);
        const isFirst = photos.length === 0 && nextOrder === 0;
        const { error: insErr } = await supabase.from("store_location_media").insert({
          location_id: location.id,
          storage_path: path,
          public_url: signed,
          sort_order: nextOrder++,
          is_primary: isFirst,
          uploaded_by: uid,
        });
        if (insErr) throw insErr;
        if (isFirst) {
          await supabase.from("store_locations").update({ primary_photo_url: signed }).eq("id", location.id);
        }
      }
      toast.success("Photos uploaded");
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  };

  const setPrimary = async (m: Media) => {
    await supabase.from("store_location_media").update({ is_primary: false }).eq("location_id", location.id);
    await supabase.from("store_location_media").update({ is_primary: true }).eq("id", m.id);
    await supabase.from("store_locations").update({ primary_photo_url: m.public_url }).eq("id", location.id);
    toast.success("Primary photo set");
    onDone();
  };

  const remove = async (m: Media) => {
    await supabase.storage.from("media").remove([m.storage_path]);
    await supabase.from("store_location_media").delete().eq("id", m.id);
    if (m.is_primary) {
      const remaining = photos.filter(p => p.id !== m.id);
      const next = remaining[0];
      if (next) {
        await supabase.from("store_location_media").update({ is_primary: true }).eq("id", next.id);
        await supabase.from("store_locations").update({ primary_photo_url: next.public_url }).eq("id", location.id);
      } else {
        await supabase.from("store_locations").update({ primary_photo_url: null }).eq("id", location.id);
      }
    }
    toast.success("Photo removed");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Photos">
          <ImagePlus className="w-3.5 h-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Photos · {location.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <label className="block">
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/30 cursor-pointer">
              <ImagePlus className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
              <div className="text-sm">{uploading ? "Uploading…" : "Click to upload photos"}</div>
              <div className="text-xs text-muted-foreground">You can select multiple files</div>
            </div>
            <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={e => uploadFiles(e.target.files)} />
          </label>

          {photos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {photos.map(p => (
                <div key={p.id} className="relative group rounded-md overflow-hidden border bg-muted aspect-square">
                  <img src={p.public_url} alt={p.caption ?? ""} className="w-full h-full object-cover" />
                  {p.is_primary && (
                    <Badge className="absolute top-1 left-1 bg-yellow-100 text-yellow-800 border-0 text-[10px]">
                      <Star className="w-3 h-3 mr-0.5" /> Primary
                    </Badge>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    {!p.is_primary && (
                      <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={() => setPrimary(p)}>
                        <Star className="w-3 h-3 mr-1" /> Primary
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" className="h-7 px-2 text-xs ml-auto" onClick={() => remove(p)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===== location create/edit dialog =====
function LocationDialog({ location, allLocations, defaultParent, onDone, trigger }: {
  location?: Loc; allLocations: Loc[]; defaultParent?: string; onDone: () => void; trigger?: React.ReactNode;
}) {
  const isEdit = !!location;
  const [open, setOpen] = useState(false);
  const initial = () => isEdit
    ? { ...location }
    : { name: "", kind: defaultParent ? "shelf" : "zone", parent_location_id: defaultParent ?? null, is_active: true, is_live_sale: false };
  const [f, setF] = useState<any>(initial);

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

  const remove = async () => {
    if (!isEdit) return;
    if (!confirm(`Delete "${location.name}"? Items will be unlinked. Sub-locations become top-level.`)) return;
    const { error } = await supabase.from("store_locations").delete().eq("id", location.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Location deleted");
    setOpen(false);
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
          <div className="flex gap-2">
            <Button onClick={submit} disabled={!f.name} className="flex-1">{isEdit ? "Save changes" : "Create"}</Button>
            {isEdit && (
              <Button variant="destructive" onClick={remove} title="Delete location">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===== printable QR labels =====
function PrintLabelsButton({ locations, byId }: { locations: Loc[]; byId: Record<string, Loc> }) {
  const print = async () => {
    if (locations.length === 0) { toast.error("No locations to print"); return; }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const labels = await Promise.all(
      locations.filter(l => l.is_active).map(async l => {
        const url = `${origin}/inventory?location=${l.id}`;
        const dataUrl = await QRCode.toDataURL(url, { width: 220, margin: 1 });
        const path = buildPath(l, byId).map(p => p.name).join(" › ");
        return { name: l.name, path, kind: STORE_LOCATION_KIND_LABELS[l.kind as StoreLocationKind] ?? l.kind, dataUrl };
      })
    );
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("Pop-up blocked"); return; }
    w.document.write(`<!doctype html><html><head><title>Location labels</title>
<style>
  @page { margin: 0.4in; }
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 12px; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .label { border: 1px dashed #999; padding: 12px; display: flex; gap: 12px; align-items: center; page-break-inside: avoid; }
  .label img { width: 110px; height: 110px; }
  .meta .path { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta .name { font-size: 18px; font-weight: 600; margin-top: 2px; }
  .meta .kind { font-size: 11px; color: #555; margin-top: 4px; }
  @media print { .noprint { display: none; } }
</style></head><body>
<div class="noprint" style="margin-bottom:12px"><button onclick="window.print()">Print</button></div>
<div class="grid">
${labels.map(l => `<div class="label"><img src="${l.dataUrl}" /><div class="meta"><div class="path">${l.path.replace(` › ${l.name}`,"") || "Top level"}</div><div class="name">${l.name}</div><div class="kind">${l.kind}</div></div></div>`).join("")}
</div></body></html>`);
    w.document.close();
  };
  return <Button variant="outline" onClick={print}><QrCode className="w-4 h-4 mr-1" /> Print labels</Button>;
}
