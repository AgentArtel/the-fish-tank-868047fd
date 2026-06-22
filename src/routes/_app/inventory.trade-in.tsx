import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import { ITEM_TYPES, ITEM_TYPE_LABELS, fmtMoney, type ItemType } from "@/lib/ops";
import { searchTradeInCustomers, recordTradeIn } from "@/lib/trade-in.functions";
import { ArrowRight, Loader2, Plus, Trash2, User, UserPlus, Search, Repeat } from "lucide-react";

export const Route = createFileRoute("/_app/inventory/trade-in")({ component: TradeInPage });

// Trade-ins land in quarantine/holding by default — show those first.
const QT_KINDS = new Set(["quarantine", "holding", "back_of_house", "support_station"]);

type Line = {
  uid: string;
  name: string;
  itemType: ItemType;
  scientificName: string;
  qty: number;
  conditionNote: string;
  creditCents: number;
};

type PickedCustomer = { id: string; name: string } | null;
type NewCustomer = { firstName: string; lastName: string; email: string; phone: string };
const EMPTY_NEW: NewCustomer = { firstName: "", lastName: "", email: "", phone: "" };

function TradeInPage() {
  const nav = useNavigate();
  const recordFn = useServerFn(recordTradeIn);

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [picked, setPicked] = useState<PickedCustomer>(null);
  const [newCust, setNewCust] = useState<NewCustomer>(EMPTY_NEW);
  const [locationId, setLocationId] = useState<string>("");
  const [showAllLocations, setShowAllLocations] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

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

  const locOptions = useMemo(() => {
    const all = (locations ?? []) as any[];
    const qt = all.filter((l) => QT_KINDS.has(l.kind));
    return showAllLocations ? all : qt.length > 0 ? qt : all;
  }, [locations, showAllLocations]);

  const totalCents = lines.reduce((s, l) => s + l.creditCents, 0);

  const newCustHasValue =
    !!newCust.firstName || !!newCust.lastName || !!newCust.email || !!newCust.phone;
  const customerReady = mode === "existing" ? !!picked : newCustHasValue;

  const newCustLabel = () =>
    [newCust.firstName, newCust.lastName].filter(Boolean).join(" ").trim() ||
    newCust.email ||
    newCust.phone ||
    "new customer";

  const addLine = (l: Line) => setLines((s) => [...s, l]);
  const removeLine = (uid: string) => setLines((s) => s.filter((l) => l.uid !== uid));

  const reset = () => {
    setPicked(null);
    setNewCust(EMPTY_NEW);
    setLines([]);
    setNote("");
  };

  const submit = async () => {
    if (!customerReady) {
      toast.error("Pick a customer or enter a new one");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    setBusy(true);
    try {
      const res = await recordFn({
        data: {
          customerId: mode === "existing" ? picked!.id : undefined,
          newCustomer:
            mode === "new"
              ? {
                  firstName: newCust.firstName.trim() || undefined,
                  lastName: newCust.lastName.trim() || undefined,
                  email: newCust.email.trim() || undefined,
                  phone: newCust.phone.trim() || undefined,
                }
              : undefined,
          locationId: locationId || undefined,
          lines: lines.map((l) => ({
            name: l.name.trim(),
            itemType: l.itemType,
            scientificName: l.scientificName.trim() || undefined,
            qty: l.qty,
            conditionNote: l.conditionNote.trim() || undefined,
            creditCents: l.creditCents,
          })),
          note: note.trim() || undefined,
        },
      });
      toast.success(
        `Trade-in recorded — ${res.itemIds.length} item${res.itemIds.length === 1 ? "" : "s"} drafted, ${fmtMoney(
          res.creditCents / 100,
        )} credit (balance ${fmtMoney(res.balanceCents / 100)})`,
      );
      const goCustomer = res.customerId;
      reset();
      if (goCustomer) nav({ to: "/customers/$id", params: { id: goCustomer } });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to record trade-in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <PageHeader
        title="Trade-in intake"
        description="Take in a customer's fish or coral, give store credit, and draft the stock for review. Pricing and going-live still happen in review — nothing here goes straight to the floor."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/inventory">
              View inventory <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
        }
      />

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Left: customer + destination */}
        <div className="space-y-5">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <User className="w-4 h-4" /> Customer
              </h2>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={mode === "existing" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setMode("existing")}
                >
                  <Search className="w-3 h-3 mr-1" /> Find
                </Button>
                <Button
                  size="sm"
                  variant={mode === "new" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setMode("new")}
                >
                  <UserPlus className="w-3 h-3 mr-1" /> New
                </Button>
              </div>
            </div>

            {mode === "existing" ? (
              <CustomerSearch picked={picked} onPick={setPicked} />
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="First name"
                    value={newCust.firstName}
                    onChange={(e) => setNewCust({ ...newCust, firstName: e.target.value })}
                  />
                  <Input
                    placeholder="Last name"
                    value={newCust.lastName}
                    onChange={(e) => setNewCust({ ...newCust, lastName: e.target.value })}
                  />
                </div>
                <Input
                  placeholder="Phone"
                  value={newCust.phone}
                  onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                />
                <Input
                  placeholder="Email"
                  type="email"
                  value={newCust.email}
                  onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                />
                {newCustHasValue && (
                  <p className="text-[11px] text-muted-foreground">
                    New customer <span className="font-medium">{newCustLabel()}</span> will be
                    created and credited.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Destination</h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowAllLocations((s) => !s)}
              >
                {showAllLocations ? "Quarantine only" : "Show all locations"}
              </Button>
            </div>
            <Select
              value={locationId || "none"}
              onValueChange={(v) => setLocationId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose where it goes…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Unassigned —</SelectItem>
                {locOptions.map((l: any) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.location_code ? `${l.location_code} — ` : ""}
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Trade-ins should go to quarantine/holding until cleared. Optional — you can place it
              in review later.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-2">
            <Label className="text-xs">Trade-in note (optional)</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why they traded in, agreed terms, anything for review…"
            />
          </div>
        </div>

        {/* Right: line capture + list + total */}
        <div className="space-y-5">
          <LineForm onAdd={addLine} />

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Items ({lines.length})</h2>
              <div className="text-sm">
                Credit total:{" "}
                <span className="font-semibold tabular-nums">{fmtMoney(totalCents / 100)}</span>
              </div>
            </div>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add the fish/coral the customer is trading in. Each line gets its own draft
                inventory item; the credit total is what they walk out with.
              </p>
            ) : (
              <ul className="space-y-2">
                {lines.map((l) => (
                  <li
                    key={l.uid}
                    className="flex items-center gap-2 text-sm border-b last:border-0 pb-2 last:pb-0"
                  >
                    <Badge variant="outline" className="font-normal text-[10px] shrink-0">
                      {ITEM_TYPE_LABELS[l.itemType] ?? l.itemType}
                    </Badge>
                    <span className="flex-1 min-w-0 truncate">
                      {l.name}
                      {l.scientificName && (
                        <span className="italic text-muted-foreground"> · {l.scientificName}</span>
                      )}
                      {l.conditionNote && (
                        <span className="text-muted-foreground"> · {l.conditionNote}</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">×{l.qty}</span>
                    <span className="tabular-nums font-medium">
                      {fmtMoney(l.creditCents / 100)}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => removeLine(l.uid)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Store credit to grant</span>
              <span className="text-lg font-semibold tabular-nums">
                {fmtMoney(totalCents / 100)}
              </span>
            </div>
            <Button
              className="w-full"
              disabled={busy || !customerReady || lines.length === 0}
              onClick={submit}
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Recording…
                </>
              ) : (
                <>
                  <Repeat className="w-4 h-4 mr-1" /> Record trade-in
                </>
              )}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Creates draft inventory (Incoming, unpriced) and grants the credit in one step.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerSearch({
  picked,
  onPick,
}: {
  picked: PickedCustomer;
  onPick: (c: PickedCustomer) => void;
}) {
  const searchFn = useServerFn(searchTradeInCustomers);
  const [q, setQ] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["trade-in-customer-search", q],
    queryFn: () => searchFn({ data: { q: q.trim() || undefined } }),
    staleTime: 10_000,
  });

  if (picked) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2.5">
        <User className="w-4 h-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium truncate">{picked.name}</span>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onPick(null)}>
          Change
        </Button>
      </div>
    );
  }

  const rows = data?.rows ?? [];
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search name, phone, or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="max-h-56 overflow-auto rounded-md border divide-y">
        {isFetching && rows.length === 0 ? (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
          </div>
        ) : rows.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">
            No matches. Switch to “New” to create the customer.
          </p>
        ) : (
          rows.map(
            (c: { id: string; name: string; email: string | null; phone: string | null }) => (
              <button
                key={c.id}
                className="w-full text-left p-2.5 text-sm hover:bg-muted/40"
                onClick={() => onPick({ id: c.id, name: c.name })}
              >
                <div className="font-medium truncate">{c.name}</div>
                {(c.phone || c.email) && (
                  <div className="text-xs text-muted-foreground truncate">
                    {[c.phone, c.email].filter(Boolean).join(" · ")}
                  </div>
                )}
              </button>
            ),
          )
        )}
      </div>
    </div>
  );
}

function LineForm({ onAdd }: { onAdd: (l: Line) => void }) {
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<ItemType>("fish");
  const [sci, setSci] = useState("");
  const [qty, setQty] = useState("1");
  const [condition, setCondition] = useState("");
  const [credit, setCredit] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  const add = () => {
    if (!name.trim()) {
      toast.error("Item name is required");
      return;
    }
    const creditNum = Number(credit);
    if (credit.trim() === "" || Number.isNaN(creditNum) || creditNum < 0) {
      toast.error("Enter the credit amount for this item");
      return;
    }
    onAdd({
      uid: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      itemType,
      scientificName: sci.trim(),
      qty: Math.max(1, parseInt(qty || "1", 10) || 1),
      conditionNote: condition.trim(),
      creditCents: Math.round(creditNum * 100),
    });
    setName("");
    setSci("");
    setQty("1");
    setCondition("");
    setCredit("");
    nameRef.current?.focus();
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-1.5">
        <Plus className="w-4 h-4 text-primary" /> Add an item
      </h2>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Item name *</Label>
          <Input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ocellaris Clownfish"
          />
        </div>
        <div className="space-y-1 w-32">
          <Label className="text-xs">Type</Label>
          <Select value={itemType} onValueChange={(v) => setItemType(v as ItemType)}>
            <SelectTrigger className="h-9">
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
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Scientific name</Label>
        <Input value={sci} onChange={(e) => setSci(e.target.value)} placeholder="optional" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Quantity</Label>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Credit for this item ($) *</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Condition</Label>
        <Input
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          placeholder="Health, size, color — for review"
        />
      </div>
      <Button variant="outline" className="w-full" onClick={add}>
        <Plus className="w-4 h-4 mr-1" /> Add to trade-in
      </Button>
    </div>
  );
}
