import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { STATUS_LABELS, type ContentStatus } from "@/lib/workflow";
import { getMe, getContentSettings, setVendorPhotosOk, deleteContentItem } from "@/lib/cms.functions";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { z } from "zod";

const search = z.object({
  status: z.string().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/_app/content/")({
  component: ContentList,
  validateSearch: (s) => search.parse(s),
});

function ContentList() {
  const nav = useNavigate({ from: "/content/" });
  const qc = useQueryClient();
  const { status, q } = Route.useSearch();
  const meFn = useServerFn(getMe);
  const delFn = useServerFn(deleteContentItem);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const isAdmin = (me?.roles ?? []).includes("admin");
  const { data, isLoading } = useQuery({
    queryKey: ["content", status, q],
    queryFn: async () => {
      let query = supabase.from("content_items")
        .select("id,title,status,content_type,scheduled_date,updated_at")
        .order("updated_at", { ascending: false }).limit(200);
      if (status) query = query.eq("status", status as ContentStatus);
      if (q) query = query.ilike("title", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const [pending, setPending] = useState<{ id: string; title: string } | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    // Optimistic remove from the list cache.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["content"] });
      const snapshots = qc.getQueriesData<any[]>({ queryKey: ["content"] });
      for (const [key, rows] of snapshots) {
        if (Array.isArray(rows)) qc.setQueryData(key, rows.filter((r) => r.id !== id));
      }
      return { snapshots };
    },
    onError: (e: any, id, ctx) => {
      // Roll back the optimistic remove + mark the row as failed inline.
      for (const [key, rows] of ctx?.snapshots ?? []) qc.setQueryData(key, rows);
      setFailedIds((s) => new Set(s).add(id));
      toast.error(`Delete failed: ${e?.message ?? "unknown error"}`);
    },
    onSuccess: (_r, id) => {
      setFailedIds((s) => { const n = new Set(s); n.delete(id); return n; });
      toast.success("Post deleted");
      qc.invalidateQueries({ queryKey: ["content"] });
    },
  });

  return (
    <div className="p-8">
      <PageHeader title="Content Items" description="All planned, drafted, and posted items in the Content module."
        action={<Button asChild><Link to="/content/new"><Plus className="w-4 h-4 mr-1" /> New</Link></Button>} />
      <VendorPhotosSetting />
      <div className="flex gap-2 mb-4">
        <Input placeholder="Search title…" value={q ?? ""} className="max-w-xs"
          onChange={e => nav({ search: (s: any) => ({ ...s, q: e.target.value || undefined }) })} />
        <Select value={status ?? "all"} onValueChange={v => nav({ search: (s: any) => ({ ...s, status: v==="all"?undefined:v }) })}>
          <SelectTrigger className="max-w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-3">Title</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3">Scheduled</th>{isAdmin && <th className="p-3 w-10"></th>}</tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={isAdmin ? 5 : 4} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {(data ?? []).map(item => {
              const failed = failedIds.has(item.id);
              return (
                <tr key={item.id} className={`border-t hover:bg-muted/30 ${failed ? "bg-destructive/10" : ""}`}>
                  <td className="p-3">
                    <Link to="/content/$id" params={{id:item.id}} className="font-medium hover:underline">{item.title}</Link>
                    {failed && <div className="text-xs text-destructive mt-1">Delete failed — try again.</div>}
                  </td>
                  <td className="p-3 text-muted-foreground">{item.content_type}</td>
                  <td className="p-3"><StatusBadge status={item.status as ContentStatus} /></td>
                  <td className="p-3 text-muted-foreground">{item.scheduled_date ? new Date(item.scheduled_date).toLocaleString() : "—"}</td>
                  {isAdmin && <td className="p-3">
                    <Button variant="ghost" size="sm" className="h-7 text-muted-foreground hover:text-destructive"
                      disabled={del.isPending}
                      onClick={() => setPending({ id: item.id, title: item.title })}
                      aria-label="Delete">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>}
                </tr>
              );
            })}
            {data?.length === 0 && <tr><td colSpan={isAdmin ? 5 : 4} className="p-6 text-center text-muted-foreground">No items.</td></tr>}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pending?.title || "Untitled"}" will be permanently deleted, along with its
              platform settings and any attached media links. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (pending) { del.mutate(pending.id); setPending(null); } }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Admin-only attestation toggle: do our wholesalers permit reseller use of
// their product photos? Default false. (Legacy — kept in case the workflow
// returns; species images are now uploaded manually per species.)
function VendorPhotosSetting() {
  const meFn = useServerFn(getMe);
  const getSettingsFn = useServerFn(getContentSettings);
  const setFn = useServerFn(setVendorPhotosOk);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => meFn() });
  const isAdmin = (me?.roles ?? []).includes("admin");

  const { data: settings, refetch } = useQuery({
    queryKey: ["content-settings"],
    queryFn: () => getSettingsFn(),
    enabled: isAdmin,
  });

  const toggle = useMutation({
    mutationFn: (ok: boolean) => setFn({ data: { ok } }),
    onSuccess: () => { toast.success("Setting saved"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!isAdmin) return null;
  return (
    <div className="rounded-lg border bg-card p-3 mb-4 flex items-start gap-3">
      <Checkbox
        checked={!!settings?.vendorPhotosOk}
        disabled={toggle.isPending}
        onCheckedChange={(c) => toggle.mutate(!!c)}
      />
      <div className="text-xs">
        <div className="font-medium">Vendor photos OK (attestation)</div>
        <div className="text-muted-foreground">
          Our wholesalers permit reseller use of their product photos.{settings?.attestedAt ? ` Attested ${new Date(settings.attestedAt).toLocaleDateString()}.` : ""}
        </div>
      </div>
    </div>
  );
}
