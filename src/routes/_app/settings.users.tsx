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
import { approveUser, setUserActive, inviteUser, setUserRole } from "@/lib/cms.functions";
import { APP_ROLES, APP_ROLE_LABELS, APP_ROLE_DESCRIPTIONS, type AppRole } from "@/lib/ops";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings/users")({ component: UsersPage });

function RoleSelect({ value, onChange, className }: { value: AppRole; onChange: (v: AppRole) => void; className?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AppRole)}>
      <SelectTrigger className={className}><SelectValue /></SelectTrigger>
      <SelectContent>
        {APP_ROLES.map(r => (
          <SelectItem key={r} value={r}>
            <div className="flex flex-col">
              <span>{APP_ROLE_LABELS[r]}</span>
              <span className="text-[10px] text-muted-foreground">{APP_ROLE_DESCRIPTIONS[r]}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UsersPage() {
  const qc = useQueryClient();
  const approveFn = useServerFn(approveUser);
  const setActiveFn = useServerFn(setUserActive);
  const setRoleFn = useServerFn(setUserRole);

  const { data } = useQuery({
    queryKey: ["users-admin"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      return (profiles ?? []).map((p: any) => ({
        ...p,
        roles: (roles ?? []).filter((r: any) => r.user_id === p.id).map((r: any) => r.role),
      }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["users-admin"] });

  return (
    <div className="p-4 md:p-8">
      <PageHeader
        title="Users"
        description="Approve new signups, assign roles, deactivate access."
        action={<InviteUserDialog onDone={refresh} />}
      />

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Status</th>
              <th className="p-3">Role</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u: any) => (
              <UserRow
                key={u.id}
                user={u}
                onApprove={async (role) => {
                  try { await approveFn({ data: { userId: u.id, role: role as any } }); toast.success("Approved"); refresh(); }
                  catch (e: any) { toast.error(e.message); }
                }}
                onChangeRole={async (role) => {
                  try { await setRoleFn({ data: { userId: u.id, role: role as any } }); toast.success(`Role set to ${APP_ROLE_LABELS[role]}`); refresh(); }
                  catch (e: any) { toast.error(e.message); }
                }}
                onToggleActive={async () => {
                  try { await setActiveFn({ data: { userId: u.id, active: !u.is_active } }); refresh(); }
                  catch (e: any) { toast.error(e.message); }
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserRow({ user, onApprove, onChangeRole, onToggleActive }: {
  user: any;
  onApprove: (role: AppRole) => void;
  onChangeRole: (role: AppRole) => void;
  onToggleActive: () => void;
}) {
  const currentRole = (user.roles?.[0] as AppRole) ?? "creator";
  const [pendingRole, setPendingRole] = useState<AppRole>("creator");

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
      <td className="p-3">
        {user.is_active && user.roles.length > 0 ? (
          <RoleSelect value={currentRole} onChange={onChangeRole} className="w-40 h-8" />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-3 text-right">
        {!user.is_active ? (
          <div className="flex gap-2 items-center justify-end">
            <RoleSelect value={pendingRole} onChange={setPendingRole} className="w-36 h-8" />
            <Button size="sm" onClick={() => onApprove(pendingRole)}>Approve</Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={onToggleActive}>Deactivate</Button>
        )}
      </td>
    </tr>
  );
}

function InviteUserDialog({ onDone }: { onDone: () => void }) {
  const invite = useServerFn(inviteUser);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AppRole>("creator");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!email) return;
    setBusy(true);
    try {
      await invite({ data: { email, role, display_name: displayName || undefined } });
      toast.success(`Invite sent to ${email}`);
      setOpen(false); setEmail(""); setDisplayName(""); setRole("creator");
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> Invite user</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite a user</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="employee@example.com" /></div>
          <div className="space-y-1.5"><Label>Display name (optional)</Label><Input value={displayName} onChange={e=>setDisplayName(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <RoleSelect value={role} onChange={setRole} />
            <p className="text-[11px] text-muted-foreground">{APP_ROLE_DESCRIPTIONS[role]}</p>
          </div>
          <Button onClick={submit} disabled={!email || busy} className="w-full">{busy ? "Sending…" : "Send invite"}</Button>
          <p className="text-xs text-muted-foreground">An email will be sent with a sign-in link. The user is activated immediately and assigned the selected role.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
