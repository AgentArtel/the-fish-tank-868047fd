import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { useMe } from "@/hooks/use-me";
import { fmtMoney } from "@/lib/ops";
import { approveLinePricing } from "@/lib/ops.functions";

export const Route = createFileRoute("/_app/pricing-approval")({ component: PricingApprovalPage });

function PricingApprovalPage() {
  const { data: me } = useMe();
  const isAdmin = me?.roles.includes("admin");
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["pricing-queue"],
    queryFn: async () => (await supabase.from("vendor_line_items")
      .select("id, vendor_batch_id, clean_item_name, raw_description, scientific_name, quantity, size, wholesale_cost, vendor_sell_price, suggested_retail_price, approved_retail_price, pricing_status, review_status, kind, vendors(name)")
      .eq("kind","sellable").neq("pricing_status","approved")
      .in("review_status",["approved","pending"]).order("created_at",{ascending:false})).data ?? [],
  });

  return (
    <div className="p-8">
      <PageHeader title="Pricing Approval"
        description={isAdmin ? "Approve customer retail prices for sellable line items." : "Pricing approval is admin-only. Showing items awaiting approval."} />
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Item</th><th className="p-3">Vendor</th><th className="p-3">Qty</th>
              <th className="p-3">Cost</th><th className="p-3">Suggested</th><th className="p-3">Approve at</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((l: any) => (
              <PricingRow key={l.id} line={l} isAdmin={!!isAdmin} onDone={() => qc.invalidateQueries({ queryKey: ["pricing-queue"] })} />
            ))}
            {data?.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">All caught up. No items awaiting pricing approval.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PricingRow({ line, isAdmin, onDone }: { line: any; isAdmin: boolean; onDone: () => void }) {
  const [price, setPrice] = useState<string>(line.suggested_retail_price?.toString() ?? "");
  const [busy, setBusy] = useState(false);
  const approve = useServerFn(approveLinePricing);
  const run = async () => {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) { toast.error("Enter a valid price"); return; }
    setBusy(true);
    try { await approve({ data: { lineItemId: line.id, approvedRetailPrice: n } });
      toast.success("Approved"); onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  return (
    <tr className="border-t">
      <td className="p-3">
        <div className="font-medium">{line.clean_item_name || line.raw_description || "(no name)"}</div>
        {line.scientific_name && <div className="text-xs italic text-muted-foreground">{line.scientific_name}</div>}
      </td>
      <td className="p-3 text-muted-foreground">{line.vendors?.name ?? "—"}</td>
      <td className="p-3">{line.quantity} {line.size && <span className="text-xs text-muted-foreground">{line.size}</span>}</td>
      <td className="p-3">{fmtMoney(line.wholesale_cost)}</td>
      <td className="p-3">{fmtMoney(line.suggested_retail_price)}</td>
      <td className="p-3">
        <div className="flex gap-2">
          <Input type="number" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} className="w-28 h-8" disabled={!isAdmin} />
          <Button size="sm" onClick={run} disabled={busy || !isAdmin}>{busy ? "…" : "Approve"}</Button>
        </div>
      </td>
    </tr>
  );
}
