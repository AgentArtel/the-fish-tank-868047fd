import { createFileRoute, Link } from "@tanstack/react-router";
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
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  CONTENT_TYPES, PLATFORMS, PLATFORM_LABELS, STATUS_LABELS,
  allowedNext, type ContentStatus, type Platform,
} from "@/lib/workflow";
import { updateContentStatus, getSignedUrl } from "@/lib/cms.functions";
import { Copy, Trash2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_app/content/$id")({ component: ContentDetail });

function ContentDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const updateStatusFn = useServerFn(updateContentStatus);

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

  const transition = useMutation({
    mutationFn: (next: ContentStatus) => updateStatusFn({ data: { id, next } }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["content", id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-8 max-w-5xl">
      <Link to="/content" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="w-3 h-3" /> Back to content
      </Link>
      <PageHeader title={form.title || "Untitled"} description={`Last updated ${new Date(item.updated_at).toLocaleString()}`}
        action={<div className="flex items-center gap-2"><StatusBadge status={item.status} /></div>} />

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
