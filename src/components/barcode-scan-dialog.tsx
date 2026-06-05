import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Camera, ScanBarcode, X } from "lucide-react";

type ScanHit = {
  code: string;
  matchedLineId: string | null;
  matchedName: string | null;
  at: number;
};

/**
 * Barcode scan dialog for the Receive flow.
 * - Opens the device camera (rear-facing on mobile).
 * - On each decoded barcode, looks up the matching vendor_line_item by
 *   vendor_item_id (case-insensitive, trimmed). If found, calls onMatch
 *   so the parent can increment received_quantity / scroll into view.
 * - Debounces duplicate codes by 1.5s so a single sticker isn't double-counted
 *   while it's still in frame.
 */
export function BarcodeScanDialog({
  open,
  onOpenChange,
  lines,
  onMatch,
  autoIncrement,
  setAutoIncrement,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lines: any[];
  onMatch: (line: any, code: string) => void;
  autoIncrement: boolean;
  setAutoIncrement: (v: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastByCodeRef = useRef<Record<string, number>>({});
  const [hits, setHits] = useState<ScanHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Build lookup once per lines change
  const lookup = (() => {
    const m: Record<string, any> = {};
    for (const l of lines) {
      const k = (l.vendor_item_id ?? "").toString().trim().toLowerCase();
      if (k) m[k] = l;
    }
    return m;
  })();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setStarting(true);

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (cancelled) return;
        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          (result) => {
            if (!result) return;
            const code = result.getText().trim();
            if (!code) return;
            const now = Date.now();
            const prev = lastByCodeRef.current[code] ?? 0;
            if (now - prev < 1500) return; // debounce same code
            lastByCodeRef.current[code] = now;

            const matched = lookup[code.toLowerCase()] ?? null;
            const hit: ScanHit = {
              code,
              matchedLineId: matched?.id ?? null,
              matchedName: matched?.clean_item_name ?? matched?.raw_description ?? null,
              at: now,
            };
            setHits((h) => [hit, ...h].slice(0, 20));
            if (matched) onMatch(matched, code);
          },
        );
        controlsRef.current = controls;
        setStarting(false);
      } catch (e: any) {
        setError(e?.message ?? "Could not start the camera. Check permissions.");
        setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      try { controlsRef.current?.stop(); } catch { /* noop */ }
      controlsRef.current = null;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchedCount = hits.filter((h) => h.matchedLineId).length;
  const unmatchedCount = hits.length - matchedCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="w-4 h-4" /> Scan barcodes to receive
          </DialogTitle>
          <DialogDescription>
            Point the camera at each item's vendor barcode. Matches by <code className="text-[11px]">vendor_item_id</code> on the current batch.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md overflow-hidden bg-black aspect-video relative">
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">
              <Camera className="w-5 h-5 mr-2 animate-pulse" /> Starting camera…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-destructive bg-background/90 p-4 text-center text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={autoIncrement} onCheckedChange={(v) => setAutoIncrement(!!v)} />
            Add +1 to received qty on each matched scan
          </label>
          <div className="ml-auto flex gap-1.5">
            <Badge variant="secondary" className="text-[10px]">{matchedCount} matched</Badge>
            {unmatchedCount > 0 && <Badge variant="outline" className="text-[10px]">{unmatchedCount} unknown</Badge>}
          </div>
        </div>

        <div className="max-h-48 overflow-y-auto rounded-md border divide-y text-xs">
          {hits.length === 0 ? (
            <div className="p-3 text-muted-foreground text-center">Waiting for first scan…</div>
          ) : hits.map((h, i) => (
            <div key={`${h.at}-${i}`} className="p-2 flex items-center gap-2">
              {h.matchedLineId ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]">✓</Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]"><X className="w-3 h-3" /></Badge>
              )}
              <code className="text-[11px] text-muted-foreground">{h.code}</code>
              <span className="ml-auto truncate text-foreground">
                {h.matchedName ?? <span className="italic text-muted-foreground">no match on this batch</span>}
              </span>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
