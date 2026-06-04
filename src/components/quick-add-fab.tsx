import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Camera, Sparkles, Loader2, Trash2, FileText, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ITEM_TYPES, ITEM_TYPE_LABELS, type ItemType } from "@/lib/ops";
import { quickAddInventoryItem, parseTagPhoto, parseInventoryMarkdown, quickCreateVendor } from "@/lib/ops.functions";

type Mode = "livestock" | "dry_good";

export function QuickAddFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition flex items-center justify-center"
        aria-label="Quick add inventory"
        title="Quick add inventory"
      >
        <Plus className="w-6 h-6" />
      </button>
      {open && <QuickAddDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function QuickAddButton({
  children = "Quick Add",
  variant = "default",
  size = "default",
  className,
}: {
  children?: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-1.5" />
        {children}
      </Button>
      {open && <QuickAddDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function QuickAddDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("livestock");
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quick Add to Inventory</DialogTitle>
          <DialogDescription>
            Items land in today's Quick Add batch for traceability. A primary photo is required.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="livestock">Livestock</TabsTrigger>
            <TabsTrigger value="dry_good">Dry Goods</TabsTrigger>
          </TabsList>
          <TabsContent value="livestock" className="pt-3">
            <QuickAddForm mode="livestock" onDone={onClose} />
          </TabsContent>
          <TabsContent value="dry_good" className="pt-3">
            <QuickAddForm mode="dry_good" onDone={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function QuickAddForm({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<"manual" | "markdown">("manual");

  const defaultType: ItemType = mode === "livestock" ? "fish" : "dry_good";

  const { data: locations } = useQuery({
    queryKey: ["all-locations-active"],
    queryFn: async () =>
      (await supabase.from("store_locations")
        .select("id,name,kind").eq("is_active", true).order("name")).data ?? [],
    staleTime: 60_000,
  });

  return (
    <Tabs value={subTab} onValueChange={(v) => setSubTab(v as any)}>
      <TabsList>
        <TabsTrigger value="manual"><Camera className="w-3.5 h-3.5 mr-1" />Photo + Form</TabsTrigger>
        <TabsTrigger value="markdown"><FileText className="w-3.5 h-3.5 mr-1" />Paste list</TabsTrigger>
      </TabsList>
      <TabsContent value="manual" className="pt-3">
        <ManualForm
          mode={mode}
          defaultType={defaultType}
          locations={locations ?? []}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["inventory"] }); onDone(); }}
        />
      </TabsContent>
      <TabsContent value="markdown" className="pt-3">
        <MarkdownBulk
          defaultType={defaultType}
          locations={locations ?? []}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["inventory"] }); onDone(); }}
        />
      </TabsContent>
    </Tabs>
  );
}

