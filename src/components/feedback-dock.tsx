import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bug, Palette, Lightbulb, HelpCircle, ImagePlus, Loader2, Send } from "lucide-react";
import { submitFeedback } from "@/lib/feedback.functions";
import { captureContext } from "@/lib/feedback-capture";
import { initConsoleBuffer } from "@/lib/console-buffer";

type FType = "bug" | "ui" | "idea" | "question";

const TYPES: { key: FType; label: string; icon: typeof Bug; color: string }[] = [
  { key: "bug", label: "Bug", icon: Bug, color: "text-rose-500" },
  { key: "ui", label: "UI issue", icon: Palette, color: "text-violet-500" },
  { key: "idea", label: "Idea", icon: Lightbulb, color: "text-amber-500" },
  { key: "question", label: "Question", icon: HelpCircle, color: "text-sky-500" },
];

export function FeedbackDock() {
  const submit = useServerFn(submitFeedback);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FType>("bug");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Start recording console errors/warns as soon as the dock mounts (app shell).
  useEffect(() => {
    initConsoleBuffer();
  }, []);

  const start = (t: FType) => {
    setType(t);
    setMessage("");
    setFile(null);
    setPreview(null);
    setOpen(true);
  };

  const pickFile = (f?: File | null) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  // Paste a screenshot straight into the dialog.
  const onPaste = (e: React.ClipboardEvent) => {
    const img = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (img) {
      const f = img.getAsFile();
      if (f) pickFile(f);
    }
  };

  const send = async () => {
    if (!message.trim()) {
      toast.error("Add a short description");
      return;
    }
    setBusy(true);
    try {
      let screenshotUrl: string | undefined;
      if (file) {
        // Best-effort: a failed upload (e.g. bucket not provisioned yet) still
        // submits the report, just without the image.
        try {
          const ext = (file.name.split(".").pop() || "png").toLowerCase();
          const path = `${crypto.randomUUID()}.${ext}`;
          const up = await supabase.storage
            .from("feedback")
            .upload(path, file, { contentType: file.type || "image/png", upsert: false });
          if (up.error) throw up.error;
          const signed = await supabase.storage
            .from("feedback")
            .createSignedUrl(path, 60 * 60 * 24 * 365);
          screenshotUrl = signed.data?.signedUrl ?? undefined;
        } catch {
          toast.warning("Couldn't attach the screenshot — submitting text only.");
        }
      }

      const r = await submit({
        data: { type, message: message.trim(), context: captureContext() as any, screenshotUrl },
      });
      toast.success(`Thanks! Logged as issue #${r.number}`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't submit feedback");
    } finally {
      setBusy(false);
    }
  };

  const active = TYPES.find((t) => t.key === type)!;

  return (
    <>
      {/* Glassmorphic dock */}
      <div className="fixed bottom-4 left-4 z-40 print:hidden">
        <div className="flex items-center gap-0.5 rounded-full border border-white/20 bg-background/40 p-1 shadow-lg backdrop-blur-md supports-[backdrop-filter]:bg-background/30">
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => start(t.key)}
              title={`Report: ${t.label}`}
              aria-label={`Report ${t.label}`}
              className="rounded-full p-2 transition hover:bg-foreground/10 active:scale-95"
            >
              <t.icon className={`h-4 w-4 ${t.color}`} />
            </button>
          ))}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-md" onPaste={onPaste}>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
            <DialogDescription>
              Captures your page, device, and recent logs automatically.
            </DialogDescription>
          </DialogHeader>

          {/* Type switcher */}
          <div className="flex gap-1.5">
            {TYPES.map((t) => {
              const on = t.key === type;
              return (
                <button
                  key={t.key}
                  onClick={() => setType(t.key)}
                  className={`flex flex-1 flex-col items-center gap-1 rounded-lg border p-2 text-xs transition ${
                    on
                      ? "border-foreground/40 bg-foreground/5"
                      : "border-transparent hover:bg-muted"
                  }`}
                >
                  <t.icon className={`h-4 w-4 ${t.color}`} />
                  {t.label}
                </button>
              );
            })}
          </div>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={
              active.key === "bug"
                ? "What went wrong? What did you expect to happen?"
                : active.key === "idea"
                  ? "What would you like to see?"
                  : "Describe it…"
            }
            rows={4}
            autoFocus
          />

          {/* Screenshot */}
          {preview ? (
            <div className="relative rounded-md border overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Screenshot"
                className="max-h-48 w-full object-contain bg-muted"
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 h-6 px-2 text-xs"
                onClick={() => {
                  setFile(null);
                  setPreview(null);
                }}
              >
                Remove
              </Button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/30 p-3 text-xs text-muted-foreground hover:bg-muted/30">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <ImagePlus className="h-4 w-4" />
              Attach or paste a screenshot
            </label>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={send} disabled={busy}>
              {busy ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1 h-4 w-4" />
              )}
              Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
