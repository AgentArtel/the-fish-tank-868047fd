import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logInventorySale, setColonyGone, updateInventoryAttrs } from "@/lib/ops.functions";
import { fmtMoney } from "@/lib/ops";
import { DollarSign, Loader2 } from "lucide-react";

// Phase 1a — per-item sale tracking. Corals carry a stock mode (frag = counted &
// decremented; colony = open-ended, log frag-off events until "gone"). Sales write
// to inventory_sale_events via logInventorySale; the colony-gone toggle flips to
// sold_out. (inventory_sale_events cast `as any` until generated types catch up.)
export function SalesCard({ item, onDone }: { item: any; onDone: () => void }) {
  const qc = useQueryClient();
  const logSaleFn = useServerFn(logInventorySale);
  const setColonyGoneFn = useServerFn(setColonyGone);
  const updateAttrsFn = useServerFn(updateInventoryAttrs);

  const isCoral = item.item_type === "coral";
  const attrs = item.attrs ?? {};
  const stockMode: string = attrs.stock_mode ?? "frag";
  const priceMode: string = attrs.price_mode ?? "per_head";
  const isColony = isCoral && stockMode === "colony";

  const { data: sales } = useQuery({
    queryKey: ["inventory-sales", item.id],
    queryFn: async () =>
      (
        await (supabase as any)
          .from("inventory_sale_events")
          .select("id, qty, unit_price_cents, total_cents, sold_at, source, kind, status, clover_item_name")
          .eq("inventory_item_id", item.id)
          .order("sold_at", { ascending: false })
          .limit(50)
      ).data ?? [],
  });
  const saleRows = (sales ?? []).filter((s: any) => s.kind === "sale");
  const totalSold = saleRows.reduce((n: number, s: any) => n + Number(s.qty), 0);
  const totalRevCents = saleRows.reduce(
    (n: number, s: any) => n + (s.total_cents ?? 0),
    0,
  );

  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState(item.retail_price != null ? String(item.retail_price) : "");
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["inventory-sales", item.id] });
    onDone();
  };

  const setMode = async (key: "stock_mode" | "price_mode", v: string) => {
    try {
      await updateAttrsFn({ data: { id: item.id, attrs: { ...attrs, [key]: v } } });
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update");
    }
  };

  const logSale = async () => {
    const q = Number(qty);
    const p = Number(price);
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Enter how many heads/frags sold");
      return;
    }
    setSaving(true);
    try {
      await logSaleFn({
        data: {
          inventoryItemId: item.id,
          qty: q,
          unitPriceCents: Number.isFinite(p) && p > 0 ? Math.round(p * 100) : undefined,
        },
      });
      toast.success(`Logged sale of ${q}`);
      setQty("1");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to log sale");
    } finally {
      setSaving(false);
    }
  };

  const toggleColonyGone = async (gone: boolean) => {
    try {
      await setColonyGoneFn({ data: { id: item.id, gone } });
      toast.success(gone ? "Colony marked gone (sold out)" : "Colony restored");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Sales tracking</h3>
        <div className="text-xs text-muted-foreground">
          {totalSold} sold{totalRevCents > 0 ? ` · ${fmtMoney(totalRevCents / 100)}` : ""}
        </div>
      </div>

      {isCoral && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Stock mode</Label>
            <Select value={stockMode} onValueChange={(v) => setMode("stock_mode", v)}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="frag">Frags (counted)</SelectItem>
                <SelectItem value="colony">Colony (open-ended)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Price mode</Label>
            <Select value={priceMode} onValueChange={(v) => setMode("price_mode", v)}>
              <SelectTrigger className="h-8 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="per_head">Per head</SelectItem>
                <SelectItem value="fixed">Fixed price</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isColony && (
            <div className="flex items-center gap-2 pb-1.5">
              <Switch checked={!!item.colony_gone} onCheckedChange={toggleColonyGone} />
              <span className="text-xs text-muted-foreground">Colony gone</span>
            </div>
          )}
        </div>
      )}

      {!isColony && (
        <div className="text-xs text-muted-foreground">
          {Number(item.quantity_available ?? 0)} available{isCoral ? " frag(s)" : ""}
        </div>
      )}

      <div className="flex items-end gap-2 border-t pt-3">
        <div className="space-y-1">
          <Label className="text-xs">{isColony ? "Heads/frags sold" : "Qty sold"}</Label>
          <Input
            type="number"
            min="1"
            step="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="h-8 w-24"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Unit price ($)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-8 w-28"
            placeholder="optional"
          />
        </div>
        <Button size="sm" className="h-8" onClick={logSale} disabled={saving}>
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <DollarSign className="w-4 h-4 mr-1" />
          )}
          Log sale
        </Button>
      </div>

      {saleRows.length === 0 && (sales ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">No sales logged yet.</p>
      ) : (
        <div className="space-y-0.5 max-h-48 overflow-y-auto text-xs">
          {(sales ?? []).map((s: any) => (
            <div key={s.id} className="flex items-center justify-between border-b py-1">
              <span>
                {new Date(s.sold_at).toLocaleDateString()} · {s.qty}
                {s.kind !== "sale" ? ` ${s.kind}` : ""}
                {s.source === "clover" ? " · Clover" : ""}
              </span>
              <span className="text-muted-foreground">
                {s.total_cents != null ? fmtMoney(s.total_cents / 100) : ""}
                {s.status === "needs_review" ? " · review" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
