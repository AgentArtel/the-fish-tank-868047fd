import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { OpsBadge, availabilityTone, liveSaleTone, pricingTone } from "@/components/ops-badge";
import {
  INVENTORY_AVAILABILITY, INVENTORY_AVAILABILITY_LABELS,
  INVENTORY_LIVE_SALE, INVENTORY_LIVE_SALE_LABELS,
  INVENTORY_PRICING_LABELS,
  fmtMoney,
} from "@/lib/ops";
import { setInventoryAvailability, setInventoryLiveSale } from "@/lib/ops.functions";
import { PhotoOnFileWizard, inventoryHasPhoto } from "@/components/photo-on-file-wizard";
import { QuickAddButton } from "@/components/quick-add-fab";
import { Button } from "@/components/ui/button";
import { PackagePlus } from "lucide-react";

export const Route = createFileRoute("/_app/inventory/")({ component: InventoryPage });

function InventoryPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["inventory", q, statusFilter],
    queryFn: async () => {
      let query = supabase.from("inventory_items")
        .select("*, store_locations(name,is_live_sale), vendors(name)")
        .order("updated_at",{ascending:false}).limit(500);
      if (statusFilter !== "all") query = query.eq("availability_status", statusFilter as any);
      if (q) query = query.ilike("item_name", `%${q}%`);
      return (await query).data ?? [];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["inventory"] });

  return (
    <div className="p-8">
      <PageHeader title="Inventory" description="Store inventory created from approved vendor line items." />
      <div className="flex gap-2 mb-4 items-center">
        <Input placeholder="Search item name…" value={q} onChange={e=>setQ(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="max-w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All availability</SelectItem>
            {INVENTORY_AVAILABILITY.map(s => <SelectItem key={s} value={s}>{INVENTORY_AVAILABILITY_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <QuickAddButton size="sm">Quick Add</QuickAddButton>
        </div>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Item</th><th className="p-3">Vendor</th>
              <th className="p-3">Qty</th><th className="p-3">Retail</th>
              <th className="p-3">Pricing</th><th className="p-3">Location</th>
              <th className="p-3">Availability</th><th className="p-3">Live sale</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((i: any) => <InventoryRow key={i.id} item={i} onDone={refresh} />)}
            {data?.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10">
                  <div className="flex flex-col items-center text-center gap-3">
                    <PackagePlus className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <div className="font-medium">No inventory yet</div>
                      <div className="text-sm text-muted-foreground max-w-md">
                        Add items as you restock with Quick Add, or convert a vendor batch for a full intake run.
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <QuickAddButton size="sm">Quick add an item</QuickAddButton>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/batches">Open vendor batches</Link>
                      </Button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryRow({ item, onDone }: { item: any; onDone: () => void }) {
  const setAvail = useServerFn(setInventoryAvailability);
  const setLive = useServerFn(setInventoryLiveSale);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pendingAvail, setPendingAvail] = useState<string | null>(null);

  const { data: locations } = useQuery({
    queryKey: ["all-locations"],
    queryFn: async () => (await supabase.from("store_locations").select("id,name,is_live_sale").eq("is_active",true).order("name")).data ?? [],
    staleTime: 60_000,
  });

  const setLocation = async (locationId: string) => {
    const { error } = await supabase.from("inventory_items").update({ location_id: locationId === "none" ? null : locationId }).eq("id", item.id);
    if (error) toast.error(error.message); else onDone();
  };
  const applyAvail = async (s: string) => {
    try { await setAvail({ data: { id: item.id, status: s as any } }); onDone(); }
    catch (e: any) { toast.error(e.message); }
  };
  const changeAvail = async (s: string) => {
    if (s === "available") {
      const hasPhoto = await inventoryHasPhoto(item.id);
      if (!hasPhoto) { setPendingAvail(s); setWizardOpen(true); return; }
    }
    applyAvail(s);
  };
  const changeLive = async (s: string) => {
    try { await setLive({ data: { id: item.id, status: s as any } }); onDone(); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="p-3">
        <Link to="/inventory/$id" params={{ id: item.id }} className="font-medium hover:underline">{item.item_name}</Link>
        {item.scientific_name && <div className="text-xs italic text-muted-foreground">{item.scientific_name}</div>}
        {item.size && <div className="text-xs text-muted-foreground">{item.size}</div>}
      </td>
      <td className="p-3 text-muted-foreground">{item.vendors?.name ?? "—"}</td>
      <td className="p-3 text-xs">
        <div>Avail: <span className="font-medium">{item.quantity_available}</span></div>
        <div className="text-muted-foreground">Recv {item.quantity_received} · Hold {item.quantity_on_hold} · Sold {item.quantity_sold} · Lost {item.quantity_lost}</div>
      </td>
      <td className="p-3">{fmtMoney(item.retail_price)}</td>
      <td className="p-3"><OpsBadge label={INVENTORY_PRICING_LABELS[item.pricing_status as keyof typeof INVENTORY_PRICING_LABELS]} tone={pricingTone(item.pricing_status)} /></td>
      <td className="p-3">
        <Select value={item.location_id ?? "none"} onValueChange={setLocation}>
          <SelectTrigger className="h-7 text-xs w-[150px]"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {(locations ?? []).map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}{l.is_live_sale ? " ★" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="p-3">
        <Select value={item.availability_status} onValueChange={changeAvail}>
          <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>{INVENTORY_AVAILABILITY.map(s => <SelectItem key={s} value={s}>{INVENTORY_AVAILABILITY_LABELS[s]}</SelectItem>)}</SelectContent>
        </Select>
        <div className="mt-1"><OpsBadge label={INVENTORY_AVAILABILITY_LABELS[item.availability_status as keyof typeof INVENTORY_AVAILABILITY_LABELS]} tone={availabilityTone(item.availability_status)} /></div>
      </td>
      <td className="p-3">
        <Select value={item.live_sale_status} onValueChange={changeLive}>
          <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>{INVENTORY_LIVE_SALE.map(s => <SelectItem key={s} value={s}>{INVENTORY_LIVE_SALE_LABELS[s]}</SelectItem>)}</SelectContent>
        </Select>
        <div className="mt-1"><OpsBadge label={INVENTORY_LIVE_SALE_LABELS[item.live_sale_status as keyof typeof INVENTORY_LIVE_SALE_LABELS]} tone={liveSaleTone(item.live_sale_status)} /></div>
      </td>
    </tr>
  );
}
