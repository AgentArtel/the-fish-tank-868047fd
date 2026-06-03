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
import { Plus, Upload, ArrowLeft, Sparkles } from "lucide-react";
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
  fmtMoney,
  type VendorLineReview,
} from "@/lib/ops";
import { convertLineItemsToInventory, getSignedVendorInvoiceUrl, extractBatchWithAI, receiveBatchLines } from "@/lib/ops.functions";

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
      <LineItemsSection batchId={id} vendorId={batch.vendor_id} lines={lines ?? []} onDone={refreshAll} />
      <ReceiveSection batchId={id} lines={lines ?? []} onDone={refreshAll} />
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
        <td className="p-2">{fmtMoney(line.suggested_retail_price)}</td>
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
    const { error } = await supabase.from("vendor_line_items").insert({
      ...f, vendor_batch_id: batchId, vendor_id: vendorId,
    });
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

function ReceiveSection({ batchId, lines, onDone }: { batchId: string; lines: any[]; onDone: () => void }) {
  const receive = useServerFn(receiveBatchLines);
  const { data: locs } = useQuery({
    queryKey: ["store-locations-tree"],
    queryFn: async () => (await supabase.from("store_locations").select("*").eq("is_active", true).order("name")).data ?? [],
  });
  const sellable = lines.filter(l => l.kind === "sellable" && !l.converted_inventory_item_id);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);

  const getDraft = (l: any) => drafts[l.id] ?? {
    received_quantity: l.received_quantity != null ? Number(l.received_quantity) : Number(l.quantity ?? 0),
    lost_quantity: Number(l.lost_quantity ?? 0),
    loss_reason: l.loss_reason ?? null,
    assigned_location_id: l.assigned_location_id ?? null,
    item_type: l.item_type ?? null,
  };
  const setDraft = (id: string, patch: any) => setDrafts(d => ({ ...d, [id]: { ...getDraft({ id, ...(d[id] ?? {}) }), ...patch } }));

  const tanks = (locs ?? []).filter((l: any) => l.kind !== "zone");
  const zoneOf = (parentId: string | null) => (locs ?? []).find((z: any) => z.id === parentId)?.name ?? "Unzoned";

  const submit = async () => {
    if (sellable.length === 0) { toast.info("No sellable lines to receive"); return; }
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
        };
      });
      const res = await receive({ data: { batchId, lines: payload } });
      toast.success(`Recorded ${res.updated} line(s)` + (res.errors.length ? ` · ${res.errors.length} error(s)` : ""));
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
          <p className="text-xs text-muted-foreground">Record what physically arrived. Lines with 0 received stay flagged as "did not arrive". Pricing approval and conversion to inventory remain admin-only steps.</p>
        </div>
        <Button onClick={submit} disabled={busy || sellable.length === 0}>{busy ? "Saving…" : "Save received"}</Button>
      </div>
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
                <th className="p-2">Suggested 3×</th>
                <th className="p-2">Location</th>
                <th className="p-2">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {sellable.map(l => {
                const d = getDraft(l);
                const suggested = l.wholesale_cost != null ? Number(l.wholesale_cost) * 3 : null;
                return (
                  <tr key={l.id} className="border-t align-top">
                    <td className="p-2">
                      <div className="font-medium">{l.clean_item_name || l.raw_description || "(no name)"}</div>
                      {l.scientific_name && <div className="text-xs italic text-muted-foreground">{l.scientific_name}</div>}
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
                      <Select value={d.loss_reason ?? "_none"} onValueChange={(v)=>setDraft(l.id, { loss_reason: v === "_none" ? null : v })}>
                        <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">—</SelectItem>
                          {LOSS_REASONS.map(r => <SelectItem key={r} value={r}>{LOSS_REASON_LABELS[r]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-2">{fmtMoney(l.wholesale_cost)}</td>
                    <td className="p-2">
                      <div className="font-medium text-emerald-700">{fmtMoney(suggested)}</div>
                      {l.approved_retail_price != null && (
                        <div className="text-[10px] text-muted-foreground">Approved: {fmtMoney(l.approved_retail_price)}</div>
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
                    <td className="p-2 text-xs text-muted-foreground">
                      {l.received_at ? new Date(l.received_at).toLocaleDateString() : <span className="italic">pending</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Suggested retail = 3 × wholesale cost. Admin still needs to approve pricing on each line (in Pricing Approval) before Convert to inventory.</p>
    </div>
  );
}

