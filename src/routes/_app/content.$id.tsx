import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  CONTENT_TYPES, PLATFORMS, PLATFORM_LABELS, STATUS_LABELS,
  allowedNext, type ContentStatus, type Platform,
} from "@/lib/workflow";
import {
  updateContentStatus, getSignedUrl, getSignedUrls, getMe, deleteContentItem,
  listSpeciesMediaForPost, attachMediaToPost, speciesKeyFromLine,
} from "@/lib/cms.functions";
import { Copy, Trash2, ArrowLeft, Upload, Check, ImageIcon, Download, X, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VendorImagePicker } from "@/components/vendor-image-picker";
import JSZip from "jszip";

export const Route = createFileRoute("/_app/content/$id")({ component: ContentDetail });

function ContentDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const updateStatusFn = useServerFn(updateContentStatus);
  const meFn = useServerFn(getMe);
  const delFn = useServerFn(deleteContentItem);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const isAdmin = (me?.roles ?? []).includes("admin");
  const [confirmDel, setConfirmDel] = useState(false);
  const remove = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Post deleted");
      qc.invalidateQueries({ queryKey: ["content"] });
      nav({ to: "/content" });
    },
    onError: (e: any) => toast.error(`Delete failed: ${e?.message ?? "unknown error"}`),
  });


  const { data: item } = useQuery({
    queryKey: ["content", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("content_items").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: products } = useQuery({
    queryKey: ["products-lite"],
    queryFn: async () => (await supabase.from("products").select("id,name").order("name")).data ?? [],
  });
  const { data: campaigns } = useQuery({
    queryKey: ["campaigns-lite"],
    queryFn: async () => (await supabase.from("campaigns").select("id,name").order("name")).data ?? [],
  });
  const { data: platforms, refetch: refetchPlatforms } = useQuery({
    queryKey: ["content-platforms", id],
    queryFn: async () => (await supabase.from("content_platforms").select("*").eq("content_item_id", id)).data ?? [],
  });
  const { data: media, refetch: refetchMedia } = useQuery({
    queryKey: ["content-media", id],
    queryFn: async () => {
      const { data } = await supabase.from("content_media")
        .select("media_asset_id, media_assets(*)").eq("content_item_id", id);
      return data ?? [];
    },
  });
  const { data: allMedia } = useQuery({
    queryKey: ["all-media"],
    queryFn: async () => (await supabase.from("media_assets").select("id,file_name,storage_path,media_type").order("created_at",{ascending:false}).limit(100)).data ?? [],
  });

  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (item) setForm(item); }, [item]);

  const transition = useMutation({
    mutationFn: (next: ContentStatus) => updateStatusFn({ data: { id, next } }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["content", id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!item || !form) return <div className="p-8">Loading…</div>;

  const save = async () => {
    const { error } = await supabase.from("content_items").update({
      title: form.title, content_type: form.content_type, caption: form.caption,
      short_caption: form.short_caption, on_screen_text: form.on_screen_text,
      hashtags: typeof form.hashtags === "string" ? form.hashtags.split(/[ ,\n]+/).filter(Boolean) : form.hashtags,
      call_to_action: form.call_to_action, scheduled_date: form.scheduled_date || null,
      assigned_to: form.assigned_to || null, reviewer: form.reviewer || null, notes: form.notes,
      product_id: form.product_id || null, campaign_id: form.campaign_id || null,
      meta_publish_ready: form.meta_publish_ready,
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["content", id] });
  };

  const togglePlatform = async (p: Platform, checked: boolean) => {
    if (checked) {
      await supabase.from("content_platforms").insert({ content_item_id: id, platform: p });
    } else {
      await supabase.from("content_platforms").delete().eq("content_item_id", id).eq("platform", p);
    }
    refetchPlatforms();
  };

  return (
    <div className="p-8 max-w-5xl">
      <Link to="/content" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="w-3 h-3" /> Back to content
      </Link>
      <PageHeader title={form.title || "Untitled"} description={`Last updated ${new Date(item.updated_at).toLocaleString()}`}
        action={<div className="flex items-center gap-2"><StatusBadge status={item.status} />{isAdmin && (
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={remove.isPending}
            onClick={() => setConfirmDel(true)}>
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
        )}</div>} />


      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Section title="Basics">
            <div className="grid gap-3">
              <Field label="Title"><Input value={form.title} onChange={e=>setForm({...form, title:e.target.value})} /></Field>
              <Field label="Type">
                <Select value={form.content_type} onValueChange={v=>setForm({...form, content_type:v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTENT_TYPES.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Caption"><Textarea rows={4} value={form.caption ?? ""} onChange={e=>setForm({...form, caption:e.target.value})} /></Field>
              <Field label="Short caption"><Input value={form.short_caption ?? ""} onChange={e=>setForm({...form, short_caption:e.target.value})} /></Field>
              <Field label="On-screen text"><Input value={form.on_screen_text ?? ""} onChange={e=>setForm({...form, on_screen_text:e.target.value})} /></Field>
              <Field label="Hashtags (space or comma separated)">
                <Input value={Array.isArray(form.hashtags) ? form.hashtags.join(" ") : form.hashtags ?? ""}
                  onChange={e=>setForm({...form, hashtags:e.target.value})} />
              </Field>
              <Field label="Call to action"><Input value={form.call_to_action ?? ""} onChange={e=>setForm({...form, call_to_action:e.target.value})} /></Field>
            </div>
          </Section>

          <Section title="Scheduling & assignment">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Scheduled date">
                <Input type="datetime-local"
                  value={form.scheduled_date ? new Date(form.scheduled_date).toISOString().slice(0,16) : ""}
                  onChange={e=>setForm({...form, scheduled_date: e.target.value ? new Date(e.target.value).toISOString() : null})} />
              </Field>
              <Field label="Product">
                <Select value={form.product_id ?? "none"} onValueChange={v=>setForm({...form, product_id: v==="none"?null:v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {(products ?? []).map((p:any)=> <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Campaign">
                <Select value={form.campaign_id ?? "none"} onValueChange={v=>setForm({...form, campaign_id: v==="none"?null:v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {(campaigns ?? []).map((c:any)=> <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Notes"><Textarea rows={3} value={form.notes ?? ""} onChange={e=>setForm({...form, notes:e.target.value})} /></Field>
            </div>
          </Section>

          <Section title="Platforms">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {PLATFORMS.map(p => {
                const enabled = (platforms ?? []).some((cp:any)=>cp.platform===p);
                return (
                  <label key={p} className="flex items-center gap-2 p-2 border rounded-md cursor-pointer hover:bg-accent">
                    <Checkbox checked={enabled} onCheckedChange={(c)=>togglePlatform(p, !!c)} />
                    <span className="text-sm">{PLATFORM_LABELS[p]}</span>
                  </label>
                );
              })}
            </div>
            {(platforms ?? []).length > 0 && (
              <div className="mt-3 space-y-2 border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  After posting by hand, paste the live post URL here.
                </p>
                {(platforms ?? []).map((cp: any) => (
                  <PostUrlRow key={cp.id} cp={cp} onSaved={refetchPlatforms} />
                ))}
              </div>
            )}
          </Section>

          <Section title="Media">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-3">
              {(media ?? []).map((m:any) => (
                <MediaTile key={m.media_asset_id} asset={m.media_assets} onRemove={async ()=>{
                  await supabase.from("content_media").delete().eq("content_item_id", id).eq("media_asset_id", m.media_asset_id);
                  refetchMedia();
                }} />
              ))}
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-primary">Attach from library…</summary>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 max-h-64 overflow-auto">
                {(allMedia ?? []).map((a:any) => (
                  <button key={a.id} type="button"
                    onClick={async ()=>{
                      await supabase.from("content_media").insert({ content_item_id: id, media_asset_id: a.id });
                      refetchMedia();
                    }}
                    className="border rounded p-1 text-xs hover:border-primary truncate">{a.file_name}</button>
                ))}
              </div>
            </details>
          </Section>

          {item.source_vendor_batch_id && (
            <SpeciesMediaSection contentItemId={id} onChanged={refetchMedia} />
          )}

          {item.content_type === "announcement" && (
            <FacebookExportSection caption={item.caption ?? ""} />
          )}

          <Button onClick={save}>Save changes</Button>
        </div>

        <div className="space-y-4">
          <Section title="Workflow">
            <p className="text-xs text-muted-foreground mb-2">Current: <strong>{STATUS_LABELS[item.status as ContentStatus]}</strong></p>
            <div className="flex flex-col gap-2">
              {allowedNext(item.status as ContentStatus).map(next => (
                <Button key={next} variant="outline" size="sm" disabled={transition.isPending}
                  onClick={()=>transition.mutate(next)}>
                  → {STATUS_LABELS[next]}
                </Button>
              ))}
            </div>
          </Section>

          <Section title="Export caption">
            <Button variant="secondary" size="sm" onClick={() => {
              const text = [form.caption, form.call_to_action, Array.isArray(form.hashtags)?form.hashtags.join(" "):form.hashtags].filter(Boolean).join("\n\n");
              navigator.clipboard.writeText(text);
              toast.success("Copied to clipboard");
            }}><Copy className="w-3 h-3 mr-1" /> Copy full caption</Button>
          </Section>

          <Section title="Meta publishing">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.meta_publish_ready} onCheckedChange={(c)=>setForm({...form, meta_publish_ready: !!c})} />
              Marked ready for future Meta API
            </label>
            <p className="text-xs text-muted-foreground mt-2">Posting via Meta Graph API is not enabled yet.</p>
          </Section>
        </div>
      </div>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              "{form.title || "Untitled"}" will be permanently deleted, along with its
              platform settings and any attached media links. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { setConfirmDel(false); remove.mutate(); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="font-semibold text-sm mb-3">{title}</h2>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

// Per-platform live-post URL paste-back. Same content_platforms.post_url /
// posted_at write used on the publishing page — reused here so the whole
// manual-publish loop (export → post → record) stays on one page.
function PostUrlRow({ cp, onSaved }: { cp: any; onSaved: () => void }) {
  const [url, setUrl] = useState<string>(cp.post_url ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("content_platforms").update({
      post_url: url || null, posted_at: url ? new Date().toISOString() : null,
    }).eq("id", cp.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(url ? "Post URL saved" : "Post URL cleared");
    onSaved();
  };
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{PLATFORM_LABELS[cp.platform as Platform]}</span>
      <Input className="h-8 text-xs" placeholder="https://facebook.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
      <Button size="sm" variant="outline" className="h-8 shrink-0" disabled={saving || url === (cp.post_url ?? "")} onClick={save}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function MediaTile({ asset, onRemove }: { asset: any; onRemove: () => void }) {
  const getUrl = useServerFn(getSignedUrl);
  const { data } = useQuery({
    queryKey: ["signed", asset.storage_path],
    queryFn: () => getUrl({ data: { path: asset.storage_path } }),
    staleTime: 50 * 60 * 1000,
  });
  return (
    <div className="relative group border rounded overflow-hidden bg-muted aspect-square">
      {asset.media_type === "image" && data?.url ? (
        <img src={data.url} alt={asset.alt_text ?? ""} className="w-full h-full object-cover" />
      ) : (
        <div className="p-2 text-xs">{asset.file_name}</div>
      )}
      <button onClick={onRemove}
        className="absolute top-1 right-1 p-1 bg-destructive text-destructive-foreground rounded opacity-0 group-hover:opacity-100">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

// Per-species media: upload once, reused on every future post.
// For each livestock line on the linked batch, we look up media_assets by the
// species_key. If one exists → "Attach to post" (one click). If not → file
// picker uploads it, tags it with the species_key, and auto-attaches.
function SpeciesMediaSection({ contentItemId, onChanged }: { contentItemId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSpeciesMediaForPost);
  const attachFn = useServerFn(attachMediaToPost);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["species-media", contentItemId],
    queryFn: () => listFn({ data: { contentItemId } }),
  });

  const attach = useMutation({
    mutationFn: (mediaAssetId: string) => attachFn({ data: { contentItemId, mediaAssetId } }),
    onSuccess: () => {
      toast.success("Image attached to post");
      refetch();
      onChanged();
      qc.invalidateQueries({ queryKey: ["content-media", contentItemId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onUploaded = () => {
    refetch();
    onChanged();
    qc.invalidateQueries({ queryKey: ["content-media", contentItemId] });
    qc.invalidateQueries({ queryKey: ["all-media"] });
  };

  const lines: any[] = data?.lines ?? [];
  const assetsByKey: Record<string, any[]> = data?.assetsByKey ?? {};
  const attached = new Set<string>(data?.attachedAssetIds ?? []);

  return (
    <Section title="Species images">
      <p className="text-xs text-muted-foreground mb-3">
        Upload one photo per species. Next time the same fish shows up on a PO, the post will come back already illustrated — no re-upload needed.
      </p>
      {isFetching && lines.length === 0 && <p className="text-xs text-muted-foreground">Loading…</p>}
      {lines.length === 0 && !isFetching && (
        <p className="text-xs text-muted-foreground">No livestock lines on the linked batch.</p>
      )}
      <div className="space-y-3">
        {lines.map((l) => {
          const key = speciesKeyFromLine(l);
          const assets = key ? assetsByKey[key] ?? [] : [];
          const name = l.clean_item_name || l.raw_description || "Unnamed";
          return (
            <div key={l.id} className="border rounded-md p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-sm font-medium min-w-0 flex-1">
                  {name}
                  {l.scientific_name && <span className="italic text-muted-foreground"> ({l.scientific_name})</span>}
                  {!key && <Badge variant="destructive" className="ml-2 text-[10px]">no species name</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {key && (
                    <GalleryPickButton
                      contentItemId={contentItemId}
                      speciesKey={key}
                      attachedIds={attached}
                      onDone={onUploaded}
                    />
                  )}
                  {key && <UploadSpeciesImage speciesKey={key} contentItemId={contentItemId} altText={name} onDone={onUploaded} />}
                </div>
              </div>
              {assets.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  {assets.map((a) => (
                    <SpeciesAssetTile
                      key={a.id}
                      asset={a}
                      attached={attached.has(a.id)}
                      busy={attach.isPending}
                      onAttach={() => attach.mutate(a.id)}
                    />
                  ))}
                </div>
              )}
              {key && assets.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">No suggested matches — use Choose from gallery or Upload.</p>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function UploadSpeciesImage({ speciesKey, contentItemId, altText, onDone }: {
  speciesKey: string; contentItemId: string; altText: string; onDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const handle = async (file: File) => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/species/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file);
      if (upErr) throw upErr;
      const { data: asset, error: insErr } = await supabase.from("media_assets").insert({
        storage_path: path, file_name: file.name, media_type: "image",
        source_type: "phone_upload", usage_rights: "owned",
        alt_text: altText || null, species_key: speciesKey, uploader_id: user.id,
      }).select("id").single();
      if (insErr) throw insErr;
      // Auto-attach to this post.
      await supabase.from("content_media").insert({
        content_item_id: contentItemId, media_asset_id: asset.id,
      });
      toast.success("Uploaded & attached");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
        <Upload className="w-3 h-3 mr-1" /> {busy ? "Uploading…" : "Upload image"}
      </Button>
    </>
  );
}

function SpeciesAssetTile({ asset, attached, busy, onAttach }: {
  asset: any; attached: boolean; busy: boolean; onAttach: () => void;
}) {
  const getUrl = useServerFn(getSignedUrl);
  const { data } = useQuery({
    queryKey: ["signed", asset.storage_path],
    queryFn: () => getUrl({ data: { path: asset.storage_path } }),
    staleTime: 50 * 60 * 1000,
  });
  return (
    <div className="border rounded overflow-hidden text-xs">
      <div className="aspect-square bg-muted">
        {data?.url && <img src={data.url} alt={asset.alt_text ?? ""} className="w-full h-full object-cover" loading="lazy" />}
      </div>
      <div className="p-2">
        {attached ? (
          <Badge className="text-[10px]"><Check className="w-3 h-3 mr-1" /> Attached</Badge>
        ) : (
          <Button size="sm" variant="default" className="h-7 w-full" disabled={busy} onClick={onAttach}>
            Attach to post
          </Button>
        )}
      </div>
    </div>
  );
}

// Browse the full image library, search, click to attach. On pick we also
// stamp the asset's species_key so this fish auto-matches next time.
function GalleryPickButton({ contentItemId, speciesKey, attachedIds, onDone }: {
  contentItemId: string; speciesKey: string; attachedIds: Set<string>; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const signUrls = useServerFn(getSignedUrls);
  const { data: gallery, isLoading } = useQuery({
    queryKey: ["gallery-images"],
    enabled: open,
    queryFn: async () => (await supabase
      .from("media_assets")
      .select("id, file_name, storage_path, species_key, alt_text")
      .eq("media_type", "image")
      .order("species_key", { ascending: true, nullsFirst: false })
      .limit(500)).data ?? [],
  });
  const filtered = (gallery ?? []).filter((a: any) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (a.species_key ?? "").toLowerCase().includes(needle)
      || (a.file_name ?? "").toLowerCase().includes(needle);
  });
  // Batch-sign visible tiles (first 120 of current filter) in one request.
  const visible = filtered.slice(0, 120);
  const pathsKey = visible.map((a: any) => a.storage_path).join("|");
  const { data: signed } = useQuery({
    queryKey: ["gallery-signed", pathsKey],
    enabled: open && visible.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => signUrls({ data: { paths: visible.map((a: any) => a.storage_path) } }),
  });
  const urlMap = signed?.urls ?? {};
  const pick = async (a: any) => {
    setBusyId(a.id);
    try {
      if (a.species_key !== speciesKey) {
        await supabase.from("media_assets").update({ species_key: speciesKey }).eq("id", a.id);
      }
      if (!attachedIds.has(a.id)) {
        const { error } = await supabase.from("content_media").insert({
          content_item_id: contentItemId, media_asset_id: a.id,
        });
        if (error && !/duplicate|unique/i.test(error.message)) throw error;
      }
      toast.success("Attached");
      onDone();
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to attach");
    } finally {
      setBusyId(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ImageIcon className="w-3 h-3 mr-1" /> Choose from gallery
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Pick an image for "{speciesKey}"</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Search by species or filename…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 overflow-auto flex-1 pr-1 items-start">
          {isLoading && (
            <p className="col-span-full text-sm text-muted-foreground text-center py-6">Loading images…</p>
          )}
          {!isLoading && visible.map((a: any) => (
            <button
              key={a.id}
              type="button"
              disabled={busyId === a.id}
              onClick={() => pick(a)}
              className="group flex min-w-0 flex-col overflow-hidden rounded-md border bg-card text-left transition-colors hover:border-primary disabled:opacity-50"
            >
              <div className="relative h-32 w-full shrink-0 overflow-hidden bg-muted sm:h-40">
                {urlMap[a.storage_path] ? (
                  <img src={urlMap[a.storage_path]} alt={a.alt_text ?? ""} className="absolute inset-0 h-full w-full object-contain" loading="lazy" />
                ) : (
                  <div className="absolute inset-0 animate-pulse bg-muted" />
                )}
              </div>
              <div className="min-h-10 w-full px-2 py-1 text-[10px] leading-tight">
                <div className="truncate font-medium">{a.species_key || "Unmatched image"}</div>
                <div className="truncate text-muted-foreground">{a.file_name}</div>
              </div>
            </button>
          ))}
          {!isLoading && filtered.length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground text-center py-6">No images.</p>
          )}
          {!isLoading && filtered.length > visible.length && (
            <p className="col-span-full text-xs text-muted-foreground text-center py-2">
              Showing {visible.length} of {filtered.length}. Search to narrow.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Export for Facebook (Phase A — manual publish, zero Meta API)
// ---------------------------------------------------------------------------
// The owner posts to Facebook by hand. We just hand them (1) the caption and
// (2) a name-matched image set from the existing vendor scrape library. The
// item list is derived by parsing the generated caption: each livestock line
// is `- <name> (*<scientific>*) — N available`. We strip the scientific
// parenthetical and the "— N available" suffix to recover the display name,
// then pre-search the vendor library with it via VendorImagePicker.

type ParsedCaptionItem = { key: string; name: string };

// Parse `- <name> (*sci*) — N available` lines out of the caption. Returns the
// cleaned display name per line (used as the image-search query + zip filename).
export function parseCaptionItems(caption: string): ParsedCaptionItem[] {
  const items: ParsedCaptionItem[] = [];
  const seen = new Set<string>();
  for (const raw of (caption ?? "").split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("- ")) continue;
    let name = line.slice(2).trim();
    // Drop the "— N available" quantity suffix (em dash or hyphen variants).
    name = name.replace(/\s*[—–-]\s*\d+\s+available\s*$/i, "").trim();
    // Drop the "(*scientific name*)" parenthetical.
    name = name.replace(/\s*\(\*[^)]*\*\)\s*$/, "").trim();
    // Drop any remaining trailing "(...)" parenthetical just in case.
    name = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (!name) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    items.push({ key: k, name });
  }
  return items;
}

// Filesystem-safe filename from a species name (for zip entries).
function safeFileName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "image"
  );
}

type PickedImage = { photoPath: string; previewUrl: string };

function FacebookExportSection({ caption }: { caption: string }) {
  const parsed = parseCaptionItems(caption);
  // Keyed by parsed item key; free-form manual picks use "manual:N" keys.
  const [picks, setPicks] = useState<Record<string, PickedImage>>({});
  const [manualPicks, setManualPicks] = useState<PickedImage[]>([]);
  const [zipping, setZipping] = useState(false);

  const setPick = (key: string, name: string, img: PickedImage | null) => {
    setPicks((prev) => {
      const next = { ...prev };
      if (img) next[key] = img;
      else delete next[key];
      return next;
    });
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption ?? "");
      toast.success("Caption copied to clipboard");
    } catch {
      toast.error("Couldn't copy — copy it manually from the caption field.");
    }
  };

  // Collect every picked image (per-item + manual) with a filename base.
  const collected: { name: string; img: PickedImage }[] = [
    ...parsed.filter((p) => picks[p.key]).map((p) => ({ name: p.name, img: picks[p.key] })),
    ...manualPicks.map((img, i) => ({ name: `extra-${i + 1}`, img })),
  ];

  const downloadZip = async () => {
    if (collected.length === 0) {
      toast.error("Pick at least one image first.");
      return;
    }
    setZipping(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      let ok = 0;
      for (const { name, img } of collected) {
        try {
          const res = await fetch(img.previewUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const ext = (blob.type.split("/")[1] || "jpg").split("+")[0].slice(0, 5);
          let base = safeFileName(name);
          let fileName = `${base}.${ext}`;
          let n = 2;
          while (usedNames.has(fileName)) fileName = `${base}-${n++}.${ext}`;
          usedNames.add(fileName);
          zip.file(fileName, blob);
          ok++;
        } catch (e: any) {
          console.error("zip image failed", name, e?.message);
        }
      }
      if (ok === 0) throw new Error("None of the images could be fetched.");
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = "facebook-new-arrivals.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${ok} image${ok === 1 ? "" : "s"}${ok < collected.length ? ` (${collected.length - ok} failed)` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Download failed");
    } finally {
      setZipping(false);
    }
  };

  const pickedCount = collected.length;

  return (
    <Section title="Export for Facebook">
      <p className="text-xs text-muted-foreground mb-3">
        Phase A is manual publish. Match an image per item from the vendor library, then
        <strong> Copy caption</strong> and <strong>Download image set</strong> — post them to Facebook
        by hand, then paste the post URL back on the right (under Platforms).
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button type="button" variant="secondary" size="sm" onClick={copyCaption}>
          <Copy className="w-3.5 h-3.5 mr-1" /> Copy caption
        </Button>
        <Button type="button" size="sm" onClick={downloadZip} disabled={zipping || pickedCount === 0}>
          {zipping ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
          {zipping ? "Zipping…" : `Download image set${pickedCount ? ` (${pickedCount})` : ""}`}
        </Button>
      </div>

      {parsed.length === 0 ? (
        <div className="rounded-md border border-dashed p-3">
          <p className="text-xs text-muted-foreground mb-2">
            No items parsed from the caption — search the vendor library manually to add images.
          </p>
          <ManualPickRow picks={manualPicks} setPicks={setManualPicks} />
        </div>
      ) : (
        <div className="space-y-2">
          {parsed.map((p) => (
            <ExportItemRow
              key={p.key}
              name={p.name}
              picked={picks[p.key] ?? null}
              onPick={(img) => setPick(p.key, p.name, img)}
            />
          ))}
          <div className="pt-2 border-t">
            <p className="text-[11px] text-muted-foreground mb-2">Add extra images (optional):</p>
            <ManualPickRow picks={manualPicks} setPicks={setManualPicks} />
          </div>
        </div>
      )}
    </Section>
  );
}

// One row per parsed item: name + thumbnail (if picked) + pick/change/clear.
function ExportItemRow({ name, picked, onPick }: {
  name: string; picked: PickedImage | null; onPick: (img: PickedImage | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-2">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
        {picked ? (
          <img src={picked.previewUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="text-[11px] text-muted-foreground">
          {picked ? "Image matched" : "No image yet"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <VendorImagePicker
          initialQuery={name}
          triggerLabel={picked ? "Change" : "Match image"}
          onPick={(photoPath, previewUrl) => onPick({ photoPath, previewUrl })}
        />
        {picked && (
          <Button type="button" variant="ghost" size="sm" className="px-2" onClick={() => onPick(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// Free-form vendor-image picker(s) for items the parser missed or extra shots.
function ManualPickRow({ picks, setPicks }: {
  picks: PickedImage[]; setPicks: React.Dispatch<React.SetStateAction<PickedImage[]>>;
}) {
  return (
    <div className="space-y-2">
      {picks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {picks.map((p, i) => (
            <div key={i} className="relative h-14 w-14 overflow-hidden rounded border bg-muted">
              <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => setPicks((prev) => prev.filter((_, j) => j !== i))}
                className="absolute right-0 top-0 bg-destructive p-0.5 text-destructive-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <VendorImagePicker
        triggerLabel="Search vendor images"
        onPick={(photoPath, previewUrl) => setPicks((prev) => [...prev, { photoPath, previewUrl }])}
      />
    </div>
  );
}


