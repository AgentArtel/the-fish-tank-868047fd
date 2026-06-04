import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Upload, Trash2, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OpsBadge, availabilityTone, liveSaleTone, pricingTone } from "@/components/ops-badge";
import {
  INVENTORY_AVAILABILITY, INVENTORY_AVAILABILITY_LABELS,
  INVENTORY_LIVE_SALE, INVENTORY_LIVE_SALE_LABELS,
  INVENTORY_PRICING_LABELS,
  INVENTORY_MEDIA_TAGS, type InventoryMediaTag,
  type InventoryAvailability, type InventoryLiveSale,
  fmtMoney,
} from "@/lib/ops";
import {
  setInventoryAvailability, setInventoryLiveSale,
  adjustInventoryQuantities, getSignedInventoryMediaUrl,
} from "@/lib/ops.functions";

export const Route = createFileRoute("/_app/inventory/$id")({ component: InventoryDetail });

function InventoryDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: item } = useQuery({
    queryKey: ["inventory", id],
    queryFn: async () => (await supabase.from("inventory_items")
      .select("*, vendors(id,name), store_locations(id,name,is_live_sale), vendor_batches(id,invoice_number)")
      .eq("id", id).maybeSingle()).data,
  });
  const { data: locations } = useQuery({
    queryKey: ["all-locations"],
    queryFn: async () => (await supabase.from("store_locations").select("id,name,is_live_sale").eq("is_active",true).order("name")).data ?? [],
    staleTime: 60_000,
  });
  const { data: logs } = useQuery({
    queryKey: ["inventory-logs", id],
    queryFn: async () => (await supabase.from("inventory_activity_logs")
      .select("*").eq("inventory_item_id", id).order("created_at",{ascending:false}).limit(50)).data ?? [],
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["inventory", id] });
    qc.invalidateQueries({ queryKey: ["inventory-logs", id] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  if (!item) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-8 space-y-6">
      <button onClick={() => nav({ to: "/inventory" })} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to inventory
      </button>
      <PageHeader
        title={item.item_name}
        description={[item.scientific_name, item.category, item.size].filter(Boolean).join(" · ") || "Inventory item"}
      />

      <MissingPhotoBanner inventoryItemId={id} availability={item.availability_status} />


      <div className="grid md:grid-cols-2 gap-6">
        <DetailsCard item={item} />
        <ControlsCard item={item} locations={locations ?? []} onDone={refresh} />
      </div>

      <QuantitiesCard item={item} onDone={refresh} />
      <NotesCard item={item} onDone={refresh} />
      <MediaSection inventoryItemId={id} />
      <ActivityLog logs={logs ?? []} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b last:border-b-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{children}</span>
    </div>
  );
}

function DetailsCard({ item }: { item: any }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="font-semibold mb-3">Details</h2>
      <Row label="Item name">{item.item_name}</Row>
      <Row label="Scientific name">{item.scientific_name ?? "—"}</Row>
      <Row label="Category">{item.category ?? "—"}</Row>
      <Row label="Subcategory">{item.subcategory ?? "—"}</Row>
      <Row label="Origin / region">{item.origin_region ?? "—"}</Row>
      <Row label="Size">{item.size ?? "—"}</Row>
      <Row label="Vendor">{item.vendors?.name ?? "—"}</Row>
      <Row label="Source batch">{item.vendor_batches?.invoice_number ?? item.source_vendor_batch_id ?? "—"}</Row>
      <Row label="Source line">{item.source_vendor_line_item_id ?? "—"}</Row>
      <Row label="Wholesale cost">{fmtMoney(item.wholesale_cost)}</Row>
      <Row label="Retail price">{fmtMoney(item.retail_price)}</Row>
      <Row label="Pricing"><OpsBadge label={INVENTORY_PRICING_LABELS[item.pricing_status as keyof typeof INVENTORY_PRICING_LABELS]} tone={pricingTone(item.pricing_status)} /></Row>
      <Row label="Created">{new Date(item.created_at).toLocaleString()}</Row>
      <Row label="Updated">{new Date(item.updated_at).toLocaleString()}</Row>
    </div>
  );
}

