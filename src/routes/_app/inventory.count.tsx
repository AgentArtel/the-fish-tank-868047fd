import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ITEM_TYPES, ITEM_TYPE_LABELS, fmtMoney, type ItemType } from "@/lib/ops";
import { getCountCategories, getCountDeck, recordItemCount } from "@/lib/count.functions";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  ClipboardList,
  MapPin,
  Camera,
  PartyPopper,
} from "lucide-react";

export const Route = createFileRoute("/_app/inventory/count")({ component: CountPage });

function CountPage() {
  const [category, setCategory] = useState<string | null>(null);

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <PageHeader
        title="Stock count"
        description="Set the true baseline for the imported catalog, one item at a time. Pick a category, then place each item: type, quantity, location, price. Once it has a location it drops off the list."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/inventory">
              View stock <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        }
      />
      {category ? (
        <CountDeck category={category} onExit={() => setCategory(null)} />
      ) : (
        <CategoryPicker onPick={setCategory} />
      )}
    </div>
  );
}

function CategoryPicker({ onPick }: { onPick: (c: string) => void }) {
  const fn = useServerFn(getCountCategories);
  const { data, isLoading } = useQuery({
    queryKey: ["count-categories"],
    queryFn: () => fn(),
    staleTime: 5_000,
  });

  if (isLoading)
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );

  const rows = data?.rows ?? [];
  const needsTotal = data?.needsTotal ?? 0;

  if (needsTotal === 0)
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <PartyPopper className="w-7 h-7 mx-auto mb-2 text-emerald-500" />
        <p className="text-sm font-medium">Baseline complete</p>
        <p className="text-sm text-muted-foreground mt-1">
          Every imported item has a location. Re-counts for monthly audits come next.
        </p>
      </div>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{needsTotal}</span> item
        {needsTotal === 1 ? "" : "s"} still need a baseline. Work a category at a time.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {rows
          .filter((r) => r.needs > 0)
          .map((r) => (
            <button
              key={r.category}
              onClick={() => onPick(r.category)}
              className="text-left rounded-lg border bg-card p-4 hover:border-primary hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.category}</span>
                <Badge>{r.needs}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {r.needs} to count · {r.total} total
              </div>
            </button>
          ))}
      </div>
      {rows.some((r) => r.needs === 0) && (
        <p className="text-[11px] text-muted-foreground pt-1">
          Categories already done are hidden.
        </p>
      )}
    </div>
  );
}

function CountDeck({ category, onExit }: { category: string; onExit: () => void }) {
  const qc = useQueryClient();
  const deckFn = useServerFn(getCountDeck);
  const { data, isLoading } = useQuery({
    queryKey: ["count-deck", category],
    queryFn: () => deckFn({ data: { category } }),
    staleTime: 0,
  });

  const { data: locations } = useQuery({
    queryKey: ["all-locations"],
    queryFn: async () =>
      (
        await supabase
          .from("store_locations")
          .select("id,name,kind,location_code")
          .eq("is_active", true)
          .order("name")
      ).data ?? [],
    staleTime: 60_000,
  });

  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState(0);

  const items = data?.items ?? [];
  const item = items[idx];

  const exit = () => {
    qc.invalidateQueries({ queryKey: ["count-categories"] });
    onExit();
  };

  if (isLoading)
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading {category}…
      </div>
    );

  if (items.length === 0 || idx >= items.length)
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <PartyPopper className="w-7 h-7 mx-auto mb-2 text-emerald-500" />
        <p className="text-sm font-medium">{category} done</p>
        <p className="text-sm text-muted-foreground mt-1">
          Counted {done} item{done === 1 ? "" : "s"} this pass.
        </p>
        <Button className="mt-4" onClick={exit}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to categories
        </Button>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={exit}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Categories
        </Button>
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{idx + 1}</span> / {items.length} ·{" "}
          {category}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(idx / items.length) * 100}%` }}
        />
      </div>

      <CountCard
        key={item.id}
        item={item}
        locations={(locations ?? []) as any[]}
        onSaved={() => {
          setDone((d) => d + 1);
          setIdx((i) => i + 1);
        }}
        onSkip={() => setIdx((i) => i + 1)}
      />
    </div>
  );
}

function CountCard({
  item,
  locations,
  onSaved,
  onSkip,
}: {
  item: any;
  locations: any[];
  onSaved: () => void;
  onSkip: () => void;
}) {
  const recordFn = useServerFn(recordItemCount);
  const [type, setType] = useState<ItemType | "">(item.itemType ?? "");
  const [qty, setQty] = useState<string>(String(item.quantityAvailable || ""));
  const [locationId, setLocationId] = useState<string>("");
  const [price, setPrice] = useState<string>(
    item.retailPrice != null ? String(item.retailPrice) : "",
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const qtyNum = qty.trim() === "" ? NaN : Number(qty);
    if (Number.isNaN(qtyNum) || qtyNum < 0) {
      toast.error("Enter a quantity (0 is fine if none on hand)");
      return;
    }
    if (!locationId) {
      toast.error("Pick where it lives — that's what places it in the count");
      return;
    }
    setBusy(true);
    try {
      const priceNum = price.trim() === "" ? null : Number(price);
      await recordFn({
        data: {
          id: item.id,
          item_type: (type || null) as any,
          quantity: Math.floor(qtyNum),
          location_id: locationId,
          retail_price: priceNum != null && !Number.isNaN(priceNum) ? priceNum : null,
        },
      });
      toast.success(`${item.itemName} counted`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div>
        <div className="flex items-start gap-2">
          <h2 className="text-lg font-semibold flex-1">{item.itemName}</h2>
          {item.cloverPriceType === "VARIABLE" && (
            <Badge variant="outline" className="shrink-0">
              POS-priced
            </Badge>
          )}
        </div>
        {item.scientificName && (
          <p className="text-sm italic text-muted-foreground">{item.scientificName}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          System says: {item.quantityAvailable} on hand
          {item.cloverCode ? ` · UPC ${item.cloverCode}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={type || "__none__"}
            onValueChange={(v) => setType(v === "__none__" ? "" : (v as ItemType))}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {ITEM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ITEM_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Quantity on hand *</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            autoFocus
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5" /> Location *
        </Label>
        <Select
          value={locationId || "none"}
          onValueChange={(v) => setLocationId(v === "none" ? "" : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Where does it live?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Choose —</SelectItem>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.location_code ? `${l.location_code} — ` : ""}
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Price (optional)</Label>
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder={item.cloverPriceType === "VARIABLE" ? "Priced at POS — leave blank" : "—"}
        />
      </div>

      {item.needsPhoto && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Camera className="w-3.5 h-3.5" /> No photo yet — add one in go-live before it can sell.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button onClick={save} disabled={busy} className="flex-1">
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-1" /> Save &amp; next
            </>
          )}
        </Button>
        <Button variant="outline" onClick={onSkip} disabled={busy}>
          Skip
        </Button>
      </div>
    </div>
  );
}
