import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { PhotoOnFileWizard, inventoryHasPhoto } from "@/components/photo-on-file-wizard";
import { reviewInventoryItem, flagInventoryForReview } from "@/lib/ops.functions";
import {
  INVENTORY_REVIEW_STATUSES,
  INVENTORY_AVAILABILITY_LABELS,
  ITEM_TYPE_LABELS,
  fmtMoney,
  type ItemType,
} from "@/lib/ops";
import { Loader2, Camera, Check, X, ImageOff, CheckCircle2 } from "lucide-react";

type LocationOpt = { id: string; name: string; is_live_sale?: boolean };

const SWIPE_THRESHOLD = 120;

// One-card-at-a-time review deck for draft stock (mostly Clover imports sitting at
// quantity 0 / not_for_sale). Fill location + qty + price, snap a photo, then swipe
// right to take it live or left to skip-and-flag for later. Admin-only (it approves
// pricing and flips items to available). Reuses PhotoOnFileWizard + the photo gate.
export function InventoryReviewWizard({
  open,
  onOpenChange,
  locations,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  locations: LocationOpt[];
  onChanged: () => void;
}) {
  const reviewFn = useServerFn(reviewInventoryItem);
  const flagFn = useServerFn(flagInventoryForReview);

  const [queue, setQueue] = useState<any[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState({ live: 0, skipped: 0 });
  const [photoOpen, setPhotoOpen] = useState(false);

  // per-card form
  const [locationId, setLocationId] = useState("none");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [hasPhoto, setHasPhoto] = useState(false);

  // drag-to-swipe
  const [dragX, setDragX] = useState(0);
  const dragStart = useRef<number | null>(null);

  const current = queue[index] ?? null;
  const done = !loading && index >= queue.length;

  // Load (and reload) the deck each time the dialog opens. The seq guard means a
  // quick close/reopen can't let a stale in-flight load clobber the fresh one.
  const loadSeq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const seq = ++loadSeq.current;
    (async () => {
      setLoading(true);
      setIndex(0);
      setCounts({ live: 0, skipped: 0 });
      const { data } = await supabase
        .from("inventory_items")
        .select(
          "id,item_name,scientific_name,item_type,attrs,quantity_available,location_id,retail_price,pricing_status,availability_status,needs_photo, vendors(name)",
        )
        .in("availability_status", INVENTORY_REVIEW_STATUSES)
        .order("updated_at", { ascending: false })
        .limit(100);
      const items = (data ?? []).filter((it: any) => !it.attrs?.review_flag);
      if (seq === loadSeq.current) {
        setQueue(items);
        setLoading(false);
      }
    })();
  }, [open]);

  // Seed the form whenever the current card changes.
  useEffect(() => {
    if (!current) return;
    setLocationId(current.location_id ?? "none");
    setQty(String(current.quantity_available > 0 ? current.quantity_available : 1));
    setPrice(current.retail_price != null ? String(current.retail_price) : "");
    setDragX(0);
    setHasPhoto(false);
    inventoryHasPhoto(current.id).then(setHasPhoto);
  }, [current?.id]);

  const advance = () => setIndex((i) => i + 1);

  // Commit the go-live (fields already validated, photo already present).
  const commitLive = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await reviewFn({
        data: {
          id: current.id,
          locationId: locationId === "none" ? null : locationId,
          quantityAvailable: Number(qty),
          retailPrice: Number(price),
          takeLive: true,
        },
      });
      toast.success(`${current.item_name} is live`);
      setCounts((c) => ({ ...c, live: c.live + 1 }));
      onChanged();
      advance();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not take live");
    } finally {
      setBusy(false);
    }
  };

  const doSaveLive = async () => {
    if (!current || busy) return;
    const q = Number(qty);
    const p = Number(price);
    if (locationId === "none") return toast.error("Pick a location");
    if (!Number.isFinite(q) || q <= 0) return toast.error("Quantity must be greater than 0");
    if (!Number.isFinite(p) || p <= 0) return toast.error("Set a retail price");
    if (!hasPhoto) {
      // Photo gate: capture first, then onUploaded commits the go-live.
      setPhotoOpen(true);
      return;
    }
    await commitLive();
  };

  const doSkip = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      await flagFn({ data: { id: current.id } });
      setCounts((c) => ({ ...c, skipped: c.skipped + 1 }));
      onChanged();
      advance();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not skip");
    } finally {
      setBusy(false);
    }
  };

  // Keyboard: → save & live, ← skip (ignored while typing in a field). Bind the
  // listener once per open (not every render) and read the handlers through refs
  // so the closure can't fire stale — the no-deps version re-subscribed on every
  // render and risked a double-fire mid-state-update.
  const doSaveLiveRef = useRef(doSaveLive);
  const doSkipRef = useRef(doSkip);
  doSaveLiveRef.current = doSaveLive;
  doSkipRef.current = doSkip;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t?.tagName)) return;
      if (e.key === "ArrowRight") doSaveLiveRef.current();
      if (e.key === "ArrowLeft") doSkipRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Pointer drag on the card header (form inputs below stay interactive).
  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    dragStart.current = e.clientX;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current == null) return;
    setDragX(e.clientX - dragStart.current);
  };
  const onPointerUp = () => {
    if (dragStart.current == null) return;
    const dx = dragX;
    dragStart.current = null;
    setDragX(0);
    if (dx > SWIPE_THRESHOLD) doSaveLive();
    else if (dx < -SWIPE_THRESHOLD) doSkip();
  };

  const total = queue.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review stock</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading items that need review…
          </div>
        ) : total === 0 ? (
          <div className="text-center py-10 space-y-2">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
            <div className="font-medium">Nothing to review</div>
            <p className="text-sm text-muted-foreground">No draft items are waiting. 🐠</p>
          </div>
        ) : done ? (
          <div className="text-center py-10 space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
            <div className="font-medium">Review session complete</div>
            <p className="text-sm text-muted-foreground">
              {counts.live} taken live · {counts.skipped} skipped for later
            </p>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Item {index + 1} of {total}
              </span>
              <span>
                <span className="text-emerald-600">{counts.live} live</span> ·{" "}
                <span className="text-amber-600">{counts.skipped} skipped</span>
              </span>
            </div>

            {/* Swipe card */}
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{
                transform: `translateX(${dragX}px) rotate(${dragX * 0.03}deg)`,
                transition: dragStart.current == null ? "transform 0.2s ease" : "none",
              }}
              className="relative rounded-xl border bg-card p-4 cursor-grab active:cursor-grabbing select-none touch-none"
            >
              {dragX > 40 && (
                <Badge className="absolute top-3 right-3 bg-emerald-600">Take live →</Badge>
              )}
              {dragX < -40 && <Badge className="absolute top-3 left-3 bg-amber-600">← Skip</Badge>}
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{current.item_name}</div>
                  {current.scientific_name && (
                    <div className="text-xs italic text-muted-foreground truncate">
                      {current.scientific_name}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px]">
                    {current.item_type && (
                      <Badge variant="secondary">
                        {ITEM_TYPE_LABELS[current.item_type as ItemType] ?? current.item_type}
                      </Badge>
                    )}
                    {current.vendors?.name && (
                      <Badge variant="outline">{current.vendors.name}</Badge>
                    )}
                    <Badge variant="outline">
                      {INVENTORY_AVAILABILITY_LABELS[
                        current.availability_status as keyof typeof INVENTORY_AVAILABILITY_LABELS
                      ] ?? current.availability_status}
                    </Badge>
                  </div>
                </div>
                {hasPhoto ? (
                  <Badge variant="outline" className="border-emerald-400 text-emerald-600 gap-1">
                    <Camera className="w-3 h-3" /> Photo
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setPhotoOpen(true)}>
                    <ImageOff className="w-4 h-4 mr-1" /> Add photo
                  </Button>
                )}
              </div>
            </div>

            {/* Fill in the gaps */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5 col-span-2">
                <Label className="text-xs">Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pick a location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                        {l.is_live_sale ? " ★" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Retail price ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  className="h-9"
                />
              </div>
            </div>

            {current.retail_price != null && (
              <p className="text-xs text-muted-foreground">
                Clover price on file: {fmtMoney(current.retail_price)} — approving here sets the
                customer retail price.
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button variant="outline" onClick={doSkip} disabled={busy} className="flex-1">
                <X className="w-4 h-4 mr-1 text-amber-600" /> Skip &amp; flag
              </Button>
              <Button onClick={doSaveLive} disabled={busy} className="flex-1">
                {busy ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-1" />
                )}
                Save &amp; take live
              </Button>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">
              Drag the card, or use ← skip / → take live
            </p>
          </div>
        )}

        {current && (
          <PhotoOnFileWizard
            open={photoOpen}
            onOpenChange={setPhotoOpen}
            inventoryItemId={current.id}
            itemName={current.item_name}
            onUploaded={async () => {
              setHasPhoto(true);
              // Photo was the only thing blocking go-live → commit it now.
              await commitLive();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
