import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseTagPhoto } from "@/lib/ops.functions";
import { toast } from "sonner";

/**
 * Photo → receive (livestock bag intake).
 *
 * Snap a Quality Marine / SDC bag, AI reads the label, then either
 * match an existing batch line (+1 received) or insert a new received
 * draft line. New lines are review_status='needs_info', not priced,
 * never auto-available — human still reviews/prices before conversion.
 */

type ParsedTag = {
  item_name: string;
  scientific_name?: string;
  vendor_item_code?: string;
  size?: string;
  item_type?: string;
  retail_price?: number;
  raw_text?: string;
  confidence?: string;
};

type Line = {
  id: string;
  vendor_item_id?: string | null;
  clean_item_name?: string | null;
  raw_description?: string | null;
  scientific_name?: string | null;
};

const tokenize = (s?: string | null) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);

function rankMatches(parsed: ParsedTag, lines: Line[]) {
  const code = parsed.vendor_item_code?.trim().toLowerCase();
  // 1. exact vendor code wins
  if (code) {
    const exact = lines.find((l) => (l.vendor_item_id ?? "").trim().toLowerCase() === code);
    if (exact) return [{ line: exact, score: 999, exact: true }];
  }
  const needle = new Set([
    ...tokenize(parsed.item_name),
    ...tokenize(parsed.scientific_name),
  ]);
  if (needle.size === 0) return [];
  const scored = lines.map((l) => {
    const hay = new Set([
      ...tokenize(l.clean_item_name),
      ...tokenize(l.scientific_name),
      ...tokenize(l.raw_description),
    ]);
    let score = 0;
    needle.forEach((t) => { if (hay.has(t)) score++; });
    return { line: l, score, exact: false };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

export function PhotoReceiveDialog({
  open,
  onOpenChange,
  batchId,
  vendorId,
  lines,
  onMatch,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string;
  vendorId: string;
  lines: Line[];
  /** Called when the user taps an existing line — caller should +1 the received draft. */
  onMatch: (line: Line) => void;
  /** Called after a new draft line is inserted — caller should refetch lines. */
  onCreated: (newLineId: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedTag | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const runParse = useServerFn(parseTagPhoto);

  const reset = () => {
    setFile(null); setPreview(null); setParsed(null); setPhotoPath(null);
  };

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setParsed(null);
    setPhotoPath(null);
  };

  const parse = async () => {
    if (!file) { toast.error("Pick or capture a photo first"); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `bag-photos/${batchId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("inventory-media")
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      setPhotoPath(path);
      const res = await runParse({ data: { storage_path: path } });
      setParsed(res as ParsedTag);
    } catch (e: any) {
      toast.error(e.message ?? "Parse failed");
    } finally {
      setBusy(false);
    }
  };

  const matchAndClose = (line: Line) => {
    onMatch(line);
    toast.success("Matched", { description: line.clean_item_name ?? line.raw_description ?? "line", duration: 2000 });
    reset();
    onOpenChange(false);
  };

  const createNew = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const itemType = ["fish","coral","invert","dry_good","live_rock","equipment","other"]
        .includes(parsed.item_type ?? "") ? parsed.item_type : null;
      const notesLines = [
        "Created from bag photo during receiving.",
        photoPath ? `bag_photo: ${photoPath}` : null,
        parsed.raw_text ? `raw_text: ${parsed.raw_text}` : null,
      ].filter(Boolean).join("\n");
      const { data: ins, error } = await supabase.from("vendor_line_items").insert({
        vendor_batch_id: batchId,
        vendor_id: vendorId,
        kind: "sellable",
        quantity: 1,
        received_quantity: 1,
        clean_item_name: parsed.item_name,
        scientific_name: parsed.scientific_name ?? null,
        vendor_item_id: parsed.vendor_item_code ?? null,
        size: parsed.size ?? null,
        item_type: itemType,
        review_status: "needs_info",
        pricing_status: "not_priced",
        extraction_warning: "Created from bag photo during receiving — verify name/cost before pricing.",
        notes: notesLines,
      }).select("id").single();
      if (error) throw error;
      toast.success("Draft line added", { description: parsed.item_name });
      onCreated(ins.id);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add line");
    } finally {
      setBusy(false);
    }
  };

  const ranked = parsed ? rankMatches(parsed, lines) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Photo → receive</DialogTitle>
          <DialogDescription>
            Snap each bag/tag. AI reads the label, then match an existing line or add a new draft.
            New lines need human review before pricing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {preview ? (
            <div className="rounded-md border overflow-hidden">
              <img src={preview} alt="Bag" className="w-full max-h-56 object-contain bg-muted" />
            </div>
          ) : (
            <label className="block rounded-md border-2 border-dashed border-muted-foreground/30 p-6 text-center cursor-pointer hover:bg-muted/30">
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => pick(e.target.files?.[0])} />
              <Camera className="w-8 h-8 mx-auto text-muted-foreground" />
              <div className="text-sm mt-2">Tap to snap a bag photo</div>
              <div className="text-xs text-muted-foreground">Camera opens on mobile devices</div>
            </label>
          )}

          {preview && !parsed && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={reset} disabled={busy}>Retake</Button>
              <Button onClick={parse} disabled={busy} className="flex-1">
                {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Reading…</> : <><Sparkles className="w-4 h-4 mr-1" /> Read label</>}
              </Button>
            </div>
          )}

          {parsed && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-1 text-sm">
              <div className="font-medium">{parsed.item_name}</div>
              {parsed.scientific_name && <div className="text-xs italic text-muted-foreground">{parsed.scientific_name}</div>}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {parsed.vendor_item_code && <span>code: <span className="font-mono">{parsed.vendor_item_code}</span></span>}
                {parsed.size && <span>size: {parsed.size}</span>}
                {parsed.item_type && <span>type: {parsed.item_type}</span>}
                {parsed.confidence && <span>conf: {parsed.confidence}</span>}
              </div>
            </div>
          )}

          {parsed && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {ranked.length === 0 ? "No matching lines" : "Tap to receive +1"}
              </div>
              {ranked.map(({ line, exact }) => (
                <button key={line.id}
                  onClick={() => matchAndClose(line)}
                  disabled={busy}
                  className={`w-full text-left rounded-md border p-2 hover:bg-muted/50 ${exact ? "border-emerald-500/60 bg-emerald-500/5" : ""}`}>
                  <div className="font-medium text-sm">{line.clean_item_name || line.raw_description || "(no name)"}</div>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    {line.vendor_item_id && <span className="font-mono">{line.vendor_item_id}</span>}
                    {line.scientific_name && <span className="italic">{line.scientific_name}</span>}
                    {exact && <span className="text-emerald-700 font-medium">exact code match</span>}
                  </div>
                </button>
              ))}
              <Button onClick={createNew} variant="outline" disabled={busy} className="w-full">
                {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Adding…</> : <><Plus className="w-4 h-4 mr-1" /> Add as new received line</>}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
