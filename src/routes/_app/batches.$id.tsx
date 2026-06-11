import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Upload, ArrowLeft, Sparkles, Camera, History, AlertTriangle, ScanBarcode } from "lucide-react";
import { BarcodeScanDialog } from "@/components/barcode-scan-dialog";
import { PhotoReceiveDialog } from "@/components/photo-receive-dialog";
import { useState } from "react";
import { toast } from "sonner";
import { useMe } from "@/hooks/use-me";
import { OpsBadge, intakeTone, reviewTone, pricingTone } from "@/components/ops-badge";
import {
  VENDOR_BATCH_SOURCE_TYPES, VENDOR_BATCH_SOURCE_LABELS,
  VENDOR_BATCH_INTAKE_STATUSES, VENDOR_BATCH_INTAKE_LABELS,
  VENDOR_BATCH_EXTRACTION_STATUSES, VENDOR_BATCH_EXTRACTION_LABELS,
  VENDOR_LINE_REVIEW, VENDOR_LINE_REVIEW_LABELS,
  VENDOR_LINE_PRICING_LABELS,
  VENDOR_CHARGE_TYPES, VENDOR_CHARGE_LABELS,
  ITEM_TYPES, ITEM_TYPE_LABELS,
  LOSS_REASONS, LOSS_REASON_LABELS,
  fmtMoney, suggestRetail,
  type VendorLineReview,
} from "@/lib/ops";
import { convertLineItemsToInventory, getSignedVendorInvoiceUrl, extractBatchWithAI, receiveBatchLines, uploadDoaPhoto, getSignedInventoryMediaUrl, promoteQuickAddBatchVendor, computeQuickAddReconciliation, confirmReconciliation } from "@/lib/ops.functions";
import { ReconcileSection } from "@/components/reconcile-section";


export const Route = createFileRoute("/_app/batches/$id")({ component: BatchDetail });

function BatchDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: batch } = useQuery({
    queryKey: ["batch", id],
    queryFn: async () => (await supabase.from("vendor_batches")
      .select("*, vendors(id,name)").eq("id", id).maybeSingle()).data,
  });
  const { data: lines } = useQuery({
    queryKey: ["batch-lines", id],
    queryFn: async () => (await supabase.from("vendor_line_items")
      .select("*").eq("vendor_batch_id", id).order("line_number",{nullsFirst:false})).data ?? [],
  });
  const { data: charges } = useQuery({
    queryKey: ["batch-charges", id],
    queryFn: async () => (await supabase.from("vendor_batch_charges")
      .select("*").eq("vendor_batch_id", id).order("created_at")).data ?? [],
  });

  if (!batch) return <div className="p-8 text-muted-foreground">Loading…</div>;

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["batch", id] });
    qc.invalidateQueries({ queryKey: ["batch-lines", id] });
    qc.invalidateQueries({ queryKey: ["batch-charges", id] });
    qc.invalidateQueries({ queryKey: ["vendor-batches"] });
  };

  return (
    <div className="p-8 space-y-6">
      <button onClick={() => nav({ to: "/batches" })} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="w-3 h-3" /> Back to batches
      </button>
      <PageHeader
        title={`${batch.vendors?.name ?? "Vendor"} — ${batch.invoice_number ?? "no invoice #"}`}
        description={`${VENDOR_BATCH_SOURCE_LABELS[batch.source_document_type as keyof typeof VENDOR_BATCH_SOURCE_LABELS]} · ${VENDOR_BATCH_INTAKE_LABELS[batch.intake_status as keyof typeof VENDOR_BATCH_INTAKE_LABELS]} · AI: ${VENDOR_BATCH_EXTRACTION_LABELS[batch.extraction_status as keyof typeof VENDOR_BATCH_EXTRACTION_LABELS]}`}
        action={
          <div className="flex gap-2">
            <ExtractAiButton batchId={id} hasPdf={!!batch.pdf_storage_path} extractionStatus={batch.extraction_status} onDone={refreshAll} />
            <ConvertButton batchId={id} lines={lines ?? []} onDone={refreshAll} />
          </div>
        }
      />

      <BatchHeaderForm batch={batch} onDone={refreshAll} />
      <ReconcileSection batch={batch} onDone={refreshAll} />
      <LineItemsSection batchId={id} vendorId={batch.vendor_id} lines={lines ?? []} onDone={refreshAll} />
      <ReceiveSection batchId={id} vendorId={batch.vendor_id} lines={lines ?? []} onDone={refreshAll} />
      <ChargesSection batchId={id} charges={charges ?? []} onDone={refreshAll} />

    </div>
  );
}

