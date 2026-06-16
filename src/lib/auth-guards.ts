// Canonical server-fn auth guards. Import these instead of re-defining the same
// helpers per file. The role model: an "editor" is admin | creator | reviewer
// (manager/staff/viewer are intentionally not editors); guards check is_active
// (account approved) before the role. `requireActive`-only = any approved user.
//
// All take the per-request user-scoped Supabase client + the caller's userId.
// (Kept `any`-typed to avoid threading the generated DB types through every fn.)

export async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => r.role === "admin");
}

export async function requireActive(supabase: any, userId: string): Promise<void> {
  const { data } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!data?.is_active) throw new Error("Forbidden: account pending approval");
}

export async function requireAdmin(supabase: any, userId: string): Promise<void> {
  await requireActive(supabase, userId);
  if (!(await isAdmin(supabase, userId))) throw new Error("Forbidden: admin role required");
}

export async function requireEditor(supabase: any, userId: string): Promise<void> {
  await requireActive(supabase, userId);
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some(
    (r: any) => r.role === "admin" || r.role === "creator" || r.role === "reviewer",
  );
  if (!ok) throw new Error("Forbidden: editor role required");
}
