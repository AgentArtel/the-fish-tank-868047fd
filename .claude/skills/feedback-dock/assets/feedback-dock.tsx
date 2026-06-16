// feedback-dock.tsx — The floating glassmorphic feedback dock + submit dialog.
// Mount once in the global AUTHED app shell/layout (not per-route). Renders a fixed
// bottom-left dock with 4 type buttons and a Dialog form with screenshot pick/paste.
//
// ───────────────────────────────────────────────────────────────────────────────────
// WHAT TO ADAPT PER STACK
//  1. Server call (`submit`):
//     - TanStack Start (canonical): `useServerFn(submitFeedback)` from your server fn file.
//     - Next.js / Vite: replace with a `fetch("/api/feedback", { method: "POST", body })`
//       wrapper, or a Next server action. Keep the same { type, message, context, screenshotUrl }
//       payload shape.
//  2. UI imports: these use shadcn/ui (Dialog/Button/Textarea) + lucide-react icons. If the
//     host uses a different UI lib, swap imports; the structure stays the same. Plain-HTML
//     fallback works too (a <dialog>/<div> overlay, <button>, <textarea>).
//  3. Screenshot upload (`uploadScreenshot`): see the three implementations below — Supabase
//     Storage (default), S3/R2 presigned, or base64 fallback (no storage). Pick one.
//  4. Image preview tag: <img> for Vite/TanStack; for Next.js use next/image (or keep <img>
//     with the eslint-disable for the object-URL preview).
//  5. toast: uses `sonner`. Swap for your toast lib or a simple alert.
// ───────────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { captureContext } from "./feedback-capture";
import { initConsoleBuffer } from "./console-buffer";

// === SERVER CALL: pick the binding for your stack ====================================
// (a) TanStack Start:
//     import { useServerFn } from "@tanstack/react-start";
//     import { submitFeedback } from "./submit-feedback.server";
//     const submit = useServerFn(submitFeedback);
//
// (b/c) Next.js / Vite via an API route — generic fetch wrapper:
type SubmitArgs = { type: FType; message: string; context: unknown; screenshotUrl?: string };
async function submitViaApi(args: SubmitArgs): Promise<{ number: number; url: string }> {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Couldn't submit feedback");
  return res.json();
}
// =====================================================================================

type FType = "bug" | "ui" | "idea" | "question";

const TYPES: { key: FType; label: string; icon: typeof Bug; color: string }[] = [
  { key: "bug", label: "Bug", icon: Bug, color: "text-rose-500" },
  { key: "ui", label: "UI issue", icon: Palette, color: "text-violet-500" },
  { key: "idea", label: "Idea", icon: Lightbulb, color: "text-amber-500" },
  { key: "question", label: "Question", icon: HelpCircle, color: "text-sky-500" },
];

// === SCREENSHOT UPLOAD: choose ONE implementation ====================================
// Returns a URL embeddable in a GitHub issue, or undefined to submit text-only.
// All variants are BEST-EFFORT: a failure should warn and submit without the image.

// (default) Supabase Storage — private bucket + 1-year signed URL.
// import { supabase } from "@/integrations/supabase/client";
async function uploadScreenshot(file: File): Promise<string | undefined> {
  // --- Supabase variant -------------------------------------------------------------
  const { supabase } = await import("@/integrations/supabase/client");
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage
    .from("feedback")
    .upload(path, file, { contentType: file.type || "image/png", upsert: false });
  if (up.error) throw up.error;
  const signed = await supabase.storage
    .from("feedback")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  return signed.data?.signedUrl ?? undefined;

  // --- S3/R2 variant (replace the body above) ---------------------------------------
  // 1) ask your server for a presigned PUT url: POST /api/feedback/upload-url
  // 2) PUT the file to it; 3) return the public-readable or presigned GET url.
  //
  // --- base64 fallback (NO storage) — replace the body above with: -----------------
  // const b = await new Promise<string>((res) => {
  //   const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file);
  // });
  // return b; // a data: URI. NOTE: GitHub strips data-URIs in issue images, so prefer
  //           // sending it to the server fn which can re-upload to gist/attachment, or
  //           // just include the size note. Real storage is strongly preferred.
}
// =====================================================================================

export function FeedbackDock() {
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
          screenshotUrl = await uploadScreenshot(file);
        } catch {
          toast.warning("Couldn't attach the screenshot — submitting text only.");
        }
      }

      // TanStack: const r = await submit({ data: { type, message, context, screenshotUrl } });
      const r = await submitViaApi({
        type,
        message: message.trim(),
        context: captureContext(),
        screenshotUrl,
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
              {/* For Next.js, swap <img> for next/image. */}
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