function ControlsCard({ item, locations, onDone }: { item: any; locations: any[]; onDone: () => void }) {
  const setAvail = useServerFn(setInventoryAvailability);
  const setLive = useServerFn(setInventoryLiveSale);

  const changeLocation = async (locationId: string) => {
    const { error } = await supabase.from("inventory_items")
      .update({ location_id: locationId === "none" ? null : locationId }).eq("id", item.id);
    if (error) toast.error(error.message); else { toast.success("Location updated"); onDone(); }
  };
  const changeAvail = async (s: string) => {
    try { await setAvail({ data: { id: item.id, status: s as InventoryAvailability } }); toast.success("Availability updated"); onDone(); }
    catch (e: any) { toast.error(e.message); }
  };
  const changeLive = async (s: string) => {
    try { await setLive({ data: { id: item.id, status: s as InventoryLiveSale } }); toast.success("Live-sale updated"); onDone(); }
    catch (e: any) { toast.error(e.message); }
  };

  const liveSaleLocations = locations.filter(l => l.is_live_sale);

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <h2 className="font-semibold">Status &amp; placement</h2>
      <div className="space-y-1.5">
        <Label className="text-xs">Location</Label>
        <Select value={item.location_id ?? "none"} onValueChange={changeLocation}>
          <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}{l.is_live_sale ? " ★ live-sale" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
        {liveSaleLocations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {liveSaleLocations.map(l => (
              <Button key={l.id} size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => changeLocation(l.id)}>
                Assign {l.name}
              </Button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Live-sale staged/live requires a live-sale location.</p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Availability</Label>
        <Select value={item.availability_status} onValueChange={changeAvail}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{INVENTORY_AVAILABILITY.map(s => <SelectItem key={s} value={s}>{INVENTORY_AVAILABILITY_LABELS[s]}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeAvail("available")}>Mark available</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeAvail("on_hold")}>Set on hold</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeAvail("incoming")}>Set incoming</Button>
        </div>
        <div><OpsBadge label={INVENTORY_AVAILABILITY_LABELS[item.availability_status as keyof typeof INVENTORY_AVAILABILITY_LABELS]} tone={availabilityTone(item.availability_status)} /></div>
        <p className="text-xs text-muted-foreground">Available requires approved price, location, and quantity &gt; 0.</p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Live sale</Label>
        <Select value={item.live_sale_status} onValueChange={changeLive}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{INVENTORY_LIVE_SALE.map(s => <SelectItem key={s} value={s}>{INVENTORY_LIVE_SALE_LABELS[s]}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex flex-wrap gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeLive("eligible")}>Mark eligible</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeLive("staged")}>Stage for live sale</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeLive("live")}>Go live</Button>
        </div>
        <div><OpsBadge label={INVENTORY_LIVE_SALE_LABELS[item.live_sale_status as keyof typeof INVENTORY_LIVE_SALE_LABELS]} tone={liveSaleTone(item.live_sale_status)} /></div>
      </div>
    </div>
  );
}


function QuantitiesCard({ item, onDone }: { item: any; onDone: () => void }) {
  const adjust = useServerFn(adjustInventoryQuantities);
  const [f, setF] = useState({
    quantity_received: Number(item.quantity_received ?? 0),
    quantity_available: Number(item.quantity_available ?? 0),
    quantity_on_hold: Number(item.quantity_on_hold ?? 0),
    quantity_sold: Number(item.quantity_sold ?? 0),
    quantity_lost: Number(item.quantity_lost ?? 0),
  });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await adjust({ data: { id: item.id, ...f } }); toast.success("Quantities updated"); onDone(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h2 className="font-semibold">Quantities</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {(["quantity_received","quantity_available","quantity_on_hold","quantity_sold","quantity_lost"] as const).map(k => (
          <div key={k} className="space-y-1.5">
            <Label className="text-xs capitalize">{k.replace("quantity_","")}</Label>
            <Input type="number" step="0.01" value={f[k]} onChange={e=>setF({...f,[k]:Number(e.target.value || 0)})} />
          </div>
        ))}
      </div>
      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save quantities"}</Button>
    </div>
  );
}

