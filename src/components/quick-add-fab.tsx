import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  Plus,
  Camera,
  Sparkles,
  Loader2,
  Trash2,
  FileText,
  Check,
  ChevronsUpDown,
  Tag,
  Waves,
  PackageOpen,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ITEM_TYPES, ITEM_TYPE_LABELS, type ItemType } from "@/lib/ops";
import {
  quickAddInventoryItem,
  parseTagPhoto,
  parseInventoryMarkdown,
  quickCreateVendor,
  findInventoryDuplicates,
  bulkImportInventoryRows,
} from "@/lib/ops.functions";
import { Badge } from "@/components/ui/badge";

type Mode = "livestock" | "dry_good";

export function QuickAddFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition flex items-center justify-center"
        aria-label="Add inventory"
        title="Add inventory"
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

function IntentCard({
  title,
  desc,
  icon: Icon,
  onClick,
  primary,
}: {
  title: string;
  desc: string;
  icon: any;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 flex items-start gap-3 transition-colors hover:bg-muted/50 ${primary ? "border-primary/50 bg-primary/5" : ""}`}
    >
      <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </button>
  );
}

function QuickAddDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("livestock");
  const [intent, setIntent] = useState<"choose" | "quick">("choose");
  const nav = useNavigate();
  const go = (to: string) => {
    onClose();
    nav({ to });
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add inventory</DialogTitle>
          <DialogDescription>
            {intent === "choose"
              ? "What are you adding? Pick the path that matches."
              : "Tagged stock — lands in today's Quick Add batch. A primary photo is required."}
          </DialogDescription>
        </DialogHeader>

        {intent === "choose" ? (
          <div className="space-y-2.5">
            <IntentCard
              primary
              icon={Tag}
              title="Add tagged stock for sale"
              desc="An item already tagged & priced (dry goods, fish, coral). Goes live when you pick a location."
              onClick={() => setIntent("quick")}
            />
            <IntentCard
              icon={Waves}
              title="Catalog corals in a tank"
              desc="Log corals already in the building as drafts to price later (plug / rack tags)."
              onClick={() => go("/inventory/coral-discovery")}
            />
            <IntentCard
              icon={PackageOpen}
              title="Receive a vendor order"
              desc="Enter a vendor invoice / order sheet — AI extracts the lines, admin approves pricing."
              onClick={() => go("/batches")}
            />
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setIntent("choose")}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-1"
            >
              <ChevronLeft className="w-3 h-3" /> back
            </button>
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
          </>
        )}
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
      (
        await supabase
          .from("store_locations")
          .select("id,name,kind")
          .eq("is_active", true)
          .order("name")
      ).data ?? [],
    staleTime: 60_000,
  });

  return (
    <Tabs value={subTab} onValueChange={(v) => setSubTab(v as any)}>
      <TabsList>
        <TabsTrigger value="manual">
          <Camera className="w-3.5 h-3.5 mr-1" />
          Photo + Form
        </TabsTrigger>
        <TabsTrigger value="markdown">
          <FileText className="w-3.5 h-3.5 mr-1" />
          Paste list
        </TabsTrigger>
      </TabsList>
      <TabsContent value="manual" className="pt-3">
        <ManualForm
          mode={mode}
          defaultType={defaultType}
          locations={locations ?? []}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["inventory"] });
            onDone();
          }}
        />
      </TabsContent>
      <TabsContent value="markdown" className="pt-3">
        <MarkdownBulk
          defaultType={defaultType}
          locations={locations ?? []}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["inventory"] });
            onDone();
          }}
        />
      </TabsContent>
    </Tabs>
  );
}

// ---- Manual entry with photo + optional AI tag parse ----
async function uploadToInventoryBucket(file: File): Promise<{ path: string; fileName: string }> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `quick-add/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("inventory-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return { path, fileName: file.name };
}

function ManualForm({
  mode,
  defaultType,
  locations,
  onSaved,
}: {
  mode: Mode;
  defaultType: ItemType;
  locations: any[];
  onSaved: () => void;
}) {
  const [itemName, setItemName] = useState("");
  const [scientificName, setScientificName] = useState("");
  const [itemType, setItemType] = useState<ItemType>(defaultType);
  const [quantity, setQuantity] = useState(1);
  const [retailPrice, setRetailPrice] = useState<string>("");
  const [wholesale, setWholesale] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [vendorId, setVendorId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [inventoryRole, setInventoryRole] = useState<string>("");
  const [coralType, setCoralType] = useState<string>("");

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
    if (!file) {
      toast.error("Pick a photo first");
      return;
    }
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
    if (!primaryFile) {
      toast.error("Primary photo is required");
      return;
    }
    if (!itemName.trim()) {
      toast.error("Item name is required");
      return;
    }
    const price = Number(retailPrice);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter a valid retail price");
      return;
    }

    setSaving(true);
    try {
      const primary = await uploadToInventoryBucket(primaryFile);
      let tagPath: string | null = (window as any).__quickAddTagPath ?? null;
      if (tagFile && !tagPath) {
        const t = await uploadToInventoryBucket(tagFile);
        tagPath = t.path;
      }
      const attrs: Record<string, any> = {};
      if (itemType === "coral") {
        if (inventoryRole) attrs.inventory_role = inventoryRole;
        if (coralType) attrs.coral_type = coralType;
      }
      const r = await quickAdd({
        data: {
          item_name: itemName.trim(),
          scientific_name: scientificName.trim() || null,
          item_type: itemType,
          quantity,
          retail_price: price,
          wholesale_cost: wholesale ? Number(wholesale) : null,
          location_id: locationId || null,
          source_vendor_id: vendorId || null,
          notes: notes.trim() || null,
          primary_photo_path: primary.path,
          primary_photo_file_name: primary.fileName,
          has_price_tag: hasPriceTag,
          tag_photo_path: tagPath,
          set_available: true,
          attrs: Object.keys(attrs).length > 0 ? attrs : null,
        },
      });
      (window as any).__quickAddTagPath = null;
      toast.success(
        r.flaggedForReview
          ? `Added ${itemName} — live, flagged for admin review`
          : `Added ${itemName}`,
      );
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const labelHint =
    mode === "livestock"
      ? "Bag/tag with scientific name + retail price"
      : "Product with price label visible";

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        Tip: take the primary photo with the {labelHint} visible. The price tag is required by the
        workflow — you can also upload a separate close-up of the tag and let AI fill the fields.
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <PhotoPicker
          label="Primary photo (required)"
          preview={primaryPreview}
          onPick={onPickPrimary}
        />
        <PhotoPicker
          label="Price tag close-up (optional)"
          preview={tagPreview}
          onPick={onPickTag}
        />
      </div>

      <div className="flex items-center gap-2 -mt-1">
        <Checkbox
          id="hasPriceTag"
          checked={hasPriceTag}
          onCheckedChange={(v) => setHasPriceTag(!!v)}
        />
        <Label htmlFor="hasPriceTag" className="text-xs">
          Primary photo contains the price tag
        </Label>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleParseTag}
          disabled={parsing || (!tagFile && !primaryFile)}
        >
          {parsing ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3 mr-1" />
          )}
          AI fill from photo
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Vendor / source (where you bought it)</Label>
        <VendorPickerCombo value={vendorId} onChange={setVendorId} />
        <p className="text-[10px] text-muted-foreground">
          Optional — pick existing or quick-create. Leave blank if unknown.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Item name *</Label>
          <Input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="Blue tang"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Scientific name</Label>
          <Input
            value={scientificName}
            onChange={(e) => setScientificName(e.target.value)}
            placeholder="Paracanthurus hepatus"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type *</Label>
          <Select value={itemType} onValueChange={(v) => setItemType(v as ItemType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ITEM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {ITEM_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Quantity</Label>
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Retail price (USD) *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={retailPrice}
            onChange={(e) => setRetailPrice(e.target.value)}
            placeholder="49.99"
          />
          <p className="text-[10px] text-muted-foreground">
            From the price tag — saved as <span className="font-medium">approved</span> retail
            (tagged items are pre-approved).
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Wholesale cost (optional)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={wholesale}
            onChange={(e) => setWholesale(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Location (tank / shelf)</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick a location to go live (Available)" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((l: any) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {locationId ? (
            <p className="text-[11px] rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-1">
              Will go live now as <span className="font-medium">Available</span>.
            </p>
          ) : (
            <p className="text-[11px] rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-1">
              No location yet — saves as <span className="font-medium">Incoming</span> (not live).
              Pick a location to make it Available now.
            </p>
          )}
        </div>
        {itemType === "coral" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Inventory role</Label>
              <Select value={inventoryRole} onValueChange={setInventoryRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Operational role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="for_sale">For sale</SelectItem>
                  <SelectItem value="growout">Growout</SelectItem>
                  <SelectItem value="mother_colony">Mother colony</SelectItem>
                  <SelectItem value="frag_source">Frag source</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Customer availability is controlled separately by Availability status.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Coral type</Label>
              <Select value={coralType} onValueChange={setCoralType}>
                <SelectTrigger>
                  <SelectValue placeholder="SPS / LPS / soft…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPS">SPS</SelectItem>
                  <SelectItem value="LPS">LPS</SelectItem>
                  <SelectItem value="soft">Soft</SelectItem>
                  <SelectItem value="zoanthid">Zoanthid</SelectItem>
                  <SelectItem value="mushroom">Mushroom</SelectItem>
                  <SelectItem value="anemone">Anemone</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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
  label,
  preview,
  onPick,
}: {
  label: string;
  preview: string;
  onPick: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="rounded-md border border-dashed bg-muted/20 aspect-video flex items-center justify-center overflow-hidden relative">
        {preview ? (
          <>
            <img src={preview} alt="" className="w-full h-full object-contain" />
            <button
              type="button"
              onClick={() => onPick(null)}
              className="absolute top-1 right-1 bg-background/90 rounded p-1 hover:bg-background"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="text-xs text-muted-foreground flex flex-col items-center gap-1"
          >
            <Camera className="w-5 h-5" />
            Tap to capture / upload
          </button>
        )}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />
      {preview && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-full h-7 text-xs"
          onClick={() => ref.current?.click()}
        >
          Replace
        </Button>
      )}
    </div>
  );
}

// ---- Markdown bulk with dedupe ----
type ParsedRow = {
  item_name: string;
  scientific_name?: string;
  item_type?: string;
  quantity?: number;
  retail_price?: number;
  wholesale_cost?: number;
  notes?: string;
};

type DupeMatch = {
  id: string;
  item_name: string;
  scientific_name: string | null;
  item_type: string | null;
  quantity_available: number | null;
  retail_price: number | null;
  availability_status: string | null;
  score: number;
};

type ReviewRow = ParsedRow & {
  dupe_status: "exact" | "likely" | "new";
  dupe_match: DupeMatch | null;
  decision: "create" | "merge" | "skip";
};

function MarkdownBulk({
  defaultType,
  locations,
  onSaved,
}: {
  defaultType: ItemType;
  locations: any[];
  onSaved: () => void;
}) {
  const [md, setMd] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [checkingDupes, setCheckingDupes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locationId, setLocationId] = useState<string>("");
  const [vendorId, setVendorId] = useState<string>("");
  const [bulkPhoto, setBulkPhoto] = useState<File | null>(null);
  const [bulkPreview, setBulkPreview] = useState<string>("");
  const [rowPhotos, setRowPhotos] = useState<Record<number, { file: File; preview: string }>>({});

  const parseFn = useServerFn(parseInventoryMarkdown);
  const dedupeFn = useServerFn(findInventoryDuplicates);
  const bulkImport = useServerFn(bulkImportInventoryRows);

  const onParse = async () => {
    if (!md.trim()) {
      toast.error("Paste a list first");
      return;
    }
    setParsing(true);
    try {
      const r = await parseFn({ data: { markdown: md, default_type: defaultType } });
      const items = r.items ?? [];
      if (items.length === 0) {
        toast.error("AI found no items");
        setRows([]);
        return;
      }
      // Initial rows, decision defaults will be set after dedupe pass.
      const initial: ReviewRow[] = items.map((it) => ({
        ...it,
        dupe_status: "new",
        dupe_match: null,
        decision: "create",
      }));
      setRows(initial);

      setCheckingDupes(true);
      try {
        const dupe = await dedupeFn({
          data: {
            rows: items.map((it) => ({
              item_name: it.item_name,
              scientific_name: it.scientific_name ?? null,
            })),
          },
        });
        setRows((prev) =>
          prev.map((row, i) => {
            const d = dupe.results[i];
            if (!d) return row;
            return {
              ...row,
              dupe_status: d.status,
              dupe_match: d.match,
              decision: d.status === "exact" ? "merge" : "create",
            };
          }),
        );
        toast.success(
          `Parsed ${items.length} · ${dupe.results.filter((d) => d.status !== "new").length} possible duplicate(s)`,
        );
      } finally {
        setCheckingDupes(false);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (i: number, patch: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
    setRowPhotos((rp) => {
      const next: typeof rp = {};
      for (const [k, v] of Object.entries(rp)) {
        const ki = Number(k);
        if (ki === i) continue;
        next[ki > i ? ki - 1 : ki] = v;
      }
      return next;
    });
  };
  const setRowPhoto = (i: number, file: File | null) => {
    setRowPhotos((rp) => {
      const next = { ...rp };
      if (next[i]?.preview) URL.revokeObjectURL(next[i].preview);
      if (file) next[i] = { file, preview: URL.createObjectURL(file) };
      else delete next[i];
      return next;
    });
  };

  const createRowIndexes = () =>
    rows.map((r, i) => ({ r, i })).filter(({ r }) => r.decision === "create");
  const rowsNeedingShared = () => createRowIndexes().filter(({ i }) => !rowPhotos[i]);

  const saveAll = async () => {
    if (rows.length === 0) {
      toast.error("Nothing to save");
      return;
    }
    const actionable = rows.filter((r) => r.decision !== "skip");
    if (actionable.length === 0) {
      toast.error("All rows are set to Skip");
      return;
    }
    const creates = createRowIndexes();
    const missingShared = rowsNeedingShared();
    if (creates.length > 0 && missingShared.length > 0 && !bulkPhoto) {
      toast.error(
        `${missingShared.length} create row(s) have no photo. Add a per-row photo or a shared fallback.`,
      );
      return;
    }
    const invalid = actionable.find(
      (r) =>
        !r.item_name?.trim() ||
        !Number.isFinite(Number(r.retail_price)) ||
        Number(r.retail_price) < 0 ||
        (r.decision === "merge" && !r.dupe_match?.id),
    );
    if (invalid) {
      toast.error(`"${invalid.item_name || "row"}" is missing a name, price, or merge target`);
      return;
    }

    setSaving(true);
    try {
      // Upload shared fallback only if needed by at least one create row.
      let sharedPath: string | null = null;
      let sharedName: string | null = null;
      if (creates.length > 0 && missingShared.length > 0 && bulkPhoto) {
        const p = await uploadToInventoryBucket(bulkPhoto);
        sharedPath = p.path;
        sharedName = p.fileName;
      }
      // Upload per-row photos in parallel.
      const perRowEntries = Object.entries(rowPhotos);
      const uploads = await Promise.all(
        perRowEntries.map(async ([k, { file }]) => {
          const p = await uploadToInventoryBucket(file);
          return [Number(k), p] as const;
        }),
      );
      const uploadedByIndex: Record<number, { path: string; fileName: string }> = {};
      for (const [i, p] of uploads) uploadedByIndex[i] = p;

      const payloadRows = rows.map((r, i) => ({
        item_name: r.item_name.trim(),
        scientific_name: r.scientific_name?.trim() || null,
        item_type: (r.item_type as ItemType) ?? defaultType,
        quantity: Math.max(1, Number(r.quantity ?? 1)),
        retail_price: Number(r.retail_price ?? 0),
        wholesale_cost: r.wholesale_cost != null ? Number(r.wholesale_cost) : null,
        notes: r.notes?.trim() || null,
        decision: r.decision,
        merge_target_id: r.decision === "merge" ? (r.dupe_match?.id ?? null) : null,
        photo_path: uploadedByIndex[i]?.path ?? null,
        photo_file_name: uploadedByIndex[i]?.fileName ?? null,
      }));

      const result = await bulkImport({
        data: {
          rows: payloadRows,
          location_id: locationId || null,
          source_vendor_id: vendorId || null,
          shared_photo_path: sharedPath,
          shared_photo_file_name: sharedName,
          set_available: true,
        },
      });

      const parts = [];
      if (result.created)
        parts.push(
          `${result.created} created${result.flaggedForReview ? " (flagged for review)" : ""}`,
        );
      if (result.merged) parts.push(`${result.merged} merged`);
      if (result.skipped) parts.push(`${result.skipped} skipped`);
      if (result.errors.length) parts.push(`${result.errors.length} error(s)`);
      toast[result.errors.length ? "warning" : "success"](parts.join(" · ") || "Done");
      if (result.errors.length) console.warn("bulk import errors", result.errors);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const statusBadge = (s: "exact" | "likely" | "new") => {
    if (s === "exact")
      return (
        <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">Exact match</Badge>
      );
    if (s === "likely")
      return <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px]">Likely dup</Badge>;
    return (
      <Badge variant="outline" className="text-[10px]">
        New
      </Badge>
    );
  };

  return (
    <div className="space-y-3">
      <Label className="text-xs">
        Paste markdown / text list (one item per line, may include qty + price)
      </Label>
      <Textarea
        rows={6}
        value={md}
        onChange={(e) => setMd(e.target.value)}
        placeholder={`- Salifert KH Test Kit — $24.99\n- Two Little Fishies Reactor — qty 2, $89\n- Yellow Tang, Zebrasoma flavescens, $129.99`}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={onParse} disabled={parsing || checkingDupes}>
          {parsing || checkingDupes ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3 mr-1" />
          )}
          {parsing ? "Parsing…" : checkingDupes ? "Checking dupes…" : "Parse with AI"}
        </Button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="rounded-md border divide-y max-h-[50vh] overflow-y-auto">
            {rows.map((r, i) => (
              <div key={i} className="p-2 space-y-2 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(r.dupe_status)}
                  {r.dupe_match && (
                    <span className="text-muted-foreground">
                      →{" "}
                      <span className="font-medium text-foreground">{r.dupe_match.item_name}</span>
                      {r.dupe_match.scientific_name ? (
                        <em className="ml-1">({r.dupe_match.scientific_name})</em>
                      ) : null}
                      {" · "}qty {r.dupe_match.quantity_available ?? 0}
                      {r.dupe_match.retail_price != null ? ` · $${r.dupe_match.retail_price}` : ""}
                      {" · "}
                      {Math.round(r.dupe_match.score * 100)}% match
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <Select
                      value={r.decision}
                      onValueChange={(v) => updateRow(i, { decision: v as any })}
                    >
                      <SelectTrigger className="h-7 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="create">Create new</SelectItem>
                        <SelectItem value="merge" disabled={!r.dupe_match}>
                          Add qty to existing
                        </SelectItem>
                        <SelectItem value="skip">Skip</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      onClick={() => removeRow(i)}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-5 h-8"
                    value={r.item_name}
                    onChange={(e) => updateRow(i, { item_name: e.target.value })}
                  />
                  <Select
                    value={(r.item_type as string) ?? defaultType}
                    onValueChange={(v) => updateRow(i, { item_type: v })}
                  >
                    <SelectTrigger className="col-span-3 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ITEM_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ITEM_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    className="col-span-2 h-8"
                    value={r.quantity ?? 1}
                    onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })}
                    placeholder="Qty"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    className="col-span-2 h-8"
                    value={r.retail_price ?? ""}
                    onChange={(e) => updateRow(i, { retail_price: Number(e.target.value) })}
                    placeholder="Retail $"
                  />
                </div>
                {r.decision === "create" && (
                  <RowPhotoSlot
                    photo={rowPhotos[i]}
                    hasSharedFallback={!!bulkPhoto}
                    onPick={(f) => setRowPhoto(i, f)}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <PhotoPicker
              label={`Shared photo fallback${rowsNeedingShared().length > 0 ? ` — required for ${rowsNeedingShared().length} row(s) without their own` : " — not needed, every Create row has its own"}`}
              preview={bulkPreview}
              onPick={(f) => {
                setBulkPhoto(f);
                setBulkPreview(f ? URL.createObjectURL(f) : "");
              }}
            />
            <div className="space-y-1.5">
              <Label className="text-xs">Location for all</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="(optional)" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Vendor / source for all (optional)</Label>
            <VendorPickerCombo value={vendorId} onChange={setVendorId} />
          </div>

          <div className="text-[11px] text-muted-foreground">
            {rows.filter((r) => r.decision === "create").length} create ·{" "}
            {rows.filter((r) => r.decision === "merge").length} merge ·{" "}
            {rows.filter((r) => r.decision === "skip").length} skip
          </div>

          <DialogFooter>
            <Button onClick={saveAll} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              {saving
                ? `Saving…`
                : `Apply ${rows.filter((r) => r.decision !== "skip").length} decision(s)`}
            </Button>
          </DialogFooter>
        </>
      )}
    </div>
  );
}

function RowPhotoSlot({
  photo,
  hasSharedFallback,
  onPick,
}: {
  photo: { file: File; preview: string } | undefined;
  hasSharedFallback: boolean;
  onPick: (f: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 pt-1">
      {photo ? (
        <>
          <img src={photo.preview} alt="" className="h-10 w-10 rounded object-cover border" />
          <span className="text-[11px] text-muted-foreground truncate flex-1">
            {photo.file.name}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 text-[11px]"
            onClick={() => ref.current?.click()}
          >
            Replace
          </Button>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="text-muted-foreground hover:text-destructive p-1"
            aria-label="Remove photo"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="h-10 w-10 rounded border border-dashed bg-muted/20 flex items-center justify-center text-muted-foreground hover:bg-muted/40"
            aria-label="Add row photo"
          >
            <Camera className="w-4 h-4" />
          </button>
          <span className="text-[11px] text-muted-foreground">
            {hasSharedFallback
              ? "Will use shared photo fallback"
              : "Add a per-row photo, or set a shared fallback below"}
          </span>
        </>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function VendorPickerCombo({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContact, setNewContact] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const createVendor = useServerFn(quickCreateVendor);

  const { data: vendors } = useQuery({
    queryKey: ["vendors-active"],
    queryFn: async () =>
      (await supabase.from("vendors").select("id,name").eq("is_active", true).order("name")).data ??
      [],
    staleTime: 30_000,
  });

  const selected = vendors?.find((v: any) => v.id === value);

  useEffect(() => {
    if (showCreate) setNewName(search);
  }, [showCreate]); // eslint-disable-line

  const submitCreate = async () => {
    if (!newName.trim()) {
      toast.error("Vendor name required");
      return;
    }
    setCreating(true);
    try {
      const r = await createVendor({
        data: {
          name: newName.trim(),
          contact_name: newContact.trim() || null,
          contact_email: newEmail.trim() || null,
          contact_phone: newPhone.trim() || null,
          notes: newNotes.trim() || null,
        },
      });
      await qc.invalidateQueries({ queryKey: ["vendors-active"] });
      onChange(r.id);
      toast.success(r.deduped ? `Matched existing: ${r.name}` : `Created ${r.name}`);
      setShowCreate(false);
      setOpen(false);
      setNewName("");
      setNewContact("");
      setNewEmail("");
      setNewPhone("");
      setNewNotes("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.name : "Pick or add vendor…"}
            </span>
            <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 ml-2 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
          <Command>
            <CommandInput placeholder="Search vendors…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>No match.</CommandEmpty>
              <CommandGroup>
                {value && (
                  <CommandItem
                    value="__clear__"
                    onSelect={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    <span className="text-muted-foreground">Clear selection</span>
                  </CommandItem>
                )}
                {(vendors ?? []).map((v: any) => (
                  <CommandItem
                    key={v.id}
                    value={v.name}
                    onSelect={() => {
                      onChange(v.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "w-3.5 h-3.5 mr-2",
                        value === v.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {v.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  value="__create__"
                  onSelect={() => {
                    setShowCreate(true);
                    setOpen(false);
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-2" />
                  Add new vendor{search ? `: "${search}"` : "…"}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New vendor</DialogTitle>
            <DialogDescription>
              Quick-create a vendor so this item records its source.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Name *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Acme Aquatics"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Contact name</Label>
                <Input value={newContact} onChange={(e) => setNewContact(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={creating}>
              {creating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Create vendor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
