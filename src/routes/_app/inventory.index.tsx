import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { OpsBadge, availabilityTone, liveSaleTone, pricingTone } from "@/components/ops-badge";
import {
  INVENTORY_AVAILABILITY,
  INVENTORY_AVAILABILITY_LABELS,
  INVENTORY_REVIEW_STATUSES,
  INVENTORY_LIVE_SALE,
  INVENTORY_LIVE_SALE_LABELS,
  INVENTORY_PRICING_LABELS,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  type ItemType,
  fmtMoney,
} from "@/lib/ops";
import { setInventoryAvailability, setInventoryLiveSale } from "@/lib/ops.functions";
import { PhotoOnFileWizard, inventoryHasPhoto } from "@/components/photo-on-file-wizard";
import { InventoryReviewWizard } from "@/components/inventory-review-wizard";
import { QuickAddButton } from "@/components/quick-add-fab";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PackagePlus, Tag, X, ClipboardCheck } from "lucide-react";
import { z } from "zod";

const searchSchema = z.object({
  location: z.string().uuid().optional(),
  descendants: z
    .union([z.literal("1"), z.literal("0"), z.boolean()])
    .optional()
    .transform((v) => (v === "1" || v === true ? true : undefined)),
  type: z.enum(ITEM_TYPES).optional(),
});

export const Route = createFileRoute("/_app/inventory/")({
  component: InventoryPage,
  validateSearch: (s) => searchSchema.parse(s),
});

const SORTS: Record<string, { column: string; ascending: boolean }> = {
  updated: { column: "updated_at", ascending: false },
  name: { column: "item_name", ascending: true },
  qty: { column: "quantity_available", ascending: false },
  price: { column: "retail_price", ascending: false },
};
const SORT_LABELS: Record<string, string> = {
  updated: "Recently updated",
  name: "Name (A–Z)",
  qty: "Quantity (high→low)",
  price: "Price (high→low)",
};

// Render in pages — the catalog can be ~1000+ rows and each row mounts several
// dropdowns, so rendering them all at once freezes the browser. Filters/search are
// server-side; this paginates the rendered result.
const PAGE_SIZE = 50;

function InventoryPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("updated");
  const [reviewOpen, setReviewOpen] = useState(false);
  const { location: locationId, descendants, type } = Route.useSearch();
  const nav = useNavigate({ from: "/inventory" });
  const qc = useQueryClient();
  const me = useMe();
  const isAdmin = (me.data?.roles ?? []).includes("admin");

  const { data: allLocations } = useQuery({
    queryKey: ["all-locations"],
    queryFn: async () =>
      (
        await supabase
          .from("store_locations")
          .select("id,name,is_live_sale,parent_location_id")
          .eq("is_active", true)
          .order("name")
      ).data ?? [],
    staleTime: 60_000,
  });

  const locationName = useMemo(
    () => allLocations?.find((l: any) => l.id === locationId)?.name ?? null,
    [allLocations, locationId],
  );

  const locationIds = useMemo(() => {
    if (!locationId) return null;
    if (!descendants || !allLocations) return [locationId];
    const byParent: Record<string, string[]> = {};
    for (const l of allLocations as any[]) {
      if (l.parent_location_id) (byParent[l.parent_location_id] ||= []).push(l.id);
    }
    const ids = new Set<string>([locationId]);
    const stack = [locationId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const c of byParent[cur] ?? [])
        if (!ids.has(c)) {
          ids.add(c);
          stack.push(c);
        }
    }
    return Array.from(ids);
  }, [locationId, descendants, allLocations]);

  const { data } = useQuery({
    queryKey: ["inventory", q, statusFilter, sort, locationIds, type],
    queryFn: async () => {
      const s = SORTS[sort] ?? SORTS.updated;
      let query = supabase
        .from("inventory_items")
        .select(
          "id, item_name, scientific_name, size, attrs, item_type, location_id, retail_price, pricing_status, availability_status, live_sale_status, quantity_available, quantity_received, quantity_on_hold, quantity_sold, quantity_lost, vendors(name)",
        )
        .order(s.column, { ascending: s.ascending })
        .limit(2000);
      if (statusFilter === "needs_review")
        query = query.in("availability_status", INVENTORY_REVIEW_STATUSES);
      else if (statusFilter !== "all") query = query.eq("availability_status", statusFilter as any);
      if (q) query = query.ilike("item_name", `%${q}%`);
      if (type) query = query.eq("item_type", type);
      if (locationIds) query = query.in("location_id", locationIds);
      return (await query).data ?? [];
    },
    enabled: locationId ? !!allLocations : true,
  });

  // Paginate the rendered rows (filters run server-side; this just caps the DOM).
  const [page, setPage] = useState(0);
  const rows = data ?? [];
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  useEffect(() => {
    setPage(0);
  }, [q, statusFilter, sort, type, locationId, descendants]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["inventory"] });

  const clearLocation = () =>
    nav({ search: (prev: any) => ({ ...prev, location: undefined, descendants: undefined }) });
  const clearType = () => nav({ search: (prev: any) => ({ ...prev, type: undefined }) });
  const toggleDescendants = () =>
    nav({ search: (prev: any) => ({ ...prev, descendants: descendants ? undefined : true }) });

  const hasActiveFilters = !!locationId || !!type;
  const showPlug = type === "coral";

  return (
    <div className="p-8">
      <PageHeader
        title="Inventory"
        description="Store inventory created from approved vendor line items."
      />
      <div className="flex gap-2 mb-4 items-center flex-wrap">
        <Input
          placeholder="Search item name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="max-w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All availability</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
            {INVENTORY_AVAILABILITY.map((s) => (
              <SelectItem key={s} value={s}>
                {INVENTORY_AVAILABILITY_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="max-w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(SORTS).map((k) => (
              <SelectItem key={k} value={k}>
                {SORT_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{data?.length ?? 0} items</span>
        <div className="ml-auto flex gap-2">
          {isAdmin && (
            <Button size="sm" onClick={() => setReviewOpen(true)}>
              <ClipboardCheck className="w-4 h-4 mr-1" /> Review stock
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link to="/inventory/missing-tags">
              <Tag className="w-4 h-4 mr-1" /> Missing tags
            </Link>
          </Button>
          <QuickAddButton size="sm">Quick Add</QuickAddButton>
        </div>
      </div>
      {isAdmin && (
        <InventoryReviewWizard
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          locations={allLocations ?? []}
          onChanged={refresh}
        />
      )}
      {hasActiveFilters && (
        <div className="flex gap-2 mb-4 items-center flex-wrap">
          <span className="text-xs text-muted-foreground">Filters:</span>
          {locationId && (
            <>
              <Badge variant="secondary" className="gap-1">
                Location: {locationName ?? "…"}
                {descendants && <span className="text-muted-foreground">+ sub-locations</span>}
                <button
                  onClick={clearLocation}
                  className="ml-1 hover:text-destructive"
                  aria-label="Clear location filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={toggleDescendants}>
                {descendants ? "Exact location only" : "Include sub-locations"}
              </Button>
            </>
          )}
          {type && (
            <Badge variant="secondary" className="gap-1">
              Type: {ITEM_TYPE_LABELS[type as ItemType]}
              <button
                onClick={clearType}
                className="ml-1 hover:text-destructive"
                aria-label="Clear type filter"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Item</th>
              {showPlug && <th className="p-3">Plug</th>}
              <th className="p-3">Vendor</th>
              <th className="p-3">Qty</th>
              <th className="p-3">Retail</th>
              <th className="p-3">Pricing</th>
              <th className="p-3">Location</th>
              <th className="p-3">Availability</th>
              <th className="p-3">Live sale</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((i: any) => (
              <InventoryRow
                key={i.id}
                item={i}
                locations={allLocations ?? []}
                showPlug={showPlug}
                onDone={refresh}
              />
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={showPlug ? 9 : 8} className="p-10">
                  <div className="flex flex-col items-center text-center gap-3">
                    <PackagePlus className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <div className="font-medium">
                        {hasActiveFilters
                          ? "No items match the current filters"
                          : "No inventory yet"}
                      </div>
                      <div className="text-sm text-muted-foreground max-w-md">
                        {hasActiveFilters
                          ? "Try clearing a filter, or include sub-locations if this is a zone."
                          : "Add items as you restock with Quick Add, or convert a vendor batch for a full intake run."}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {hasActiveFilters ? (
                        <Button size="sm" variant="outline" onClick={() => nav({ search: {} })}>
                          Clear filters
                        </Button>
                      ) : (
                        <>
                          <QuickAddButton size="sm">Quick add an item</QuickAddButton>
                          <Button asChild size="sm" variant="outline">
                            <Link to="/batches">Open vendor batches</Link>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 mt-3 text-sm">
          <span className="text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of{" "}
            {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} / {pageCount}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryRow({
  item,
  locations,
  showPlug,
  onDone,
}: {
  item: any;
  locations: any[];
  showPlug?: boolean;
  onDone: () => void;
}) {
  const setAvail = useServerFn(setInventoryAvailability);
  const setLive = useServerFn(setInventoryLiveSale);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pendingAvail, setPendingAvail] = useState<string | null>(null);

  const setLocation = async (locationId: string) => {
    const { error } = await supabase
      .from("inventory_items")
      .update({ location_id: locationId === "none" ? null : locationId })
      .eq("id", item.id);
    if (error) toast.error(error.message);
    else onDone();
  };
  const applyAvail = async (s: string) => {
    try {
      await setAvail({ data: { id: item.id, status: s as any } });
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const changeAvail = async (s: string) => {
    if (s === "available") {
      const hasPhoto = await inventoryHasPhoto(item.id);
      if (!hasPhoto) {
        setPendingAvail(s);
        setWizardOpen(true);
        return;
      }
    }
    applyAvail(s);
  };
  const changeLive = async (s: string) => {
    try {
      await setLive({ data: { id: item.id, status: s as any } });
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="p-3">
        <Link to="/inventory/$id" params={{ id: item.id }} className="font-medium hover:underline">
          {item.item_name}
        </Link>
        {item.scientific_name && (
          <div className="text-xs italic text-muted-foreground">{item.scientific_name}</div>
        )}
        {item.size && <div className="text-xs text-muted-foreground">{item.size}</div>}
      </td>
      {showPlug && (
        <td className="p-3">
          {item.attrs?.rack_position ? (
            <Badge className="font-mono text-[10px]">{item.attrs.rack_position}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      )}
      <td className="p-3 text-muted-foreground">{item.vendors?.name ?? "—"}</td>
      <td className="p-3 text-xs">
        <div>
          Avail: <span className="font-medium">{item.quantity_available}</span>
        </div>
        <div className="text-muted-foreground">
          Recv {item.quantity_received} · Hold {item.quantity_on_hold} · Sold {item.quantity_sold} ·
          Lost {item.quantity_lost}
        </div>
      </td>
      <td className="p-3">{fmtMoney(item.retail_price)}</td>
      <td className="p-3">
        <OpsBadge
          label={
            INVENTORY_PRICING_LABELS[item.pricing_status as keyof typeof INVENTORY_PRICING_LABELS]
          }
          tone={pricingTone(item.pricing_status)}
        />
      </td>
      <td className="p-3">
        <Select value={item.location_id ?? "none"} onValueChange={setLocation}>
          <SelectTrigger className="h-7 text-xs w-[150px]">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {locations.map((l: any) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
                {l.is_live_sale ? " ★" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-3">
        <Select value={item.availability_status} onValueChange={changeAvail}>
          <SelectTrigger className="h-7 text-xs w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVENTORY_AVAILABILITY.map((s) => (
              <SelectItem key={s} value={s}>
                {INVENTORY_AVAILABILITY_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-1">
          <OpsBadge
            label={
              INVENTORY_AVAILABILITY_LABELS[
                item.availability_status as keyof typeof INVENTORY_AVAILABILITY_LABELS
              ]
            }
            tone={availabilityTone(item.availability_status)}
          />
        </div>
        <PhotoOnFileWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          inventoryItemId={item.id}
          itemName={item.item_name}
          onUploaded={async () => {
            if (pendingAvail) {
              await applyAvail(pendingAvail);
              setPendingAvail(null);
            }
          }}
        />
      </td>
      <td className="p-3">
        <Select value={item.live_sale_status} onValueChange={changeLive}>
          <SelectTrigger className="h-7 text-xs w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INVENTORY_LIVE_SALE.map((s) => (
              <SelectItem key={s} value={s}>
                {INVENTORY_LIVE_SALE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-1">
          <OpsBadge
            label={
              INVENTORY_LIVE_SALE_LABELS[
                item.live_sale_status as keyof typeof INVENTORY_LIVE_SALE_LABELS
              ]
            }
            tone={liveSaleTone(item.live_sale_status)}
          />
        </div>
      </td>
    </tr>
  );
}