function BatchHeaderForm({ batch, onDone }: { batch: any; onDone: () => void }) {
  const [f, setF] = useState<any>(batch);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const getUrl = useServerFn(getSignedVendorInvoiceUrl);

  const save = async () => {
    setBusy(true);
    const { id, vendors, ...patch } = f;
    const { error } = await supabase.from("vendor_batches").update(patch).eq("id", batch.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); onDone();
  };

  const uploadPdf = async (file: File) => {
    setUploadBusy(true);
    try {
      const path = `${batch.vendor_id}/${batch.id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("vendor-invoices").upload(path, file);
      if (error) throw error;
      const { error: upErr } = await supabase.from("vendor_batches").update({
        pdf_storage_path: path, pdf_file_name: file.name,
        intake_status: batch.intake_status === "draft" ? "uploaded" : batch.intake_status,
      }).eq("id", batch.id);
      if (upErr) throw upErr;
      toast.success("Invoice uploaded"); onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setUploadBusy(false); }
  };

  const openPdf = async () => {
    if (!batch.pdf_storage_path) return;
    const { url } = await getUrl({ data: { path: batch.pdf_storage_path } });
    window.open(url, "_blank");
  };

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <h2 className="font-semibold">Header</h2>
      <div className="grid md:grid-cols-3 gap-3">
        <Field label="Document type">
          <Select value={f.source_document_type} onValueChange={v=>setF({...f, source_document_type:v})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{VENDOR_BATCH_SOURCE_TYPES.map(t => <SelectItem key={t} value={t}>{VENDOR_BATCH_SOURCE_LABELS[t]}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Intake status">
          <Select value={f.intake_status} onValueChange={v=>setF({...f, intake_status:v})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{VENDOR_BATCH_INTAKE_STATUSES.map(t=> <SelectItem key={t} value={t}>{VENDOR_BATCH_INTAKE_LABELS[t]}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Extraction status">
          <Select value={f.extraction_status} onValueChange={v=>setF({...f, extraction_status:v})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{VENDOR_BATCH_EXTRACTION_STATUSES.map(t=> <SelectItem key={t} value={t}>{VENDOR_BATCH_EXTRACTION_LABELS[t]}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Invoice #"><Input value={f.invoice_number ?? ""} onChange={e=>setF({...f, invoice_number:e.target.value})} /></Field>
        <Field label="Order #"><Input value={f.order_number ?? ""} onChange={e=>setF({...f, order_number:e.target.value})} /></Field>
        <Field label="PO #"><Input value={f.po_number ?? ""} onChange={e=>setF({...f, po_number:e.target.value})} /></Field>
        <Field label="Sales order #"><Input value={f.sales_order_number ?? ""} onChange={e=>setF({...f, sales_order_number:e.target.value})} /></Field>
        <Field label="Customer #"><Input value={f.customer_number ?? ""} onChange={e=>setF({...f, customer_number:e.target.value})} /></Field>
        <Field label="Carrier"><Input value={f.carrier ?? ""} onChange={e=>setF({...f, carrier:e.target.value})} /></Field>
        <Field label="Tracking #"><Input value={f.tracking_number ?? ""} onChange={e=>setF({...f, tracking_number:e.target.value})} /></Field>
        <Field label="AWB #"><Input value={f.awb_number ?? ""} onChange={e=>setF({...f, awb_number:e.target.value})} /></Field>
        <Field label="Terms"><Input value={f.terms ?? ""} onChange={e=>setF({...f, terms:e.target.value})} /></Field>
        <Field label="Invoice date"><Input type="date" value={f.invoice_date ?? ""} onChange={e=>setF({...f, invoice_date:e.target.value||null})} /></Field>
        <Field label="Ship date"><Input type="date" value={f.ship_date ?? ""} onChange={e=>setF({...f, ship_date:e.target.value||null})} /></Field>
        <Field label="Arrival date"><Input type="date" value={f.arrival_date ?? ""} onChange={e=>setF({...f, arrival_date:e.target.value||null})} /></Field>
        <Field label="Subtotal"><Input type="number" step="0.01" value={f.invoice_subtotal ?? ""} onChange={e=>setF({...f, invoice_subtotal:e.target.value===""?null:Number(e.target.value)})} /></Field>
        <Field label="Discount"><Input type="number" step="0.01" value={f.invoice_discount ?? ""} onChange={e=>setF({...f, invoice_discount:e.target.value===""?null:Number(e.target.value)})} /></Field>
        <Field label="Invoice total"><Input type="number" step="0.01" value={f.invoice_total ?? ""} onChange={e=>setF({...f, invoice_total:e.target.value===""?null:Number(e.target.value)})} /></Field>
        <Field label="Balance due"><Input type="number" step="0.01" value={f.balance_due ?? ""} onChange={e=>setF({...f, balance_due:e.target.value===""?null:Number(e.target.value)})} /></Field>
      </div>
      <div className="space-y-1.5"><Label>Notes</Label><Textarea rows={2} value={f.notes ?? ""} onChange={e=>setF({...f, notes:e.target.value})} /></div>

      <div className="flex items-center gap-2 pt-2 border-t">
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save header"}</Button>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input type="file" accept="application/pdf" className="hidden"
            onChange={e => { const file = e.target.files?.[0]; if (file) uploadPdf(file); }} />
          <Button asChild variant="outline" disabled={uploadBusy}>
            <span><Upload className="w-4 h-4 mr-1" /> {uploadBusy ? "Uploading…" : batch.pdf_storage_path ? "Replace PDF" : "Upload PDF"}</span>
          </Button>
        </label>
        {batch.pdf_storage_path && (
          <Button variant="ghost" onClick={openPdf}>Open {batch.pdf_file_name ?? "PDF"}</Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function LineItemsSection({ batchId, vendorId, lines, onDone }:
  { batchId: string; vendorId: string; lines: any[]; onDone: () => void }) {
  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Draft line items</h2>
        <NewLineDialog batchId={batchId} vendorId={vendorId} onDone={onDone} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">#</th><th className="p-2">Item</th><th className="p-2">Qty</th>
              <th className="p-2">Cost</th><th className="p-2">Suggested</th><th className="p-2">Approved</th>
              <th className="p-2">Review</th><th className="p-2">Pricing</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => <LineRow key={l.id} line={l} onDone={onDone} />)}
            {lines.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No line items. Add one to start review.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LineRow({ line, onDone }: { line: any; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [marking, setMarking] = useState(false);
  const updateReview = async (review_status: string) => {
    const { error } = await supabase.from("vendor_line_items")
      .update({ review_status: review_status as VendorLineReview }).eq("id", line.id);
    if (error) toast.error(error.message); else { toast.success("Review updated"); onDone(); }
  };
  const markReviewed = async () => {
    setMarking(true);
    const { error } = await supabase.from("vendor_line_items")
      .update({ review_status: "approved" satisfies VendorLineReview }).eq("id", line.id);
    setMarking(false);
    if (error) toast.error(error.message);
    else { toast.success("Marked reviewed"); onDone(); }
  };
  const canMarkReviewed = line.review_status !== "approved" && line.review_status !== "rejected";
  return (
    <>
      <tr className="border-t hover:bg-muted/30">
        <td className="p-2 text-muted-foreground">{line.line_number ?? "—"}</td>
        <td className="p-2">
          <div className="font-medium">{line.clean_item_name || line.raw_description || "(no name)"}</div>
          {line.scientific_name && <div className="text-xs italic text-muted-foreground">{line.scientific_name}</div>}
          {typeof line.extraction_confidence === "number" && (
            <div className="text-[10px] text-muted-foreground">AI confidence: {Math.round(line.extraction_confidence * 100)}%</div>
          )}
          {line.extraction_warning && <div className="text-xs text-amber-700">⚠ {line.extraction_warning}</div>}
        </td>
        <td className="p-2">{line.quantity} {line.size && <span className="text-xs text-muted-foreground">{line.size}</span>}</td>
        <td className="p-2">{fmtMoney(line.wholesale_cost)}</td>
        <td className="p-2">{fmtMoney(line.suggested_retail_price ?? suggestRetail(line.wholesale_cost))}</td>
        <td className="p-2 font-medium">{fmtMoney(line.approved_retail_price)}</td>
        <td className="p-2">
          <div className="flex items-center gap-1.5">
            <Select value={line.review_status} onValueChange={updateReview}>
              <SelectTrigger className="h-7 text-xs w-[110px]"><SelectValue /></SelectTrigger>
              <SelectContent>{VENDOR_LINE_REVIEW.map(s => <SelectItem key={s} value={s}>{VENDOR_LINE_REVIEW_LABELS[s]}</SelectItem>)}</SelectContent>
            </Select>
            {canMarkReviewed && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={markReviewed} disabled={marking}>
                {marking ? "…" : "Mark reviewed"}
              </Button>
            )}
          </div>
        </td>
        <td className="p-2"><OpsBadge label={VENDOR_LINE_PRICING_LABELS[line.pricing_status as keyof typeof VENDOR_LINE_PRICING_LABELS]} tone={pricingTone(line.pricing_status)} /></td>
        <td className="p-2"><Button variant="ghost" size="sm" onClick={()=>setEditing(true)}>Edit</Button></td>
      </tr>
      {editing && <EditLineDialog line={line} onClose={()=>{setEditing(false); onDone();}} />}
    </>
  );
}

function NewLineDialog({ batchId, vendorId, onDone }: { batchId: string; vendorId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ kind: "sellable", quantity: 1 });
  const submit = async () => {
    const payload: any = { ...f, vendor_batch_id: batchId, vendor_id: vendorId };
    if (payload.suggested_retail_price == null && payload.wholesale_cost != null) {
      payload.suggested_retail_price = suggestRetail(payload.wholesale_cost);
    }
    const { error } = await supabase.from("vendor_line_items").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Line added"); setOpen(false); setF({ kind: "sellable", quantity: 1 }); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="w-3 h-3 mr-1" /> Add line</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>New line item</DialogTitle></DialogHeader>
        <LineFormFields f={f} setF={setF} />
        <Button onClick={submit} className="w-full">Add</Button>
      </DialogContent>
    </Dialog>
  );
}

function EditLineDialog({ line, onClose }: { line: any; onClose: () => void }) {
  const [f, setF] = useState<any>(line);
  const save = async () => {
    const { id, vendor_batch_id, vendor_id, approved_by, approved_at, pricing_status, approved_retail_price, ...patch } = f;
    const { error } = await supabase.from("vendor_line_items").update(patch).eq("id", line.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); onClose();
  };
  const del = async () => {
    if (!confirm("Delete this line?")) return;
    const { error } = await supabase.from("vendor_line_items").delete().eq("id", line.id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); onClose(); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>Edit line</DialogTitle></DialogHeader>
        <LineFormFields f={f} setF={setF} />
        <div className="flex gap-2"><Button onClick={save} className="flex-1">Save</Button><Button variant="destructive" onClick={del}>Delete</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function LineFormFields({ f, setF }: { f: any; setF: (v: any) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind">
          <Select value={f.kind} onValueChange={v=>setF({...f, kind:v})}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="sellable">Sellable</SelectItem><SelectItem value="charge">Charge</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label="Line #"><Input type="number" value={f.line_number ?? ""} onChange={e=>setF({...f, line_number:e.target.value===""?null:Number(e.target.value)})} /></Field>
      </div>
      <Field label="Clean item name"><Input value={f.clean_item_name ?? ""} onChange={e=>setF({...f, clean_item_name:e.target.value})} /></Field>
      <Field label="Raw description"><Textarea rows={2} value={f.raw_description ?? ""} onChange={e=>setF({...f, raw_description:e.target.value})} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Item type">
          <Select value={f.item_type ?? "_unset"} onValueChange={v=>setF({...f, item_type: v === "_unset" ? null : v})}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_unset">—</SelectItem>
              {ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{ITEM_TYPE_LABELS[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Scientific name"><Input value={f.scientific_name ?? ""} onChange={e=>setF({...f, scientific_name:e.target.value})} /></Field>
        <Field label="Vendor item ID"><Input value={f.vendor_item_id ?? ""} onChange={e=>setF({...f, vendor_item_id:e.target.value})} /></Field>
        <Field label="Category"><Input value={f.category ?? ""} onChange={e=>setF({...f, category:e.target.value})} /></Field>
        <Field label="Subcategory"><Input value={f.subcategory ?? ""} onChange={e=>setF({...f, subcategory:e.target.value})} /></Field>
        <Field label="Origin / region"><Input value={f.origin_region ?? ""} onChange={e=>setF({...f, origin_region:e.target.value})} /></Field>
        <Field label="Size"><Input value={f.size ?? ""} onChange={e=>setF({...f, size:e.target.value})} /></Field>
        <Field label="Quantity"><Input type="number" step="0.01" value={f.quantity ?? ""} onChange={e=>setF({...f, quantity:e.target.value===""?null:Number(e.target.value)})} /></Field>
        <Field label="Wholesale cost"><Input type="number" step="0.01" value={f.wholesale_cost ?? ""} onChange={e=>setF({...f, wholesale_cost:e.target.value===""?null:Number(e.target.value)})} /></Field>
        <Field label="Vendor sell price"><Input type="number" step="0.01" value={f.vendor_sell_price ?? ""} onChange={e=>setF({...f, vendor_sell_price:e.target.value===""?null:Number(e.target.value)})} /></Field>
        <Field label="Regular price"><Input type="number" step="0.01" value={f.regular_price ?? ""} onChange={e=>setF({...f, regular_price:e.target.value===""?null:Number(e.target.value)})} /></Field>
        <Field label="Line total"><Input type="number" step="0.01" value={f.line_total ?? ""} onChange={e=>setF({...f, line_total:e.target.value===""?null:Number(e.target.value)})} /></Field>
        <Field label="Suggested retail"><Input type="number" step="0.01" value={f.suggested_retail_price ?? ""} onChange={e=>setF({...f, suggested_retail_price:e.target.value===""?null:Number(e.target.value)})} /></Field>
      </div>
      <Field label="Extraction warning"><Input value={f.extraction_warning ?? ""} onChange={e=>setF({...f, extraction_warning:e.target.value})} /></Field>
      <Field label="Notes"><Textarea rows={2} value={f.notes ?? ""} onChange={e=>setF({...f, notes:e.target.value})} /></Field>
    </div>
  );
}

function ChargesSection({ batchId, charges, onDone }: { batchId: string; charges: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<any>({ charge_type: "freight", amount: 0, quantity: 1 });
  const submit = async () => {
    const { error } = await supabase.from("vendor_batch_charges").insert({ ...f, vendor_batch_id: batchId });
    if (error) { toast.error(error.message); return; }
    toast.success("Charge added"); setOpen(false); setF({ charge_type: "freight", amount: 0, quantity: 1 }); onDone();
  };
  const del = async (id: string) => {
    const { error } = await supabase.from("vendor_batch_charges").delete().eq("id", id);
    if (error) toast.error(error.message); else onDone();
  };
  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Batch charges</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="w-3 h-3 mr-1" /> Add charge</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New batch charge</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Field label="Type">
                <Select value={f.charge_type} onValueChange={v=>setF({...f, charge_type:v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{VENDOR_CHARGE_TYPES.map(t=> <SelectItem key={t} value={t}>{VENDOR_CHARGE_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Label"><Input value={f.label ?? ""} onChange={e=>setF({...f, label:e.target.value})} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount"><Input type="number" step="0.01" value={f.amount} onChange={e=>setF({...f, amount:Number(e.target.value)})} /></Field>
                <Field label="Quantity"><Input type="number" value={f.quantity} onChange={e=>setF({...f, quantity:Number(e.target.value)})} /></Field>
              </div>
              <Field label="Notes"><Textarea rows={2} value={f.notes ?? ""} onChange={e=>setF({...f, notes:e.target.value})} /></Field>
              <Button onClick={submit} className="w-full">Add</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr><th className="p-2">Type</th><th className="p-2">Label</th><th className="p-2">Qty</th><th className="p-2">Amount</th><th className="p-2"></th></tr>
        </thead>
        <tbody>
          {charges.map(c => (
            <tr key={c.id} className="border-t">
              <td className="p-2">{VENDOR_CHARGE_LABELS[c.charge_type as keyof typeof VENDOR_CHARGE_LABELS]}</td>
              <td className="p-2 text-muted-foreground">{c.label ?? "—"}</td>
              <td className="p-2">{c.quantity}</td>
              <td className="p-2">{fmtMoney(c.amount)}</td>
              <td className="p-2"><Button variant="ghost" size="sm" onClick={()=>del(c.id)}>Delete</Button></td>
            </tr>
          ))}
          {charges.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No charges yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ConvertButton({ batchId: _b, lines, onDone }: { batchId: string; lines: any[]; onDone: () => void }) {
  const convert = useServerFn(convertLineItemsToInventory);
  const [busy, setBusy] = useState(false);
  const eligible = lines.filter(l =>
    l.kind === "sellable" && l.review_status === "approved" &&
    l.pricing_status === "approved" && !l.converted_inventory_item_id
  );
  const run = async () => {
    if (eligible.length === 0) { toast.info("No eligible lines (need approved review + approved pricing)"); return; }
    setBusy(true);
    try {
      const res = await convert({ data: { lineItemIds: eligible.map(l => l.id) } });
      toast.success(`Converted ${res.created.length}, skipped ${res.skipped.length}`);
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  return <Button onClick={run} disabled={busy}>{busy ? "Converting…" : `Convert ${eligible.length} to inventory`}</Button>;
}

function ExtractAiButton({ batchId, hasPdf, extractionStatus, onDone }:
  { batchId: string; hasPdf: boolean; extractionStatus: string; onDone: () => void }) {
  const extract = useServerFn(extractBatchWithAI);
  const [busy, setBusy] = useState(false);
  const [confirmFirst, setConfirmFirst] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  const run = async (overwrite: boolean) => {
    setBusy(true);
    try {
      const res: any = await extract({ data: { batchId, confirmOverwrite: overwrite } });
      if (res?.needsConfirm) { setConfirmOverwrite(true); return; }
      if (res?.ok === false) { toast.error(res.error || "AI extraction failed"); onDone(); return; }
      const warn = (res?.warnings ?? []) as string[];
      toast.success(
        `AI extracted ${res.lineCount} line(s), ${res.chargeCount} charge(s)` +
        (res.removedLines || res.removedCharges ? ` · replaced ${res.removedLines} AI line(s) / ${res.removedCharges} AI charge(s)` : "") +
        (warn.length ? ` · ${warn.length} warning(s)` : "")
      );
      if (warn.length) warn.slice(0, 5).forEach((w) => toast.warning(w));
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "AI extraction failed");
    } finally {
      setBusy(false);
    }
  };

  const disabled = !hasPdf || busy || extractionStatus === "ai_pending";
  const label = extractionStatus === "ai_pending" ? "Extracting…" : busy ? "Working…" : "Extract with AI";

  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => setConfirmFirst(true)} title={!hasPdf ? "Upload a PDF first" : undefined}>
        <Sparkles className="w-4 h-4 mr-1" /> {label}
      </Button>

      <AlertDialog open={confirmFirst} onOpenChange={setConfirmFirst}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Extract invoice with AI?</AlertDialogTitle>
            <AlertDialogDescription>
              AI will create draft line items and charges only. It cannot approve pricing, mark items reviewed, or convert anything to inventory. Staff review is required before any item becomes inventory. Human-entered header fields are never overwritten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmFirst(false); run(false); }}>Run AI extraction</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-run AI extraction?</AlertDialogTitle>
            <AlertDialogDescription>
              This batch already has line items or charges. Re-extraction will only replace prior AI-created drafts. Human-created lines/charges and converted lines are preserved. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOverwrite(false); run(true); }}>Replace AI drafts</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReceiveSection({ batchId, vendorId, lines, onDone }: { batchId: string; vendorId: string; lines: any[]; onDone: () => void }) {
  const receive = useServerFn(receiveBatchLines);
  const qc = useQueryClient();
  const { data: locs } = useQuery({
    queryKey: ["store-locations-tree"],
    queryFn: async () => (await supabase.from("store_locations").select("*").eq("is_active", true).order("name")).data ?? [],
  });
  const { data: doaPhotos } = useQuery({
    queryKey: ["batch-doa-photos", batchId],
    queryFn: async () => (await supabase.from("vendor_line_doa_photos")
      .select("*").eq("vendor_batch_id", batchId)).data ?? [],
  });
  const sellable = lines.filter(l => l.kind === "sellable" && !l.converted_inventory_item_id);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [doaTarget, setDoaTarget] = useState<any | null>(null);
  const [historyTarget, setHistoryTarget] = useState<any | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanAutoInc, setScanAutoInc] = useState(true);
  const [photoOpen, setPhotoOpen] = useState(false);

  const photoCountsByLine = (() => {
    const m: Record<string, Set<string>> = {};
    for (const p of (doaPhotos ?? []) as any[]) {
      m[p.vendor_line_item_id] ??= new Set();
      m[p.vendor_line_item_id].add(p.kind);
    }
    return m;
  })();

  const getDraft = (l: any) => drafts[l.id] ?? {
    received_quantity: l.received_quantity != null ? Number(l.received_quantity) : Number(l.quantity ?? 0),
    lost_quantity: Number(l.lost_quantity ?? 0),
    loss_reason: l.loss_reason ?? null,
    assigned_location_id: l.assigned_location_id ?? null,
    item_type: l.item_type ?? null,
    override_retail_price: l.override_retail_price ?? null,
  };
  const setDraft = (id: string, patch: any) => setDrafts(d => ({ ...d, [id]: { ...getDraft({ id, ...(d[id] ?? {}) }), ...patch } }));

  const tanks = (locs ?? []).filter((l: any) => l.kind !== "zone");
  const zoneOf = (parentId: string | null) => (locs ?? []).find((z: any) => z.id === parentId)?.name ?? "Unzoned";

  // Toast on DOA flagging
  const onLossReasonChange = (l: any, v: string | null) => {
    setDraft(l.id, { loss_reason: v });
    if (v === "dead_on_arrival") {
      const have = photoCountsByLine[l.id] ?? new Set();
      const missing = ["in_bag","on_lid"].filter(k => !have.has(k));
      if (missing.length > 0) {
        toast.warning("DOA requires 2 photos", {
          description: "Upload one photo of the animal still in the bag, and one laying on the Styrofoam lid. Required by the wholesaler.",
          action: { label: "Add photos", onClick: () => setDoaTarget(l) },
          duration: 8000,
        });
      }
    }
  };

  const submit = async () => {
    if (sellable.length === 0) { toast.info("No sellable lines to receive"); return; }
    // Pre-flight: block if any DOA line is missing photos
    const blocked: any[] = [];
    for (const l of sellable) {
      const d = getDraft(l);
      if (d.loss_reason === "dead_on_arrival" && Number(d.lost_quantity ?? 0) > 0) {
        const have = photoCountsByLine[l.id] ?? new Set();
        if (!have.has("in_bag") || !have.has("on_lid")) blocked.push(l);
      }
    }
    if (blocked.length > 0) {
      toast.error(`${blocked.length} DOA line(s) missing required photos`, {
        description: "Upload in-bag and on-lid photos for each DOA before saving.",
        action: { label: "Open first", onClick: () => setDoaTarget(blocked[0]) },
      });
      return;
    }
    setBusy(true);
    try {
      const payload = sellable.map(l => {
        const d = getDraft(l);
        return {
          lineItemId: l.id,
          received_quantity: Number(d.received_quantity ?? 0),
          lost_quantity: Number(d.lost_quantity ?? 0),
          loss_reason: d.loss_reason ?? null,
          assigned_location_id: d.assigned_location_id ?? null,
          item_type: d.item_type ?? null,
          override_retail_price: d.override_retail_price == null || d.override_retail_price === "" ? null : Number(d.override_retail_price),
        };
      });
      const res = await receive({ data: { batchId, lines: payload } });
      const blockedMsg = res.doaBlocked?.length ? ` · ${res.doaBlocked.length} blocked (missing DOA photos)` : "";
      toast.success(`Recorded ${res.updated} line(s)` + (res.errors.length ? ` · ${res.errors.length} error(s)` : "") + blockedMsg);
      setDrafts({});
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Receive shipment</h2>
          <p className="text-xs text-muted-foreground">Every save is recorded in the receive audit trail with timestamp + user. DOA lines require an in-bag and on-lid photo per wholesaler policy.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPhotoOpen(true)}>
            <Camera className="w-4 h-4 mr-1" /> Photo → receive
          </Button>
          <Button variant="outline" onClick={() => setScanOpen(true)} disabled={sellable.length === 0}>
            <ScanBarcode className="w-4 h-4 mr-1" /> Scan
          </Button>
          <Button onClick={submit} disabled={busy || sellable.length === 0}>{busy ? "Saving…" : "Save received"}</Button>
        </div>
      </div>
      {sellable.length > 0 && (() => {
        const totals = sellable.reduce((acc, l) => {
          const d = getDraft(l);
          const ordered = Number(l.quantity ?? 0);
          const received = Number(d.received_quantity ?? 0);
          const lost = Number(d.lost_quantity ?? 0);
          acc.ordered += ordered;
          acc.received += received;
          acc.lost += lost;
          if (received !== ordered) acc.diffLines += 1;
          return acc;
        }, { ordered: 0, received: 0, lost: 0, diffLines: 0 });
        const matches = totals.diffLines === 0;
        return (
          <div className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-xs ${matches ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
            <span className="font-semibold">{matches ? "✓ Matches PO" : `⚠ ${totals.diffLines} line${totals.diffLines === 1 ? "" : "s"} differ from PO`}</span>
            <span>Ordered: <b>{totals.ordered}</b></span>
            <span>Received: <b>{totals.received}</b></span>
            <span>Lost: <b>{totals.lost}</b></span>
          </div>
        );
      })()}
      {sellable.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No unconverted sellable lines. Add a draft line or run AI extraction first.</p>}
      <div className="overflow-x-auto">
        {sellable.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2">Item</th>
                <th className="p-2">Type</th>
                <th className="p-2">Ordered</th>
                <th className="p-2">Received</th>
                <th className="p-2">Lost</th>
                <th className="p-2">Loss reason</th>
                <th className="p-2">Cost</th>
                <th className="p-2">Retail (3× / override)</th>
                <th className="p-2">Location</th>
                <th className="p-2">Audit</th>
              </tr>
            </thead>
            <tbody>
              {sellable.map(l => {
                const d = getDraft(l);
                const suggested = l.suggested_retail_price ?? suggestRetail(l.wholesale_cost);
                const have = photoCountsByLine[l.id] ?? new Set();
                const doaActive = d.loss_reason === "dead_on_arrival" && Number(d.lost_quantity ?? 0) > 0;
                const doaComplete = have.has("in_bag") && have.has("on_lid");
                return (
                  <tr key={l.id} id={`receive-row-${l.id}`} className="border-t align-top scroll-mt-24 target:bg-amber-50">
                    <td className="p-2">
                      <div className="font-medium">{l.clean_item_name || l.raw_description || "(no name)"}</div>
                      {l.scientific_name && <div className="text-xs italic text-muted-foreground">{l.scientific_name}</div>}
                      {doaActive && (
                        <button onClick={() => setDoaTarget(l)} className={`mt-1 inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 ${doaComplete ? "bg-emerald-100 text-emerald-800" : "bg-destructive/15 text-destructive"}`}>
                          {doaComplete ? <Camera className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          DOA photos {have.size}/2
                        </button>
                      )}
                    </td>
                    <td className="p-2">
                      <Select value={d.item_type ?? "_unset"} onValueChange={(v) => setDraft(l.id, { item_type: v === "_unset" ? null : v })}>
                        <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_unset">—</SelectItem>
                          {ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{ITEM_TYPE_LABELS[t]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2 text-muted-foreground">{l.quantity ?? "—"} {l.size && <span className="text-xs">{l.size}</span>}</td>
                    <td className="p-2"><Input className="h-8 w-20" type="number" step="0.01" value={d.received_quantity ?? ""} onChange={e=>setDraft(l.id, { received_quantity: e.target.value === "" ? 0 : Number(e.target.value) })} /></td>
                    <td className="p-2"><Input className="h-8 w-20" type="number" step="0.01" value={d.lost_quantity ?? 0} onChange={e=>setDraft(l.id, { lost_quantity: e.target.value === "" ? 0 : Number(e.target.value) })} /></td>
                    <td className="p-2">
                      <Select value={d.loss_reason ?? "_none"} onValueChange={(v)=>onLossReasonChange(l, v === "_none" ? null : v)}>
                        <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">—</SelectItem>
                          {LOSS_REASONS.map(r => <SelectItem key={r} value={r}>{LOSS_REASON_LABELS[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">{fmtMoney(l.wholesale_cost)}</td>
                    <td className="p-2">
                      <div className="text-[11px] text-muted-foreground">3×: {fmtMoney(suggested)}</div>
                      <Input className="h-8 w-24 mt-1" type="number" step="0.01" placeholder="override"
                        value={d.override_retail_price ?? ""}
                        onChange={e=>setDraft(l.id, { override_retail_price: e.target.value === "" ? null : Number(e.target.value) })} />
                      {l.approved_retail_price != null && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">Approved: {fmtMoney(l.approved_retail_price)}</div>
                      )}
                    </td>
                    <td className="p-2">
                      <Select value={d.assigned_location_id ?? "_none"} onValueChange={(v)=>setDraft(l.id, { assigned_location_id: v === "_none" ? null : v })}>
                        <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">—</SelectItem>
                          {tanks.map((t: any) => (
                            <SelectItem key={t.id} value={t.id}>{zoneOf(t.parent_location_id)} · {t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setHistoryTarget(l)}>
                        <History className="w-3 h-3 mr-1" /> History
                      </Button>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{l.received_at ? new Date(l.received_at).toLocaleString() : <span className="italic">pending</span>}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Suggested retail = 3 × wholesale cost. Override is captured per line; admin still approves final retail in Pricing Approval before conversion.</p>

      {doaTarget && (
        <DoaPhotoDialog
          line={doaTarget}
          batchId={batchId}
          existing={(doaPhotos ?? []).filter((p: any) => p.vendor_line_item_id === doaTarget.id)}
          onClose={() => { setDoaTarget(null); qc.invalidateQueries({ queryKey: ["batch-doa-photos", batchId] }); }}
        />
      )}
      {historyTarget && (
        <ReceiveHistoryDialog line={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}
      <BarcodeScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        lines={sellable}
        autoIncrement={scanAutoInc}
        setAutoIncrement={setScanAutoInc}
        onMatch={(line, code) => {
          const d = getDraft(line);
          const next = scanAutoInc ? Number(d.received_quantity ?? 0) + 1 : Number(d.received_quantity ?? 0);
          setDraft(line.id, { received_quantity: next });
          toast.success(`Scanned ${code}`, { description: `${line.clean_item_name ?? line.raw_description ?? "line"} · received now ${next}`, duration: 2000 });
          // Scroll into view
          setTimeout(() => {
            const el = document.getElementById(`receive-row-${line.id}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 50);
        }}
      />
      <PhotoReceiveDialog
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        batchId={batchId}
        vendorId={vendorId}
        lines={sellable}
        onMatch={(line) => {
          const d = getDraft(line);
          const next = Number(d.received_quantity ?? 0) + 1;
          setDraft(line.id, { received_quantity: next });
          setTimeout(() => {
            const el = document.getElementById(`receive-row-${line.id}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 50);
        }}
        onCreated={(newLineId) => {
          onDone();
          setTimeout(() => {
            const el = document.getElementById(`receive-row-${newLineId}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 400);
        }}
      />
    </div>
  );
}

