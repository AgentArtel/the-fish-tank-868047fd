import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Camera, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseTagPhoto } from "@/lib/ops.functions";
import { toast } from "sonner";

/**
 * One-time photo-on-file wizard.
 *
 * Renders a modal that captures a single photo (camera on mobile, file picker
 * on desktop), uploads it to `inventory-media`, optionally runs OCR, and
 * resolves with success so the caller can proceed (e.g. flip availability).
 */
export function PhotoOnFileWizard({
  open,
  onOpenChange,
  inventoryItemId,
  itemName,
  reason = "Items must have at least one photo on file before they can be marked Available.",
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventoryItemId: string;
  itemName?: string;
  reason?: string;
  onUploaded: () => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [hasPriceTag, setHasPriceTag] = useState(false);
  const [busy, setBusy] = useState(false);
  const runOcr = useServerFn(parseTagPhoto);

  const reset = () => { setFile(null); setPreview(null); setHasPriceTag(false); };

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!file) { toast.error("Pick or capture a photo first"); return; }
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uploaderId = userRes.user?.id ?? null;
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${inventoryItemId}/${Date.now()}-onfile.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("inventory-media")
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("inventory_media").insert({
        inventory_item_id: inventoryItemId,
        storage_path: path,
        file_name: file.name,
        media_type: "image",
        tag: "internal",
        uploader_id: uploaderId,
        has_price_tag: hasPriceTag,
      });
      if (insErr) throw insErr;
      await supabase.from("inventory_items").update({ needs_photo: false }).eq("id", inventoryItemId);

      // Best-effort OCR; don't block the wizard.
      runOcr({ data: { storage_path: path } }).catch(() => {});

      toast.success("Photo saved");
      await onUploaded();
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Snap a photo on file</DialogTitle>
          <DialogDescription>
            {itemName ? <><span className="font-medium">{itemName}</span> — </> : null}{reason}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 p-3 flex items-start gap-2 text-xs">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>One photo is enough. You can add more (or replace this) later on the item page.</span>
        </div>

        <div className="space-y-3">
          {preview ? (
            <div className="rounded-md border overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Preview" className="w-full max-h-72 object-contain bg-muted" />
            </div>
          ) : (
            <label className="block rounded-md border-2 border-dashed border-muted-foreground/30 p-6 text-center cursor-pointer hover:bg-muted/30">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => pick(e.target.files?.[0])}
              />
              <Camera className="w-8 h-8 mx-auto text-muted-foreground" />
              <div className="text-sm mt-2">Tap to take a photo or choose a file</div>
              <div className="text-xs text-muted-foreground">Camera opens on mobile devices</div>
            </label>
          )}

          {preview && (
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={hasPriceTag} onCheckedChange={(v) => setHasPriceTag(!!v)} />
                Includes price tag
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={reset}>Retake</Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={!file || busy}>
            {busy ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</> : "Save photo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Helper: check whether an inventory item already has at least one image on file.
 */
export async function inventoryHasPhoto(inventoryItemId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("inventory_media")
    .select("id", { count: "exact", head: false })
    .eq("inventory_item_id", inventoryItemId)
    .eq("media_type", "image")
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}
