import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OpsBadge, intakeTone } from "@/components/ops-badge";
import {
  VENDOR_BATCH_SOURCE_TYPES, VENDOR_BATCH_SOURCE_LABELS,
  VENDOR_BATCH_INTAKE_LABELS, type VendorBatchIntakeStatus,
  fmtMoney,
} from "@/lib/ops";

export const Route = createFileRoute("/_app/batches/")({ component: BatchesPage });

function BatchesPage() {
  const { data, refetch } = useQuery({
    queryKey: ["vendor-batches"],
    queryFn: async () => (await supabase.from("vendor_batches")
      .select("id, source_document_type, invoice_number, invoice_date, intake_status, invoice_total, vendor_id, vendors(name)")
      .order("created_at",{ascending:false})).data ?? [],
  });

  return (
    <div className="p-8">
      <PageHeader title="Inventory Intake" description="Vendor invoices, order sheets, and packing lists. Drafts here become inventory after review and pricing approval."
        action={<NewBatchDialog onDone={refetch} />} />
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Vendor</th><th className="p-3">Doc</th>
              <th className="p-3">Invoice #</th><th className="p-3">Date</th>
              <th className="p-3">Total</th><th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((b: any) => (
              <tr key={b.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-medium">
                  <Link to="/batches/$id" params={{id:b.id}} className="hover:underline">{b.vendors?.name ?? "—"}</Link>
                </td>
                <td className="p-3 text-muted-foreground">{VENDOR_BATCH_SOURCE_LABELS[b.source_document_type as keyof typeof VENDOR_BATCH_SOURCE_LABELS] ?? b.source_document_type}</td>
                <td className="p-3">{b.invoice_number ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{b.invoice_date ?? "—"}</td>
                <td className="p-3">{fmtMoney(b.invoice_total)}</td>
                <td className="p-3"><OpsBadge label={VENDOR_BATCH_INTAKE_LABELS[b.intake_status as VendorBatchIntakeStatus] ?? b.intake_status} tone={intakeTone(b.intake_status)} /></td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No vendor batches yet. Create one to start intake.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewBatchDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ source_document_type: "invoice" });
  const { data: vendors } = useQuery({
    queryKey: ["vendors-active"],
    queryFn: async () => (await supabase.from("vendors").select("id,name").eq("is_active",true).order("name")).data ?? [],
    enabled: open,
  });
  const submit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("vendor_batches").insert({
      ...f, created_by: user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Batch created"); setOpen(false); setF({ source_document_type: "invoice" }); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> New batch</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New vendor batch</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Vendor</Label>
            <Select value={f.vendor_id ?? ""} onValueChange={v=>setF({...f, vendor_id:v})}>
              <SelectTrigger><SelectValue placeholder="Select vendor…" /></SelectTrigger>
              <SelectContent>{(vendors ?? []).map((v:any)=> <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Document type</Label>
            <Select value={f.source_document_type} onValueChange={v=>setF({...f, source_document_type:v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{VENDOR_BATCH_SOURCE_TYPES.map(t=> <SelectItem key={t} value={t}>{VENDOR_BATCH_SOURCE_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Invoice #</Label><Input value={f.invoice_number ?? ""} onChange={e=>setF({...f, invoice_number:e.target.value})} /></div>
            <div className="space-y-1.5"><Label>Invoice date</Label><Input type="date" value={f.invoice_date ?? ""} onChange={e=>setF({...f, invoice_date:e.target.value||null})} /></div>
          </div>
          <Button onClick={submit} disabled={!f.vendor_id} className="w-full">Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