function DoaPhotoDialog({ line, batchId, existing, onClose }:
  { line: any; batchId: string; existing: any[]; onClose: () => void }) {
  const upload = useServerFn(uploadDoaPhoto);
  const getUrl = useServerFn(getSignedInventoryMediaUrl);
  const [busyKind, setBusyKind] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const byKind = (k: string) => existing.find(p => p.kind === k);

  const loadPreview = async (k: string) => {
    const p = byKind(k);
    if (!p || urls[k]) return;
    try { const { url } = await getUrl({ data: { path: p.storage_path } }); setUrls(u => ({ ...u, [k]: url })); } catch {}
  };

  const handle = async (kind: "in_bag" | "on_lid", file: File) => {
    setBusyKind(kind);
    try {
      const path = `doa/${batchId}/${line.id}/${kind}-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("inventory-media").upload(path, file, { upsert: true });
      if (error) throw error;
      await upload({ data: { lineItemId: line.id, batchId, kind, storage_path: path } });
      toast.success(`${kind === "in_bag" ? "In-bag" : "On-lid"} photo saved`);
      setUrls(u => { const n = { ...u }; delete n[kind]; return n; });
      // Refresh existing list via parent invalidation on close; show preview via reload
      const { url } = await getUrl({ data: { path } });
      setUrls(u => ({ ...u, [kind]: url }));
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyKind(null); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>DOA photos required</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Wholesaler policy: every DOA must have two photos — still in the sealed bag, and laying on the Styrofoam lid. Both are required before this line can be saved.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-2">
          {(["in_bag","on_lid"] as const).map(k => {
            const p = byKind(k);
            const label = k === "in_bag" ? "In sealed bag" : "On Styrofoam lid";
            if (p && !urls[k]) loadPreview(k);
            return (
              <div key={k} className="border rounded-md p-3 space-y-2">
                <div className="text-xs font-medium">{label}</div>
                <div className="aspect-square bg-muted/40 rounded flex items-center justify-center overflow-hidden">
                  {urls[k] ? <img src={urls[k]} alt={label} className="w-full h-full object-cover" />
                    : <Camera className="w-8 h-8 text-muted-foreground" />}
                </div>
                <label className="block">
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handle(k, f); }} />
                  <Button asChild size="sm" variant={p ? "outline" : "default"} disabled={busyKind === k} className="w-full">
                    <span>{busyKind === k ? "Uploading…" : p ? "Replace" : "Capture / upload"}</span>
                  </Button>
                </label>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveHistoryDialog({ line, onClose }: { line: any; onClose: () => void }) {
  const { data: logs } = useQuery({
    queryKey: ["receive-logs", line.id],
    queryFn: async () => (await supabase.from("vendor_line_receive_logs")
      .select("*").eq("vendor_line_item_id", line.id).order("created_at", { ascending: false })).data ?? [],
  });
  const actorIds = Array.from(new Set((logs ?? []).map((l: any) => l.actor_id).filter(Boolean)));
  const locIds = Array.from(new Set((logs ?? []).map((l: any) => l.assigned_location_id).filter(Boolean)));
  const { data: profiles } = useQuery({
    queryKey: ["receive-log-profiles", actorIds.join(",")],
    enabled: actorIds.length > 0,
    queryFn: async () => (await supabase.from("profiles").select("id,display_name,email").in("id", actorIds)).data ?? [],
  });
  const { data: locsMeta } = useQuery({
    queryKey: ["receive-log-locs", locIds.join(",")],
    enabled: locIds.length > 0,
    queryFn: async () => (await supabase.from("store_locations").select("id,name").in("id", locIds)).data ?? [],
  });
  const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const locMap = new Map((locsMeta ?? []).map((l: any) => [l.id, l]));
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Receive history — {line.clean_item_name || line.raw_description || "line"}</DialogTitle>
        </DialogHeader>
        {(!logs || logs.length === 0) && <p className="text-sm text-muted-foreground">No receive actions yet.</p>}
        <div className="space-y-2">
          {(logs ?? []).map((g: any) => {
            const prof: any = profMap.get(g.actor_id);
            const actor = prof?.display_name || prof?.email || "unknown user";
            const changes: string[] = [];
            if (g.received_quantity !== g.prev_received_quantity) changes.push(`received ${g.prev_received_quantity ?? "—"} → ${g.received_quantity ?? "—"}`);
            if (g.lost_quantity !== g.prev_lost_quantity) changes.push(`lost ${g.prev_lost_quantity ?? "—"} → ${g.lost_quantity ?? "—"}`);
            if ((g.loss_reason ?? null) !== (g.prev_loss_reason ?? null)) changes.push(`reason ${g.prev_loss_reason ?? "—"} → ${g.loss_reason ?? "—"}`);
            if ((g.assigned_location_id ?? null) !== (g.prev_assigned_location_id ?? null)) {
              const locName = (locMap.get(g.assigned_location_id) as any)?.name ?? "—";
              changes.push(`location → ${locName}`);
            }
            if (Number(g.override_retail_price ?? 0) !== Number(g.prev_override_retail_price ?? 0)) changes.push(`override retail ${fmtMoney(g.prev_override_retail_price)} → ${fmtMoney(g.override_retail_price)}`);
            return (
              <div key={g.id} className="rounded border p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{actor}</span>
                  <span className="text-muted-foreground">{new Date(g.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-muted-foreground">{changes.length ? changes.join(" · ") : "no field changes (re-save)"}</div>
                {g.note && <div className="mt-1 italic">"{g.note}"</div>}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

