import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTENT_TYPES } from "@/lib/workflow";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/content/new")({ component: NewContent });

function NewContent() {
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<string>("photo");
  const [caption, setCaption] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("content_items")
      .insert({ title, content_type: contentType as any, caption, created_by: user?.id })
      .select("id").single();
    if (error) { toast.error(error.message); return; }
    toast.success("Content created");
    nav({ to: "/content/$id", params: { id: data.id } });
  };

  return (
    <div className="p-8 max-w-2xl">
      <PageHeader title="New content" />
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={e=>setTitle(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <Select value={contentType} onValueChange={setContentType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CONTENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Caption (optional)</Label>
          <Textarea value={caption} onChange={e=>setCaption(e.target.value)} rows={4} />
        </div>
        <Button type="submit">Create</Button>
      </form>
    </div>
  );
}
