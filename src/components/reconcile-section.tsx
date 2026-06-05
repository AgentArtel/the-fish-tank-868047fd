import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { computeQuickAddReconciliation, confirmReconciliation, promoteQuickAddBatchVendor } from "@/lib/ops.functions";
import { fmtMoney } from "@/lib/ops";
import { GitMerge, Search, Check } from "lucide-react";

type Props = { batch: any; onDone: () => void };

export function ReconcileSection({ batch, onDone }: Props) {
  if (!batch?.is_quick_add) return null;
  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <GitMerge className="w-4 h-4 text-primary" />
        <h2 className="font-semibold">Quick Add → PO reconciliation</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        This batch was started by Quick Add (on-the-floor restock). To reconcile it against the vendor PO/invoice:
      </p>
      <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
        <li>Set the real vendor below.</li>
        <li>Upload the PO/invoice PDF in the Header section above.</li>
        <li>Click <span className="font-medium">Extract with AI</span> at the top of the page to populate draft PO lines.</li>
        <li>Click <span className="font-medium">Compute matches</span> here to see what lines up.</li>
        <li>Confirm matches and flag shortages / extras.</li>
      </ol>

      <VendorPromote batch={batch} onDone={onDone} />
      <ReconcileMatcher batchId={batch.id} onDone={onDone} />
    </div>
  );
}