function NotesCard({ item, onDone }: { item: any; onDone: () => void }) {
  const [notes, setNotes] = useState<string>(item.notes ?? "");
  const [websiteReady, setWebsiteReady] = useState<boolean>(!!item.website_ready_later);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("inventory_items")
      .update({ notes, website_ready_later: websiteReady }).eq("id", item.id);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Saved"); onDone(); }
  };
  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <h2 className="font-semibold">Notes &amp; flags</h2>
      <Textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Internal notes…" />
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={websiteReady} onCheckedChange={c=>setWebsiteReady(!!c)} /> Website ready (future)
      </label>
      <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save notes"}</Button>
    </div>
  );
}

function MediaSection({ inventoryItemId }: { inventoryItemId: string }) {
  const qc = useQueryClient();
  const [tag, setTag] = useState<InventoryMediaTag>("internal");
  const [busy, setBusy] = useState(false);
  const getUrl = useServerFn(getSignedInventoryMediaUrl);

  const { data: media } = useQuery({
    queryKey: ["inventory-media", inventoryItemId],
    queryFn: async () => (await supabase.from("inventory_media")
      .select("*").eq("inventory_item_id", inventoryItemId)
      .order("created_at",{ascending:false})).data ?? [],
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["inventory-media", inventoryItemId] });

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uploaderId = userRes.user?.id ?? null;
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${inventoryItemId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("inventory-media").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) throw upErr;
      const mediaType = file.type.startsWith("video/") ? "video" : "image";
      const { error: insErr } = await supabase.from("inventory_media").insert({
        inventory_item_id: inventoryItemId,
        storage_path: path, file_name: file.name,
        media_type: mediaType, tag, uploader_id: uploaderId,
      });
      if (insErr) throw insErr;
      // Clear needs_photo on first upload of any image
      if (mediaType === "image") {
        await supabase.from("inventory_items").update({ needs_photo: false }).eq("id", inventoryItemId);
      }
      toast.success("Uploaded"); refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const open = async (m: any) => {
    try { const { url } = await getUrl({ data: { path: m.storage_path } }); window.open(url, "_blank"); }
    catch (e: any) { toast.error(e.message); }
  };
  const remove = async (m: any) => {
    if (!confirm("Delete this media item?")) return;
    await supabase.storage.from("inventory-media").remove([m.storage_path]);
    const { error } = await supabase.from("inventory_media").delete().eq("id", m.id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); refresh(); }
  };
  const updateTag = async (m: any, newTag: string) => {
    const { error } = await supabase.from("inventory_media")
      .update({ tag: newTag as InventoryMediaTag }).eq("id", m.id);
    if (error) toast.error(error.message); else refresh();
  };

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold">Media</h2>
        <div className="flex items-center gap-2">
          <Select value={tag} onValueChange={v=>setTag(v as InventoryMediaTag)}>
            <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{INVENTORY_MEDIA_TAGS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <label className="cursor-pointer">
            <input type="file" accept="image/*,video/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value=""; }} />
            <Button asChild disabled={busy}>
              <span><Upload className="w-4 h-4 mr-1" /> {busy ? "Uploading…" : "Upload"}</span>
            </Button>
          </label>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Stored privately in the inventory-media bucket. Not connected to the social Media Library.
      </p>
      {media && media.length > 0 ? (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {media.map(m => (
            <div key={m.id} className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-medium truncate">{m.file_name}</div>
              <div className="text-xs text-muted-foreground">{m.media_type} · {new Date(m.created_at).toLocaleDateString()}</div>
              <Select value={m.tag} onValueChange={v => updateTag(m, v)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{INVENTORY_MEDIA_TAGS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={()=>open(m)}>Open</Button>
                <Button size="sm" variant="ghost" onClick={()=>remove(m)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No media yet.</p>
      )}
    </div>
  );
}

function ActivityLog({ logs }: { logs: any[] }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <h2 className="font-semibold mb-3">Activity</h2>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {logs.map(l => (
            <li key={l.id} className="flex justify-between gap-3 border-b last:border-b-0 pb-2">
              <span>{l.summary ?? l.action}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