// ---- Manual entry with photo + optional AI tag parse ----
async function uploadToInventoryBucket(file: File): Promise<{ path: string; fileName: string }> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `quick-add/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await supabase.storage.from("inventory-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return { path, fileName: file.name };
}

function ManualForm({
  mode, defaultType, locations, onSaved,
}: { mode: Mode; defaultType: ItemType; locations: any[]; onSaved: () => void }) {
  const [itemName, setItemName] = useState("");
  const [scientificName, setScientificName] = useState("");
  const [itemType, setItemType] = useState<ItemType>(defaultType);
  const [quantity, setQuantity] = useState(1);
  const [retailPrice, setRetailPrice] = useState<string>("");
  const [wholesale, setWholesale] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [primaryPreview, setPrimaryPreview] = useState<string>("");
  const [hasPriceTag, setHasPriceTag] = useState(true);

  const [tagFile, setTagFile] = useState<File | null>(null);
  const [tagPreview, setTagPreview] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const parseTag = useServerFn(parseTagPhoto);
  const quickAdd = useServerFn(quickAddInventoryItem);

  const onPickPrimary = (f: File | null) => {
    setPrimaryFile(f);
    setPrimaryPreview(f ? URL.createObjectURL(f) : "");
  };
  const onPickTag = (f: File | null) => {
    setTagFile(f);
    setTagPreview(f ? URL.createObjectURL(f) : "");
  };

  const handleParseTag = async () => {
    const file = tagFile ?? primaryFile;
    if (!file) { toast.error("Pick a photo first"); return; }
    setParsing(true);
    try {
      const { path } = await uploadToInventoryBucket(file);
      const parsed = await parseTag({ data: { storage_path: path } });
      if (parsed.item_name) setItemName(parsed.item_name);
      if (parsed.scientific_name) setScientificName(parsed.scientific_name);
      if (parsed.item_type) setItemType(parsed.item_type as ItemType);
      if (typeof parsed.retail_price === "number") setRetailPrice(String(parsed.retail_price));
      // store tag photo path for later attach
      (window as any).__quickAddTagPath = path;
      toast.success(`Parsed (${parsed.confidence ?? "ok"})`);
    } catch (e: any) {
      toast.error(e.message ?? "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  const submit = async () => {
    if (!primaryFile) { toast.error("Primary photo is required"); return; }
    if (!itemName.trim()) { toast.error("Item name is required"); return; }
    const price = Number(retailPrice);
    if (!Number.isFinite(price) || price < 0) { toast.error("Enter a valid retail price"); return; }

    setSaving(true);
    try {
      const primary = await uploadToInventoryBucket(primaryFile);
      let tagPath: string | null = (window as any).__quickAddTagPath ?? null;
      if (tagFile && !tagPath) {
        const t = await uploadToInventoryBucket(tagFile);
        tagPath = t.path;
      }
      await quickAdd({ data: {
        item_name: itemName.trim(),
        scientific_name: scientificName.trim() || null,
        item_type: itemType,
        quantity,
        retail_price: price,
        wholesale_cost: wholesale ? Number(wholesale) : null,
        location_id: locationId || null,
        notes: notes.trim() || null,
        primary_photo_path: primary.path,
        primary_photo_file_name: primary.fileName,
        has_price_tag: hasPriceTag,
        tag_photo_path: tagPath,
        set_available: true,
      } });
      (window as any).__quickAddTagPath = null;
      toast.success(`Added ${itemName}`);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const labelHint = mode === "livestock"
    ? "Bag/tag with scientific name + retail price"
    : "Product with price label visible";

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Tip: take the primary photo with the {labelHint} visible. The price tag is required by the workflow — you can also upload a separate close-up of the tag and let AI fill the fields.
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <PhotoPicker label="Primary photo (required)" preview={primaryPreview} onPick={onPickPrimary} />
        <PhotoPicker label="Price tag close-up (optional)" preview={tagPreview} onPick={onPickTag} />
      </div>

      <div className="flex items-center gap-2 -mt-1">
        <Checkbox id="hasPriceTag" checked={hasPriceTag} onCheckedChange={v => setHasPriceTag(!!v)} />
        <Label htmlFor="hasPriceTag" className="text-xs">Primary photo contains the price tag</Label>
        <Button type="button" size="sm" variant="outline" onClick={handleParseTag}
          disabled={parsing || (!tagFile && !primaryFile)}>
          {parsing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          AI fill from photo
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Item name *</Label>
          <Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Blue tang" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Scientific name</Label>
          <Input value={scientificName} onChange={e => setScientificName(e.target.value)} placeholder="Paracanthurus hepatus" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type *</Label>
          <Select value={itemType} onValueChange={v => setItemType(v as ItemType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{ITEM_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity</Label>
          <Input type="number" min={1} value={quantity} onChange={e => setQuantity(Math.max(1, Number(e.target.value)))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Retail price (USD) *</Label>
          <Input type="number" step="0.01" min="0" value={retailPrice} onChange={e => setRetailPrice(e.target.value)} placeholder="49.99" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Wholesale cost (optional)</Label>
          <Input type="number" step="0.01" min="0" value={wholesale} onChange={e => setWholesale(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Location (tank / shelf)</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger><SelectValue placeholder="Pick a location to mark Available" /></SelectTrigger>
            <SelectContent>
              {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">No location? It will be saved as <span className="font-medium">Incoming</span>.</p>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Notes</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>
      </div>

      <DialogFooter>
        <Button onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
          {saving ? "Saving…" : "Add to inventory"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function PhotoPicker({
  label, preview, onPick,
}: { label: string; preview: string; onPick: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="rounded-md border border-dashed bg-muted/20 aspect-video flex items-center justify-center overflow-hidden relative">
        {preview ? (
          <>
            <img src={preview} alt="" className="w-full h-full object-contain" />
            <button type="button" onClick={() => onPick(null)}
              className="absolute top-1 right-1 bg-background/90 rounded p-1 hover:bg-background">
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        ) : (
          <button type="button" onClick={() => ref.current?.click()}
            className="text-xs text-muted-foreground flex flex-col items-center gap-1">
            <Camera className="w-5 h-5" />
            Tap to capture / upload
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value=""; }} />
      {preview && (
        <Button type="button" size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={() => ref.current?.click()}>
          Replace
        </Button>
      )}
    </div>
  );
}

// ---- Markdown bulk ----
type ParsedRow = {
  item_name: string;
  scientific_name?: string;
  item_type?: string;
  quantity?: number;
  retail_price?: number;
  wholesale_cost?: number;
  notes?: string;
};

function MarkdownBulk({
  defaultType, locations, onSaved,
}: { defaultType: ItemType; locations: any[]; onSaved: () => void }) {
  const [md, setMd] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locationId, setLocationId] = useState<string>("");
  const [bulkPhoto, setBulkPhoto] = useState<File | null>(null);
  const [bulkPreview, setBulkPreview] = useState<string>("");

  const parseFn = useServerFn(parseInventoryMarkdown);
  const quickAdd = useServerFn(quickAddInventoryItem);

  const onParse = async () => {
    if (!md.trim()) { toast.error("Paste a list first"); return; }
    setParsing(true);
    try {
      const r = await parseFn({ data: { markdown: md, default_type: defaultType } });
      setRows(r.items ?? []);
      toast.success(`Parsed ${r.items?.length ?? 0} item(s) — review below`);
    } catch (e: any) {
      toast.error(e.message ?? "Parse failed");
    } finally { setParsing(false); }
  };

  const updateRow = (i: number, patch: Partial<ParsedRow>) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const removeRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));

  const saveAll = async () => {
    if (rows.length === 0) { toast.error("Nothing to save"); return; }
    if (!bulkPhoto) { toast.error("A shared photo is required for bulk add. Add a single representative photo for now — each item will reuse it until you upload an item-specific photo."); return; }
    const invalid = rows.find(r => !r.item_name?.trim() || !(r.retail_price! >= 0));
    if (invalid) { toast.error("All rows need a name and price"); return; }
    setSaving(true);
    try {
      const photo = await uploadToInventoryBucket(bulkPhoto);
      let okCount = 0;
      for (const r of rows) {
        try {
          await quickAdd({ data: {
            item_name: r.item_name.trim(),
            scientific_name: r.scientific_name?.trim() || null,
            item_type: (r.item_type as ItemType) ?? defaultType,
            quantity: r.quantity ?? 1,
            retail_price: Number(r.retail_price ?? 0),
            wholesale_cost: r.wholesale_cost != null ? Number(r.wholesale_cost) : null,
            location_id: locationId || null,
            notes: r.notes ?? null,
            primary_photo_path: photo.path,
            primary_photo_file_name: photo.fileName,
            has_price_tag: false,
            tag_photo_path: null,
            set_available: true,
          } });
          okCount++;
        } catch (e: any) {
          console.error("row failed", r.item_name, e);
        }
      }
      toast.success(`Added ${okCount} of ${rows.length}`);
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <Label className="text-xs">Paste markdown / text list (one item per line, may include qty + price)</Label>
      <Textarea
        rows={6}
        value={md}
        onChange={e => setMd(e.target.value)}
        placeholder={`- Salifert KH Test Kit — $24.99\n- Two Little Fishies Reactor — qty 2, $89\n- Yellow Tang, Zebrasoma flavescens, $129.99`}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={onParse} disabled={parsing}>
          {parsing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
          Parse with AI
        </Button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="rounded-md border divide-y max-h-[40vh] overflow-y-auto">
            {rows.map((r, i) => (
              <div key={i} className="p-2 grid grid-cols-12 gap-2 items-center text-xs">
                <Input className="col-span-4 h-8" value={r.item_name} onChange={e => updateRow(i, { item_name: e.target.value })} />
                <Select value={r.item_type ?? defaultType} onValueChange={v => updateRow(i, { item_type: v })}>
                  <SelectTrigger className="col-span-2 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{ITEM_TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" min={1} className="col-span-2 h-8" value={r.quantity ?? 1} onChange={e => updateRow(i, { quantity: Number(e.target.value) })} placeholder="Qty" />
                <Input type="number" step="0.01" className="col-span-3 h-8" value={r.retail_price ?? ""} onChange={e => updateRow(i, { retail_price: Number(e.target.value) })} placeholder="Retail $" />
                <button onClick={() => removeRow(i)} className="col-span-1 text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <PhotoPicker label="Shared photo for these items (required)" preview={bulkPreview}
              onPick={(f) => { setBulkPhoto(f); setBulkPreview(f ? URL.createObjectURL(f) : ""); }} />
            <div className="space-y-1.5">
              <Label className="text-xs">Location for all</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger><SelectValue placeholder="(optional)" /></SelectTrigger>
                <SelectContent>
                  {locations.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={saveAll} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              {saving ? `Saving…` : `Add ${rows.length} item(s)`}
            </Button>
          </DialogFooter>
        </>
      )}
    </div>
  );
}
