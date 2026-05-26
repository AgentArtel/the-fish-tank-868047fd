import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PRODUCT_TYPES, AVAILABILITY } from "@/lib/workflow";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Fish } from "lucide-react";

export const Route = createFileRoute("/_app/products")({ component: ProductsPage });

function ProductsPage() {
  const { data, refetch } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [],
  });

  return (
    <div className="p-8">
      <PageHeader
        title="Products"
        description="Products in the workspace should eventually support content, website readiness, inventory workflows, and future Clover sync. For now these are lightweight content-support records — not full inventory."
        action={<NewProductDialog onDone={refetch} />}
      />
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3">Availability</th><th className="p-3">Livestock</th><th className="p-3">Priority</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((p:any) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3"><Badge variant="outline">{p.product_type}</Badge></td>
                <td className="p-3"><Badge variant="secondary">{p.availability_status}</Badge></td>
                <td className="p-3">{p.is_livestock ? <Fish className="w-4 h-4 text-primary" /> : "—"}</td>
                <td className="p-3 text-muted-foreground">{p.content_priority}</td>
              </tr>
            ))}
            {data?.length===0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No products yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewProductDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", product_type: "general_content_subject", is_livestock: false,
    availability_status: "unknown", category: "", species_common_name: "",
    description: "", care_notes: "", content_priority: "medium",
  });
  const submit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("products").insert({ ...form, created_by: user?.id } as any);
    if (error) { toast.error(error.message); return; }
    toast.success("Product created"); setOpen(false); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> New product</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>New product</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Type</Label>
              <Select value={form.product_type} onValueChange={v=>setForm({...form, product_type:v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRODUCT_TYPES.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Availability</Label>
              <Select value={form.availability_status} onValueChange={v=>setForm({...form, availability_status:v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AVAILABILITY.map(t=> <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_livestock} onCheckedChange={c=>setForm({...form, is_livestock:!!c})} /> Livestock
          </label>
          <div className="space-y-1.5"><Label>Species common name</Label><Input value={form.species_common_name} onChange={e=>setForm({...form, species_common_name:e.target.value})} /></div>
          <div className="space-y-1.5"><Label>Category</Label><Input value={form.category} onChange={e=>setForm({...form, category:e.target.value})} /></div>
          <div className="space-y-1.5"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={e=>setForm({...form, description:e.target.value})} /></div>
          <div className="space-y-1.5"><Label>Care notes</Label><Textarea rows={2} value={form.care_notes} onChange={e=>setForm({...form, care_notes:e.target.value})} /></div>
          <div className="space-y-1.5"><Label>Content priority</Label>
            <Select value={form.content_priority} onValueChange={v=>setForm({...form, content_priority:v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={submit} disabled={!form.name} className="w-full">Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
