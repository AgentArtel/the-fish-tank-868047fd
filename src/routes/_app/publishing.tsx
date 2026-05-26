import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_LABELS, type Platform } from "@/lib/workflow";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_app/publishing")({ component: PublishingPage });

function PublishingPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["publishing"],
    queryFn: async () => {
      const { data: items } = await supabase.from("content_items")
        .select("id,title,status,caption,call_to_action,hashtags")
        .in("status", ["approved","scheduled","posted"])
        .order("updated_at",{ascending:false});
      const ids = (items ?? []).map(i => i.id);
      if (!ids.length) return [];
      const [{ data: platforms }, { data: checklists }] = await Promise.all([
        supabase.from("content_platforms").select("*").in("content_item_id", ids),
        supabase.from("publishing_checklists").select("*").in("content_item_id", ids),
      ]);
      return (items ?? []).map(i => ({
        item: i,
        platforms: (platforms ?? []).filter(p => p.content_item_id === i.id),
        checklists: (checklists ?? []).filter(c => c.content_item_id === i.id),
      }));
    },
  });

  return (
    <div className="p-8">
      <PageHeader title="Publishing Checklist" description="Approved / scheduled content items ready to post manually. Export caption, then save the live URL." />
      <div className="space-y-4">
        {(data ?? []).map((row:any) => (
          <PublishCard key={row.item.id} row={row} onChange={() => qc.invalidateQueries({ queryKey: ["publishing"] })} />
        ))}
        {data?.length===0 && <p className="text-muted-foreground">No items ready yet.</p>}
      </div>
    </div>
  );
}

function PublishCard({ row, onChange }: { row: any; onChange: () => void }) {
  const { item, platforms, checklists } = row;
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex justify-between items-start mb-3">
        <Link to="/content/$id" params={{id:item.id}} className="font-semibold hover:underline">{item.title}</Link>
        <Badge variant="secondary">{item.status}</Badge>
      </div>
      <Button size="sm" variant="outline" className="mb-4" onClick={() => {
        const text = [item.caption, item.call_to_action, item.hashtags?.join(" ")].filter(Boolean).join("\n\n");
        navigator.clipboard.writeText(text);
        toast.success("Caption copied");
      }}><Copy className="w-3 h-3 mr-1" /> Copy caption</Button>

      {platforms.length === 0 && <p className="text-sm text-muted-foreground">No platforms assigned.</p>}
      <div className="space-y-3">
        {platforms.map((p: any) => (
          <PlatformRow key={p.id} platform={p}
            checklist={checklists.find((c:any) => c.platform === p.platform)}
            contentId={item.id} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}

function PlatformRow({ platform, checklist, contentId, onChange }:
  { platform: any; checklist: any; contentId: string; onChange: () => void }) {
  const [url, setUrl] = useState(platform.post_url ?? "");
  const cl = checklist ?? {
    caption_ready: false, media_attached: false, hashtags_ready: false,
    cta_ready: false, schedule_selected: false, manually_posted: false, post_url_saved: false,
  };
  const upsertChecklist = async (patch: any) => {
    const next = { ...cl, ...patch, content_item_id: contentId, platform: platform.platform };
    if (checklist?.id) {
      await supabase.from("publishing_checklists").update(patch).eq("id", checklist.id);
    } else {
      await supabase.from("publishing_checklists").insert(next);
    }
    onChange();
  };
  const savePostUrl = async () => {
    await supabase.from("content_platforms").update({
      post_url: url || null, posted_at: url ? new Date().toISOString() : null,
    }).eq("id", platform.id);
    if (url) await upsertChecklist({ manually_posted: true, post_url_saved: true });
    toast.success("Saved post URL");
    onChange();
  };
  const boxes: Array<[string,string]> = [
    ["caption_ready","Caption"], ["media_attached","Media"], ["hashtags_ready","Hashtags"],
    ["cta_ready","CTA"], ["schedule_selected","Schedule"], ["manually_posted","Posted"],
  ];
  return (
    <div className="border rounded-md p-3 bg-muted/30">
      <div className="font-medium text-sm mb-2">{PLATFORM_LABELS[platform.platform as Platform]}</div>
      <div className="flex flex-wrap gap-3 mb-3">
        {boxes.map(([k,l]) => (
          <label key={k} className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={!!cl[k]} onCheckedChange={c => upsertChecklist({ [k]: !!c })} /> {l}
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="https://… (final post URL)" value={url} onChange={e=>setUrl(e.target.value)} />
        <Button size="sm" onClick={savePostUrl}>Save URL</Button>
      </div>
      {platform.posted_at && <p className="text-xs text-muted-foreground mt-1">Posted {new Date(platform.posted_at).toLocaleString()}</p>}
    </div>
  );
}
