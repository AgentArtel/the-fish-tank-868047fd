import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SOURCE_TYPES, USAGE_RIGHTS } from "@/lib/workflow";
import { getSignedUrl } from "@/lib/cms.functions";
import { useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/_app/media")({ component: MediaPage });

function MediaPage() {
  const { data, refetch } = useQuery({
    queryKey: ["media-list"],
    queryFn: async () => (await supabase.from("media_assets").select("*").order("created_at",{ascending:false})).data ?? [],
  });

  return (
    <div className="p-8">
      <PageHeader title="Media" description="Photo and video assets."
        action={<UploadDialog onDone={refetch} />} />
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {(data ?? []).map((m:any) => <MediaCard key={m.id} asset={m} />)}
      </div>
    </div>
  );
}

function MediaCard({ asset }: { asset: any }) {
  const getUrl = useServerFn(getSignedUrl);
  const { data } = useQuery({
    queryKey: ["signed", asset.storage_path],
    queryFn: () => getUrl({ data: { path: asset.storage_path } }),
    staleTime: 50*60*1000,
  });
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="aspect-square bg-muted">
        {asset.media_type==="image" && data?.url
          ? <img src={data.url} className="w-full h-full object-cover" alt={asset.alt_text ?? ""} />
          : <div className="p-3 text-xs">{asset.file_name}</div>}
      </div>
      <div className="p-2 text-xs space-y-1">
        <div className="truncate font-medium">{asset.file_name}</div>
        <div className="flex gap-1 flex-wrap">
          <Badge variant="outline" className="text-[10px]">{asset.source_type}</Badge>
          <Badge variant="outline" className="text-[10px]">{asset.usage_rights}</Badge>
        </div>
      </div>
    </div>
  );
}

function UploadDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState("phone_upload");
  const [usageRightsVal, setUsageRights] = useState("owned");
  const [altText, setAltText] = useState("");
  const [sourceNotes, setSourceNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const path = `${user!.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file);
      if (upErr) throw upErr;
      const mediaType = file.type.startsWith("video") ? "video" : "image";
      const { error: insErr } = await supabase.from("media_assets").insert({
        storage_path: path, file_name: file.name, media_type: mediaType,
        source_type: sourceType as any, usage_rights: usageRightsVal as any,
        alt_text: altText || null, source_notes: sourceNotes || null,
        uploader_id: user?.id,
      });
      if (insErr) throw insErr;
      toast.success("Uploaded");
      setOpen(false); setFile(null); setAltText(""); setSourceNotes("");
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Upload className="w-4 h-4 mr-1" /> Upload</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Upload media</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>File</Label><Input type="file" accept="image/*,video/*" onChange={e=>setFile(e.target.files?.[0] ?? null)} /></div>
          <div className="space-y-1.5"><Label>Source</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SOURCE_TYPES.map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Usage rights</Label>
            <Select value={usageRightsVal} onValueChange={setUsageRights}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{USAGE_RIGHTS.map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Alt text</Label><Input value={altText} onChange={e=>setAltText(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Source notes</Label><Textarea rows={2} value={sourceNotes} onChange={e=>setSourceNotes(e.target.value)} /></div>
          <Button onClick={submit} disabled={!file || busy} className="w-full">{busy?"Uploading…":"Upload"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
