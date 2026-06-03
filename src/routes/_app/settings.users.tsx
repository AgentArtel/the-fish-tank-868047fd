import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { approveUser, setUserActive, inviteUser } from "@/lib/cms.functions";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";


export const Route = createFileRoute("/_app/settings/users")({ component: UsersPage });

function UsersPage() {
  const qc = useQueryClient();
  const approveFn = useServerFn(approveUser);
  const setActiveFn = useServerFn(setUserActive);

  const { data } = useQuery({
    queryKey: ["users-admin"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at",{ascending:false}),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      return (profiles ?? []).map((p:any) => ({
        ...p,
        roles: (roles ?? []).filter((r:any) => r.user_id === p.id).map((r:any) => r.role),
      }));
    },
  });

  return (
    <div className="p-8">
      <PageHeader title="Users" description="Approve new signups, assign roles, deactivate access." action={<InviteUserDialog onDone={() => qc.invalidateQueries({ queryKey: ["users-admin"] })} />} />

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-3">User</th><th className="p-3">Status</th><th className="p-3">Roles</th><th className="p-3">Actions</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((u:any) => (
              <UserRow key={u.id} user={u} onApprove={async (role) => {
                try { await approveFn({ data: { userId: u.id, role: role as any } }); toast.success("Approved"); qc.invalidateQueries({ queryKey: ["users-admin"] }); }
                catch(e:any) { toast.error(e.message); }
              }} onToggleActive={async () => {
                try { await setActiveFn({ data: { userId: u.id, active: !u.is_active } }); qc.invalidateQueries({ queryKey: ["users-admin"] }); }
                catch(e:any) { toast.error(e.message); }
              }} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({ user, onApprove, onToggleActive }: { user: any; onApprove: (role: string)=>void; onToggleActive: ()=>void }) {
  const [role, setRole] = useState("creator");
  return (
    <tr className="border-t">
      <td className="p-3">
        <div className="font-medium">{user.display_name ?? user.email}</div>
        <div className="text-xs text-muted-foreground">{user.email}</div>
      </td>
      <td className="p-3">
        {user.is_active
          ? <Badge className="bg-emerald-100 text-emerald-800 border-0">Active</Badge>
          : <Badge variant="outline">Pending</Badge>}
      </td>
      <td className="p-3">{user.roles.map((r:string) => <Badge key={r} variant="secondary" className="mr-1">{r}</Badge>)}</td>
      <td className="p-3">
        {!user.is_active ? (
          <div className="flex gap-2 items-center">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="creator">Creator</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => onApprove(role)}>Approve</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={onToggleActive}>Deactivate</Button>
        )}
      </td>
    </tr>
  );
}
