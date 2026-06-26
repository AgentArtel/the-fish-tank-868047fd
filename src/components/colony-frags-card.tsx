import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fmtMoney } from "@/lib/ops";
import { cutFragsFromColony, getColonyRollup } from "@/lib/ops.functions";
import { Scissors, Plus, Trash2, Loader2 } from "lucide-react";

const money = (cents: number) => fmtMoney(Number(cents ?? 0) / 100);

type FragRow = { uid: string; name: string; rack: string; heads: string; price: string };
const newRow = (): FragRow => ({
  uid: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: "",
  rack: "",
  heads: "",
  price: "",
});

// Shows on a coral COLONY only: per-colony sell-down + a "Cut frags" dialog that
// creates linked frag listings (auto-priced from the colony's per-head rate).
export function ColonyFragsCard({ item, onDone }: { item: any; onDone: () => void }) {
  const isColony = item.item_type === "coral" && (item.attrs ?? {}).stock_mode === "colony";
  const perHeadCents = Number((item.attrs ?? {}).price_per_head_cents ?? 0);
  const rollupFn = useServerFn(getColonyRollup);
  const { data: rollup } = useQuery({
    queryKey: ["colony-rollup", item.id],
    queryFn: () => rollupFn({ data: { colonyId: item.id } }),
    enabled: isColony,
  });

  if (!isColony) return null;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Colony — frags &amp; sell-down</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cut frags off this colony (it never counts down).{" "}
            {perHeadCents > 0
              ? `Frags auto-price at ${money(perHeadCents)}/head.`
              : "Set a $/head rate on this colony to auto-price its frags."}
          </p>
        </div>
        <CutFragsDialog colonyId={item.id} perHeadCents={perHeadCents} onDone={onDone} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Frags listed" value={String(rollup?.fragsListed ?? 0)} />
        <Stat label="Sold" value={String(rollup?.fragsSold ?? 0)} />
        <Stat label="Remaining" value={String(rollup?.fragsRemaining ?? 0)} />
        <Stat label="Revenue" value={money(rollup?.revenueCents ?? 0)} />
      </div>
      {(rollup?.estRemainingCents ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          Est. value still on the rack: {money(rollup!.estRemainingCents)}
        </p>
      )}

      {(rollup?.frags?.length ?? 0) > 0 && (
        <div className="rounded-md border divide-y">
          {rollup!.frags.map((f: any) => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              {f.rackPosition && (
                <Badge className="font-mono text-[10px] shrink-0">{f.rackPosition}</Badge>
              )}
              <Link
                to="/inventory/$id"
                params={{ id: f.id }}
                className="flex-1 min-w-0 truncate font-medium hover:underline"
              >
                {f.itemName}
              </Link>
              <span className="text-xs tabular-nums">{fmtMoney(f.retailPrice)}</span>
              <Badge
                variant="outline"
                className={`text-[10px] ${f.quantityAvailable > 0 ? "" : "text-muted-foreground"}`}
              >
                {f.quantityAvailable > 0 ? "available" : "sold"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function CutFragsDialog({
  colonyId,
  perHeadCents,
  colonyName,
  onDone,
  open: openProp,
  onOpenChange,
  withTrigger = true,
}: {
  colonyId: string;
  perHeadCents: number;
  colonyName?: string;
  onDone: () => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  withTrigger?: boolean;
}) {
  const qc = useQueryClient();
  const cutFn = useServerFn(cutFragsFromColony);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [rows, setRows] = useState<FragRow[]>([newRow()]);
  const [busy, setBusy] = useState(false);

  const autoPrice = (r: FragRow) => {
    const h = parseInt(r.heads || "0", 10) || 0;
    return h > 0 && perHeadCents > 0 ? (h * perHeadCents) / 100 : null;
  };

  const submit = async () => {
    const frags = rows
      .filter((r) => r.name.trim() && r.rack.trim())
      .map((r) => {
        const heads = parseInt(r.heads || "0", 10) || 0;
        const override = r.price.trim() === "" ? null : Number(r.price);
        return {
          item_name: r.name.trim(),
          rack_position: r.rack.trim(),
          head_count: heads > 0 ? heads : null,
          retail_price: override != null && !Number.isNaN(override) ? override : null,
        };
      });
    if (frags.length === 0) {
      toast.error("Add at least one frag with a name and rack tag");
      return;
    }
    setBusy(true);
    try {
      const res = await cutFn({ data: { colonyId, frags } });
      toast.success(`Cut ${res.count} frag${res.count === 1 ? "" : "s"} from the colony`);
      qc.invalidateQueries({ queryKey: ["colony-rollup", colonyId] });
      setRows([newRow()]);
      setOpen(false);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to cut frags");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {withTrigger && (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Scissors className="w-4 h-4 mr-1" /> Cut frags
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {colonyName ? `Cut frags from ${colonyName}` : "Cut frags from this colony"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Each frag becomes its own listing linked to this colony.{" "}
          {perHeadCents > 0
            ? `Price auto-fills at ${money(perHeadCents)}/head — override any row.`
            : "No per-head rate set on the colony, so enter each price."}
        </p>

        <div className="space-y-2">
          <div className="hidden sm:grid grid-cols-[1fr_5rem_4rem_6rem_2rem] gap-2 text-[10px] uppercase tracking-wide text-muted-foreground px-1">
            <span>Frag name</span>
            <span>Rack tag</span>
            <span>Heads</span>
            <span>Price</span>
            <span />
          </div>
          {rows.map((r) => {
            const auto = autoPrice(r);
            return (
              <div
                key={r.uid}
                className="grid grid-cols-2 sm:grid-cols-[1fr_5rem_4rem_6rem_2rem] gap-2 items-center"
              >
                <Input
                  placeholder="e.g. Rainbow Hornet"
                  value={r.name}
                  onChange={(e) =>
                    setRows((s) =>
                      s.map((x) => (x.uid === r.uid ? { ...x, name: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  placeholder="B3"
                  className="font-mono uppercase"
                  value={r.rack}
                  onChange={(e) =>
                    setRows((s) =>
                      s.map((x) => (x.uid === r.uid ? { ...x, rack: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="heads"
                  value={r.heads}
                  onChange={(e) =>
                    setRows((s) =>
                      s.map((x) => (x.uid === r.uid ? { ...x, heads: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  placeholder={auto != null ? fmtMoney(auto) : "$"}
                  value={r.price}
                  onChange={(e) =>
                    setRows((s) =>
                      s.map((x) => (x.uid === r.uid ? { ...x, price: e.target.value } : x)),
                    )
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  disabled={rows.length === 1}
                  onClick={() => setRows((s) => s.filter((x) => x.uid !== r.uid))}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
          <Button size="sm" variant="ghost" onClick={() => setRows((s) => [...s, newRow()])}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add frag
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Cutting…
              </>
            ) : (
              <>
                <Scissors className="w-4 h-4 mr-1" /> Cut frags
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
