import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";
import { useMe } from "@/hooks/use-me";
import { fmtMoney, INVENTORY_AVAILABILITY_LABELS, suggestRetail } from "@/lib/ops";
import { OpsBadge, availabilityTone } from "@/components/ops-badge";
import {
  approveLinePricing,
  approveInventoryPricing,
  setInventoryAvailability,
} from "@/lib/ops.functions";
import { PhotoOnFileWizard, inventoryHasPhoto } from "@/components/photo-on-file-wizard";

export const Route = createFileRoute("/_app/pricing-approval")({ component: PricingApprovalPage });

function PricingApprovalPage() {
  const { data: me } = useMe();
  const isAdmin = me?.roles.includes("admin");
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["pricing-queue"],
    queryFn: async () =>
      (
        await supabase
          .from("vendor_line_items")
          .select(
            "id, vendor_batch_id, clean_item_name, raw_description, scientific_name, quantity, size, wholesale_cost, vendor_sell_price, suggested_retail_price, override_retail_price, approved_retail_price, pricing_status, review_status, kind, vendors(name)",
          )
          .eq("kind", "sellable")
          .neq("pricing_status", "approved")
          .in("review_status", ["approved", "pending"])
          .order("created_at", { ascending: false })
      ).data ?? [],
  });

  return (
    <div className="p-8 space-y-8">
      <div>
        <PageHeader
          title="Pricing Approval"
          description={
            isAdmin
              ? "Approve customer retail prices for sellable line items."
              : "Pricing approval is admin-only. Showing items awaiting approval."
          }
        />
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
          Vendor line items
        </h2>
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3">Item</th>
                <th className="p-3">Vendor</th>
                <th className="p-3">Qty</th>
                <th className="p-3">Cost</th>
                <th className="p-3">Suggested</th>
                <th className="p-3">Approve at</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((l: any) => (
                <PricingRow
                  key={l.id}
                  line={l}
                  isAdmin={!!isAdmin}
                  onDone={() => qc.invalidateQueries({ queryKey: ["pricing-queue"] })}
                />
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    All caught up. No items awaiting pricing approval.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CoralDraftsSection isAdmin={!!isAdmin} />
    </div>
  );
}

function CoralDraftsSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["coral-draft-queue"],
    queryFn: async () =>
      (
        await supabase
          .from("inventory_items")
          .select(
            "id,item_name,scientific_name,attrs,retail_price,quantity_available,availability_status,pricing_status,location_id,store_locations(name)",
          )
          .eq("item_type", "coral")
          .in("availability_status", ["incoming", "needs_id"])
          .order("updated_at", { ascending: false })
      ).data ?? [],
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["coral-draft-queue"] });
    qc.invalidateQueries({ queryKey: ["workload"] }); // nav badge
    qc.invalidateQueries({ queryKey: ["inventory"] }); // stock list / coral plug column
    qc.invalidateQueries({ queryKey: ["coral-discovery-overview"] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Coral drafts{" "}
          <span className="text-muted-foreground/60 normal-case">— from Coral Discovery</span>
        </h2>
        <Button asChild size="sm" variant="ghost">
          <Link to="/inventory/coral-discovery">Open Coral Discovery</Link>
        </Button>
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Coral</th>
              <th className="p-3">Plug</th>
              <th className="p-3">Location</th>
              <th className="p-3">Qty</th>
              <th className="p-3">Status</th>
              <th className="p-3">Price &amp; go live</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((c: any) => (
              <CoralDraftRow key={c.id} item={c} isAdmin={isAdmin} onDone={refresh} />
            ))}
            {data?.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  No coral drafts waiting. Catalog corals in Coral Discovery and they'll appear here
                  for pricing.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoralDraftRow({
  item,
  isAdmin,
  onDone,
}: {
  item: any;
  isAdmin: boolean;
  onDone: () => void;
}) {
  const [price, setPrice] = useState<string>(
    item.retail_price != null ? String(item.retail_price) : "",
  );
  const [busy, setBusy] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const approve = useServerFn(approveInventoryPricing);
  const setAvail = useServerFn(setInventoryAvailability);
  const approved = item.pricing_status === "approved";

  const runApprove = async () => {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a valid price");
      return;
    }
    setBusy(true);
    try {
      await approve({ data: { inventoryItemId: item.id, approvedRetailPrice: n } });
      toast.success("Pricing approved");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const goLive = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const hasPhoto = await inventoryHasPhoto(item.id);
      if (!hasPhoto) {
        // Hand off to the photo wizard; STAY busy so "Take live" can't fire again
        // while it's open. Cleared by afterPhoto (success) or the wizard close.
        setWizardOpen(true);
        return;
      }
      await setAvail({ data: { id: item.id, status: "available" } });
      toast.success(`${item.item_name} is live`);
      onDone();
      setBusy(false);
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  const afterPhoto = async () => {
    try {
      await setAvail({ data: { id: item.id, status: "available" } });
      toast.success(`${item.item_name} is live`);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Wizard dismissed without completing → re-enable the button.
  const handleWizardOpenChange = (open: boolean) => {
    setWizardOpen(open);
    if (!open) setBusy(false);
  };

  return (
    <tr className="border-t">
      <td className="p-3">
        <div className="font-medium">{item.item_name}</div>
        {item.scientific_name && (
          <div className="text-xs italic text-muted-foreground">{item.scientific_name}</div>
        )}
      </td>
      <td className="p-3">
        {item.attrs?.rack_position ? (
          <Badge className="font-mono text-[10px]">{item.attrs.rack_position}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-3 text-muted-foreground">{item.store_locations?.name ?? "—"}</td>
      <td className="p-3">{item.quantity_available}</td>
      <td className="p-3">
        <OpsBadge
          label={
            INVENTORY_AVAILABILITY_LABELS[
              item.availability_status as keyof typeof INVENTORY_AVAILABILITY_LABELS
            ] ?? item.availability_status
          }
          tone={availabilityTone(item.availability_status)}
        />
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {approved ? "Priced" : "Not priced"}
        </div>
      </td>
      <td className="p-3">
        {!approved ? (
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-24 h-8"
              placeholder="Retail"
              disabled={!isAdmin}
            />
            <Button size="sm" onClick={runApprove} disabled={busy || !isAdmin}>
              {busy ? "…" : "Approve"}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 items-center">
            <span className="text-muted-foreground">{fmtMoney(item.retail_price)}</span>
            <Button size="sm" onClick={goLive} disabled={busy}>
              {busy ? "…" : "Take live"}
            </Button>
          </div>
        )}
        {!isAdmin && !approved && (
          <div className="text-[11px] text-muted-foreground mt-1">Admin approval required</div>
        )}
        <PhotoOnFileWizard
          open={wizardOpen}
          onOpenChange={handleWizardOpenChange}
          inventoryItemId={item.id}
          itemName={item.item_name}
          onUploaded={afterPhoto}
        />
      </td>
    </tr>
  );
}

function PricingRow({
  line,
  isAdmin,
  onDone,
}: {
  line: any;
  isAdmin: boolean;
  onDone: () => void;
}) {
  const suggested = line.suggested_retail_price ?? suggestRetail(line.wholesale_cost);
  const preset =
    line.override_retail_price ?? line.suggested_retail_price ?? suggestRetail(line.wholesale_cost);
  const [price, setPrice] = useState<string>(preset != null ? String(preset) : "");
  const [busy, setBusy] = useState(false);
  const approve = useServerFn(approveLinePricing);
  const run = async () => {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a valid price");
      return;
    }
    setBusy(true);
    try {
      await approve({ data: { lineItemId: line.id, approvedRetailPrice: n } });
      toast.success("Approved");
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <tr className="border-t">
      <td className="p-3">
        <div className="font-medium">
          {line.clean_item_name || line.raw_description || "(no name)"}
        </div>
        {line.scientific_name && (
          <div className="text-xs italic text-muted-foreground">{line.scientific_name}</div>
        )}
      </td>
      <td className="p-3 text-muted-foreground">{line.vendors?.name ?? "—"}</td>
      <td className="p-3">
        {line.quantity}{" "}
        {line.size && <span className="text-xs text-muted-foreground">{line.size}</span>}
      </td>
      <td className="p-3">{fmtMoney(line.wholesale_cost)}</td>
      <td className="p-3">
        {fmtMoney(suggested)}
        {line.override_retail_price != null && (
          <div className="text-[11px] text-amber-700 mt-0.5">
            Receiver: {fmtMoney(line.override_retail_price)}
          </div>
        )}
      </td>
      <td className="p-3">
        <div className="flex gap-2">
          <Input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-28 h-8"
            disabled={!isAdmin}
          />
          <Button size="sm" onClick={run} disabled={busy || !isAdmin}>
            {busy ? "…" : "Approve"}
          </Button>
        </div>
      </td>
    </tr>
  );
}
