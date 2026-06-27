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
import { VendorImagePicker } from "@/components/vendor-image-picker";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  ClipboardList,
  MapPin,
  Camera,
  PartyPopper,
  Rocket,
} from "lucide-react";

export const Route = createFileRoute("/_app/inventory/count")({ component: CountPage });

async function uploadCountPhoto(file: File) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `count/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("inventory-media")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw error;
  return { path, fileName: file.name };
}

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
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  // A picked vendor-scrape image (already in inventory-media) — attached by path.
  const [pickedImage, setPickedImage] = useState<{ path: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const qtyNum = qty.trim() === "" ? NaN : Number(qty);
  const priceNum = price.trim() === "" ? NaN : Number(price);
  const hasPhotoOnFile = !item.needsPhoto || !!photo || !!pickedImage;
  // Can publish (go live) when everything the go-live gate needs is in hand.
  const canPublish =
    !Number.isNaN(qtyNum) &&
    qtyNum > 0 &&
    !!locationId &&
    !Number.isNaN(priceNum) &&
    priceNum > 0 &&
    hasPhotoOnFile;

  const pickPhoto = (f: File | undefined | null) => {
    if (!f) return;
    setPickedImage(null);
    setPhoto({ file: f, preview: URL.createObjectURL(f) });
  };

  const submit = async (takeLive: boolean) => {
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
      let photoPath: string | undefined;
      let photoFileName: string | undefined;
      if (photo) {
        const up = await uploadCountPhoto(photo.file);
        photoPath = up.path;
        photoFileName = up.fileName;
      } else if (pickedImage) {
        photoPath = pickedImage.path;
        photoFileName = pickedImage.path.split("/").pop() || "vendor.jpg";
      }
      await recordFn({
        data: {
          id: item.id,
          item_type: (type || null) as any,
          quantity: Math.floor(qtyNum),
          location_id: locationId,
          retail_price: !Number.isNaN(priceNum) ? priceNum : null,
          photo_path: photoPath,
          photo_file_name: photoFileName,
          take_live: takeLive,
        },
      });
      toast.success(takeLive ? `${item.itemName} counted & live` : `${item.itemName} counted`);
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

      {/* Photo — add it here to publish (go live) in the same pass */}
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1">
          <Camera className="w-3.5 h-3.5" /> Photo {item.needsPhoto ? "" : "(on file)"}
        </Label>
        {photo || pickedImage ? (
          <div className="relative rounded-md border overflow-hidden">
            <img
              src={(photo ?? pickedImage)!.preview}
              alt=""
              className="w-full max-h-48 object-contain bg-muted"
            />
            {pickedImage && (
              <span className="absolute top-2 left-2 text-[10px] rounded bg-black/60 text-white px-1.5 py-0.5">
                Vendor image
              </span>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => {
                setPhoto(null);
                setPickedImage(null);
              }}
            >
              Change
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block rounded-md border-2 border-dashed border-muted-foreground/30 p-4 text-center cursor-pointer hover:bg-muted/30">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => pickPhoto(e.target.files?.[0])}
              />
              <Camera className="w-6 h-6 mx-auto text-muted-foreground" />
              <div className="text-xs mt-1 text-muted-foreground">
                {item.needsPhoto
                  ? "Tap to photograph — needed to take it live"
                  : "Already has a photo; tap to add another"}
              </div>
            </label>
            <div className="flex justify-center">
              <VendorImagePicker
                initialQuery={item.itemName ?? ""}
                onPick={(path, preview) => setPickedImage({ path, preview })}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          onClick={() => submit(true)}
          disabled={busy || !canPublish}
          className="flex-1 min-w-[9rem]"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Rocket className="w-4 h-4 mr-1" />
          )}
          Count &amp; publish
        </Button>
        <Button variant="outline" onClick={() => submit(false)} disabled={busy}>
          <Check className="w-4 h-4 mr-1" /> Count only
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={busy}>
          Skip
        </Button>
      </div>
      {!canPublish && (
        <p className="text-[11px] text-muted-foreground">
          Publish needs a photo, a price, a location, and quantity &gt; 0. Otherwise “Count only”
          records the baseline and you can take it live later.
        </p>
      )}
    </div>
  );
}
