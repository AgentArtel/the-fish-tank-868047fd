import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OpsBadge, availabilityTone } from "@/components/ops-badge";
import { INVENTORY_AVAILABILITY_LABELS, fmtMoney } from "@/lib/ops";
import { catalogCoralItem, getCoralDiscoveryOverview } from "@/lib/ops.functions";
import { Camera, Loader2, Waves, ArrowRight, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/inventory/coral-discovery")({
  component: CoralDiscoveryPage,
});

// Location kinds that hold corals — shown first in the system picker.
const CORAL_KINDS = new Set([
  "coral_system",
  "coral_flat",
  "frag_tank",
  "growout_tank",
  "live_sale_tank",
  "display_tank",
]);

const ROLES = ["for_sale", "growout", "mother_colony", "frag_source", "hold"] as const;
const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  for_sale: "For sale",
  growout: "Growout",
  mother_colony: "Mother colony",
  frag_source: "Frag source",
  hold: "Hold",
};
const CORAL_TYPES = ["SPS", "LPS", "soft", "zoanthid", "mushroom", "anemone"] as const;

type SessionEntry = {
  id: string;
  locationId: string;
  name: string;
  role: string;
  qty: number;
  availability: string;
  position?: string | null;
};

async function uploadDiscoveryPhoto(file: File) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `coral-discovery/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("inventory-media")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw error;
  return { path, fileName: file.name };
}

function CoralDiscoveryPage() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getCoralDiscoveryOverview);
  const catalogFn = useServerFn(catalogCoralItem);

  const { data: overview } = useQuery({
    queryKey: ["coral-discovery-overview"],
    queryFn: () => overviewFn(),
    staleTime: 15_000,
  });

  const [locationId, setLocationId] = useState<string>("");
  const [showAll, setShowAll] = useState(false);
  const [session, setSession] = useState<SessionEntry[]>([]);

  const locations = (overview?.locations ?? []) as any[];
  const counts = (overview?.countsByLocation ?? {}) as Record<
    string,
    { total: number; roles: Record<string, number> }
  >;

  // Coral systems first, then everything else (behind a toggle).
  const coralSystems = useMemo(() => locations.filter((l) => CORAL_KINDS.has(l.kind)), [locations]);
  const pickerOptions = showAll ? locations : coralSystems;

  // Default the picker to the first coral system (e.g. C-40100) once loaded.
  const effectiveLocationId = locationId || coralSystems[0]?.id || "";
  const selected = locations.find((l) => l.id === effectiveLocationId);
  const selectedCounts = counts[effectiveLocationId];

  const recentHere = useMemo(
    () => ((overview?.recent ?? []) as any[]).filter((c) => c.location_id === effectiveLocationId),
    [overview, effectiveLocationId],
  );

  const positionsByLocation = (overview?.positionsByLocation ?? {}) as Record<string, string[]>;
  // Plugs already used in the selected system (plus anything logged this session)
  // so the form can flag a double-tagged plug before it happens.
  const usedPositions = useMemo(() => {
    const set = new Set<string>(
      (positionsByLocation[effectiveLocationId] ?? []).map((p) => p.toUpperCase()),
    );
    for (const e of session) {
      if (e.position && e.locationId === effectiveLocationId) set.add(e.position.toUpperCase());
    }
    return set;
  }, [positionsByLocation, effectiveLocationId, session]);

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <PageHeader
        title="Coral Discovery"
        description="Catalog the corals already in the building, one system at a time. Entries are saved as drafts — pricing and going-live still happen in review."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/inventory" search={{ type: "coral" }}>
              View coral stock <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        }
      />

      {/* System picker */}
      <div className="rounded-lg border bg-card p-4 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs flex items-center gap-1.5">
              <Waves className="w-3.5 h-3.5" /> Coral system
            </Label>
            <Select value={effectiveLocationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a system…" />
              </SelectTrigger>
              <SelectContent>
                {pickerOptions.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">No locations found.</div>
                )}
                {pickerOptions.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.location_code ? `${l.location_code} — ` : ""}
                    {l.name}
                    {counts[l.id]?.total ? `  (${counts[l.id].total})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Coral systems only" : "Show all locations"}
          </Button>
        </div>

        {selected && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">In this system:</span>
            <Badge variant="secondary">
              {selectedCounts?.total ?? 0} coral{(selectedCounts?.total ?? 0) === 1 ? "" : "s"}
            </Badge>
            {Object.entries(selectedCounts?.roles ?? {}).map(([role, n]) => (
              <Badge key={role} variant="outline" className="font-normal">
                {ROLE_LABELS[role as (typeof ROLES)[number]] ?? role}: {n}
              </Badge>
            ))}
            {usedPositions.size > 0 && (
              <Badge variant="outline" className="font-normal">
                {usedPositions.size} plug{usedPositions.size === 1 ? "" : "s"} tagged
              </Badge>
            )}
            <Link
              to="/inventory"
              search={{ location: effectiveLocationId, type: "coral" }}
              className="text-xs text-primary hover:underline ml-auto"
            >
              Open in inventory →
            </Link>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Capture form */}
        <CoralCaptureForm
          locationId={effectiveLocationId}
          disabled={!effectiveLocationId}
          usedPositions={usedPositions}
          onSaved={(entry) => {
            setSession((s) => [entry, ...s]);
            qc.invalidateQueries({ queryKey: ["coral-discovery-overview"] });
          }}
          catalogFn={catalogFn}
        />

        {/* Session log + already-here */}
        <div className="space-y-5">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Logged this session ({session.length})</h2>
            {session.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet. Saved corals appear here so you can keep a running count as you work
                the tank.
              </p>
            ) : (
              <ul className="space-y-2">
                {session.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-2 text-sm border-b last:border-0 pb-2 last:pb-0"
                  >
                    {e.position && (
                      <Badge className="font-mono text-[10px] shrink-0">{e.position}</Badge>
                    )}
                    <Link
                      to="/inventory/$id"
                      params={{ id: e.id }}
                      className="font-medium hover:underline flex-1 truncate"
                    >
                      {e.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">×{e.qty}</span>
                    <Badge variant="outline" className="font-normal text-[10px]">
                      {ROLE_LABELS[e.role as (typeof ROLES)[number]] ?? e.role}
                    </Badge>
                    <OpsBadge
                      label={
                        INVENTORY_AVAILABILITY_LABELS[
                          e.availability as keyof typeof INVENTORY_AVAILABILITY_LABELS
                        ] ?? e.availability
                      }
                      tone={availabilityTone(e.availability)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {recentHere.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Already in this system</h2>
              <ul className="space-y-2">
                {recentHere.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 text-sm border-b last:border-0 pb-2 last:pb-0"
                  >
                    {c.attrs?.rack_position && (
                      <Badge className="font-mono text-[10px] shrink-0">
                        {c.attrs.rack_position}
                      </Badge>
                    )}
                    <Link
                      to="/inventory/$id"
                      params={{ id: c.id }}
                      className="font-medium hover:underline flex-1 truncate"
                    >
                      {c.item_name}
                      {c.scientific_name && (
                        <span className="italic text-muted-foreground font-normal">
                          {" "}
                          · {c.scientific_name}
                        </span>
                      )}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {fmtMoney(c.retail_price)}
                    </span>
                    <OpsBadge
                      label={
                        INVENTORY_AVAILABILITY_LABELS[
                          c.availability_status as keyof typeof INVENTORY_AVAILABILITY_LABELS
                        ] ?? c.availability_status
                      }
                      tone={availabilityTone(c.availability_status)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CoralCaptureForm({
  locationId,
  disabled,
  usedPositions,
  onSaved,
  catalogFn,
}: {
  locationId: string;
  disabled: boolean;
  usedPositions: Set<string>;
  onSaved: (entry: SessionEntry) => void;
  catalogFn: ReturnType<typeof useServerFn<typeof catalogCoralItem>>;
}) {
  const [name, setName] = useState("");
  const [sci, setSci] = useState("");
  const [rackPos, setRackPos] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("for_sale");
  const [coralType, setCoralType] = useState<string>("");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const normPos = rackPos.trim().toUpperCase();
  const positionTaken = normPos.length > 0 && usedPositions.has(normPos);

  const pickPhoto = (f: File | undefined | null) => {
    if (!f) return;
    setPhoto({ file: f, preview: URL.createObjectURL(f) });
  };

  const reset = (keepClassifiers: boolean) => {
    setName("");
    setSci("");
    setRackPos(""); // each coral gets its own plug — never carry it over
    setPrice("");
    setQty("1");
    setNotes("");
    setPhoto(null);
    if (!keepClassifiers) {
      setRole("for_sale");
      setCoralType("");
    }
    nameRef.current?.focus();
  };

  const save = async () => {
    if (!locationId) {
      toast.error("Pick a coral system first");
      return;
    }
    if (!name.trim()) {
      toast.error("Coral name is required");
      return;
    }
    setBusy(true);
    try {
      let photoPath: string | undefined;
      let photoFileName: string | undefined;
      if (photo) {
        const up = await uploadDiscoveryPhoto(photo.file);
        photoPath = up.path;
        photoFileName = up.fileName;
      }
      const priceNum = price.trim() === "" ? null : Number(price);
      const res = await catalogFn({
        data: {
          location_id: locationId,
          item_name: name.trim(),
          scientific_name: sci.trim() || null,
          rack_position: normPos || null,
          inventory_role: role,
          coral_type: (coralType || null) as any,
          retail_price: priceNum != null && !Number.isNaN(priceNum) ? priceNum : null,
          quantity: Math.max(1, parseInt(qty || "1", 10) || 1),
          notes: notes.trim() || null,
          photo_path: photoPath ?? null,
          photo_file_name: photoFileName ?? null,
        },
      });
      onSaved({
        id: res.inventoryItemId,
        locationId,
        name: name.trim(),
        role,
        qty: Math.max(1, parseInt(qty || "1", 10) || 1),
        availability: res.availability_status,
        position: res.rack_position,
      });
      toast.success(
        `Saved "${name.trim()}"${res.rack_position ? ` @ ${res.rack_position}` : ""}${res.needs_photo ? " — add a photo later" : ""}`,
      );
      reset(true); // keep role + type for fast repeated entry down a rack
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Plus className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Log a coral</h2>
      </div>

      {/* Photo */}
      {photo ? (
        <div className="relative rounded-md border overflow-hidden">
          <img src={photo.preview} alt="" className="w-full max-h-56 object-contain bg-muted" />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="absolute top-2 right-2"
            onClick={() => setPhoto(null)}
          >
            Retake
          </Button>
        </div>
      ) : (
        <label className="block rounded-md border-2 border-dashed border-muted-foreground/30 p-5 text-center cursor-pointer hover:bg-muted/30">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => pickPhoto(e.target.files?.[0])}
          />
          <Camera className="w-7 h-7 mx-auto text-muted-foreground" />
          <div className="text-sm mt-1.5">Tap to photograph the coral</div>
          <div className="text-xs text-muted-foreground">
            Optional — you can add it later, but corals can't go live without one
          </div>
        </label>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Coral name *</Label>
          <Input
            ref={nameRef}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rainbow Hornet Acan"
          />
        </div>
        <div className="space-y-1 w-28">
          <Label className="text-xs">Plug / rack tag</Label>
          <Input
            value={rackPos}
            onChange={(e) => setRackPos(e.target.value)}
            placeholder="B3"
            className={`font-mono uppercase ${positionTaken ? "border-amber-500 focus-visible:ring-amber-500" : ""}`}
          />
        </div>
      </div>
      {positionTaken && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400 -mt-1">
          Plug <span className="font-mono font-semibold">{normPos}</span> is already tagged in this
          system. Double-check you're not logging the same coral twice.
        </p>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Scientific name</Label>
        <Input
          value={sci}
          onChange={(e) => setSci(e.target.value)}
          placeholder="e.g. Acanthastrea lordhowensis"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Inventory role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as (typeof ROLES)[number])}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={coralType || "__none__"}
            onValueChange={(v) => setCoralType(v === "__none__" ? "" : v)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              {CORAL_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Price (if known)</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Quantity / frags</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Health, lineage, placement…"
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        {role === "for_sale"
          ? "Saved as a draft (Incoming) with price unapproved — an admin reviews pricing before it goes live."
          : "Saved as Not for sale / On hold with its role recorded. Customers won't see it."}
      </p>

      <div className="flex gap-2 pt-1">
        <Button onClick={save} disabled={busy || disabled} className="flex-1">
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…
            </>
          ) : (
            "Save & next"
          )}
        </Button>
        <Button variant="outline" onClick={() => reset(false)} disabled={busy}>
          Clear
        </Button>
      </div>
    </div>
  );
}
