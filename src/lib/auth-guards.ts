// Canonical server-fn auth guards. Import these instead of re-defining the same
// helpers per file. The role model is just three: `admin · dev · floor_staff`.
//   - `admin` / `dev` are the editor/superuser tier (dev = technical admin-tier).
//   - `floor_staff` is the employee write-tier — but only via SECURITY DEFINER
//     RPCs that self-check `is_floor_staff_or_above`; they are NOT editors.
// Guards check is_active (account approved) before the role. `requireActive`-only
// = any approved user. These mirror the DB helpers `is_admin_or_dev` /
// `is_floor_staff_or_above`.
//
// All take the per-request user-scoped Supabase client + the caller's userId.
// (Kept `any`-typed to avoid threading the generated DB types through every fn.)

// admin | dev — the editor/superuser tier.
export async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => r.role === "admin" || r.role === "dev");
}

// admin | dev | floor_staff — anyone who can run employee-wizard operations.
export async function isFloorStaffOrAbove(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some(
    (r: any) => r.role === "admin" || r.role === "dev" || r.role === "floor_staff",
  );
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

// Editor tier === admin | dev (content is admin/dev-only in the 3-role model).
export async function requireEditor(supabase: any, userId: string): Promise<void> {
  await requireActive(supabase, userId);
  if (!(await isAdmin(supabase, userId))) throw new Error("Forbidden: editor role required");
}

// Floor-staff-or-above — the predicate for employee-wizard server fns / RPC calls.
export async function requireFloorStaff(supabase: any, userId: string): Promise<void> {
  await requireActive(supabase, userId);
  if (!(await isFloorStaffOrAbove(supabase, userId)))
    throw new Error("Forbidden: floor staff role required");
}