function VendorPromote({ batch, onDone }: { batch: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const promote = useServerFn(promoteQuickAddBatchVendor);
  const { data: vendors } = useQuery({
    queryKey: ["vendors-active"],
    queryFn: async () =>
      (await supabase.from("vendors").select("id,name,slug").eq("is_active", true).order("name")).data ?? [],
    staleTime: 30_000,
  });
  const current = vendors?.find((v: any) => v.id === batch.vendor_id);
  const isStillQuickAdd = current?.slug === "quick-add" || !current;
  const onPick = async (id: string) => {
    try {
      await promote({ data: { batchId: batch.id, realVendorId: id } });
      toast.success("Vendor set on batch");
      setOpen(false);
      onDone();
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="rounded-md border p-3 bg-muted/30 flex items-center gap-3">
      <div className="text-sm flex-1">
        <div className="text-xs text-muted-foreground">Real vendor</div>
        <div className="font-medium">
          {isStillQuickAdd ? <span className="text-amber-700">Not set (still Quick Add placeholder)</span> : current?.name}
        </div>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant={isStillQuickAdd ? "default" : "outline"}>
            {isStillQuickAdd ? "Set vendor…" : "Change vendor…"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-72">
          <Command>
            <CommandInput placeholder="Search vendors…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>No vendors</CommandEmpty>
              <CommandGroup>
                {(vendors ?? []).filter((v: any) => v.slug !== "quick-add").map((v: any) => (
                  <CommandItem key={v.id} value={v.name} onSelect={() => onPick(v.id)}>
                    {v.id === batch.vendor_id && <Check className="w-3 h-3 mr-2" />}
                    {v.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

type Recon = {
  confirmed: any[]; suggested: any[]; unmatchedPoLines: any[]; unmatchedInvItems: any[];
};

function ReconcileMatcher({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const compute = useServerFn(computeQuickAddReconciliation);
  const confirm = useServerFn(confirmReconciliation);
  const [data, setData] = useState<Recon | null>(null);
  const [busy, setBusy] = useState(false);

  // selection state
  const [acceptedMatches, setAcceptedMatches] = useState<Record<string, boolean>>({});
  const [updateCost, setUpdateCost] = useState<Record<string, boolean>>({});
  const [acceptedPoLines, setAcceptedPoLines] = useState<Record<string, boolean>>({});
  const [missingPoLines, setMissingPoLines] = useState<Record<string, boolean>>({});
  const [extraInv, setExtraInv] = useState<Record<string, boolean>>({});

  const run = async () => {
    setBusy(true);
    try {
      const r = await compute({ data: { batchId } }) as Recon;
      setData(r);
      // pre-tick suggested matches with score >= 0.85
      const ticked: Record<string, boolean> = {};
      for (const c of r.confirmed) ticked[c.vendorLineItemId] = true;
      for (const s of r.suggested) if (s.score >= 0.85) ticked[s.vendorLineItemId] = true;
      setAcceptedMatches(ticked);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const apply = async () => {
    if (!data) return;
    setBusy(true);
    try {
      const allPairs = [...data.confirmed, ...data.suggested];
      const matches = allPairs
        .filter(p => acceptedMatches[p.vendorLineItemId])
        .map(p => ({
          vendorLineItemId: p.vendorLineItemId,
          inventoryItemId: p.inventoryItemId,
          updateWholesale: !!updateCost[p.vendorLineItemId],
          newWholesale: updateCost[p.vendorLineItemId] ? (p.poCost ?? null) : null,
        }));
      const acceptPoLines = Object.entries(acceptedPoLines).filter(([,v]) => v).map(([k]) => k);
      const flagMissing = Object.entries(missingPoLines).filter(([,v]) => v).map(([k]) => k);
      const flagExtras = Object.entries(extraInv).filter(([,v]) => v).map(([k]) => k);
      const r = await confirm({ data: { batchId, matches, acceptPoLines, flagMissing, flagExtras } });
      if (r.errors?.length) toast.warning(`Saved with ${r.errors.length} error(s)`);
      else toast.success(`Reconciled — ${r.matched} matched, ${r.accepted} accepted, ${r.missing} short, ${r.extras} extras`);
      onDone();
      await run();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={run} disabled={busy}>
          <Search className="w-3 h-3 mr-1" />{data ? "Refresh matches" : "Compute matches"}
        </Button>
        {data && (
          <Button size="sm" variant="default" onClick={apply} disabled={busy}>
            Apply reconciliation
          </Button>
        )}
      </div>
      {!data && (
        <div className="text-xs text-muted-foreground">Click compute once PO lines have been extracted.</div>
      )}
      {data && (
        <div className="space-y-5">
          <Bucket title={`Suggested matches (${data.confirmed.length + data.suggested.length})`} empty="No matches yet.">
            {[...data.confirmed, ...data.suggested].map(p => (
              <div key={p.vendorLineItemId} className="grid grid-cols-12 gap-2 items-center text-sm border-t py-2">
                <div className="col-span-1">
                  <Checkbox
                    checked={!!acceptedMatches[p.vendorLineItemId]}
                    onCheckedChange={(v) => setAcceptedMatches(s => ({ ...s, [p.vendorLineItemId]: !!v }))}
                  />
                </div>
                <div className="col-span-4">
                  <div className="text-xs text-muted-foreground">PO line {p.confirmed ? "· saved" : `· ${Math.round(p.score*100)}%`}</div>
                  <div className="font-medium">{p.poName}</div>
                  <div className="text-xs">Qty {p.poQty} · {fmtMoney(p.poCost)}</div>
                </div>
                <div className="col-span-4">
                  <div className="text-xs text-muted-foreground">Quick Add item</div>
                  <div className="font-medium">{p.invName}</div>
                  <div className="text-xs">Qty {p.invQty} · {fmtMoney(p.invCost)}</div>
                </div>
                <div className="col-span-3 text-xs">
                  {Number(p.poQty) !== Number(p.invQty) && (
                    <div className="text-amber-700">Qty Δ {(Number(p.invQty) - Number(p.poQty)).toFixed(0)}</div>
                  )}
                  {p.poCost != null && p.invCost != null && Number(p.poCost) !== Number(p.invCost) && (
                    <label className="flex items-center gap-1 mt-1">
                      <Checkbox
                        checked={!!updateCost[p.vendorLineItemId]}
                        onCheckedChange={(v) => setUpdateCost(s => ({ ...s, [p.vendorLineItemId]: !!v }))}
                      />
                      Use PO cost {fmtMoney(p.poCost)}
                    </label>
                  )}
                </div>
              </div>
            ))}
          </Bucket>

          <Bucket title={`PO lines with no inventory match (${data.unmatchedPoLines.length})`} empty="None — every PO line matched.">
            {data.unmatchedPoLines.map(p => (
              <div key={p.vendorLineItemId} className="grid grid-cols-12 gap-2 items-center text-sm border-t py-2">
                <div className="col-span-6">
                  <div className="font-medium">{p.name}</div>
                  {p.scientificName && <div className="text-xs italic text-muted-foreground">{p.scientificName}</div>}
                  <div className="text-xs">Qty {p.qty} · {fmtMoney(p.cost)}</div>
                </div>
                <label className="col-span-3 flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={!!acceptedPoLines[p.vendorLineItemId]}
                    onCheckedChange={(v) => { setAcceptedPoLines(s => ({...s,[p.vendorLineItemId]:!!v})); if (v) setMissingPoLines(s=>({...s,[p.vendorLineItemId]:false})); }}
                  />
                  Accept (mark for convert)
                </label>
                <label className="col-span-3 flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={!!missingPoLines[p.vendorLineItemId]}
                    onCheckedChange={(v) => { setMissingPoLines(s => ({...s,[p.vendorLineItemId]:!!v})); if (v) setAcceptedPoLines(s=>({...s,[p.vendorLineItemId]:false})); }}
                  />
                  Flag short / not received
                </label>
              </div>
            ))}
          </Bucket>

          <Bucket title={`Inventory not on invoice (${data.unmatchedInvItems.length})`} empty="None — every Quick Add item is on the PO.">
            {data.unmatchedInvItems.map(i => (
              <div key={i.inventoryItemId} className="grid grid-cols-12 gap-2 items-center text-sm border-t py-2">
                <div className="col-span-9">
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs">Qty {i.qty} · cost {fmtMoney(i.cost)} · retail {fmtMoney(i.retail)}</div>
                </div>
                <label className="col-span-3 flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={!!extraInv[i.inventoryItemId]}
                    onCheckedChange={(v) => setExtraInv(s => ({...s,[i.inventoryItemId]:!!v}))}
                  />
                  Flag "not on invoice"
                </label>
              </div>
            ))}
          </Bucket>
        </div>
      )}
    </div>
  );
}

function Bucket({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasContent = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div>
      <div className="text-sm font-medium mb-1">{title}</div>
      {hasContent ? <div className="rounded-md border bg-background">{children}</div>
                  : <div className="text-xs text-muted-foreground">{empty}</div>}
    </div>
  );
}
