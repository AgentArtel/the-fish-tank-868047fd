import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isTransitionAllowed, type ContentStatus } from "./workflow";

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, display_name, avatar_url, is_active")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    return {
      userId,
      profile,
      roles: (roles ?? []).map((r: any) => r.role as string),
      isActive: !!profile?.is_active,
    };
  });

export const updateContentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        next: z.enum([
          "idea",
          "needs_media",
          "drafting",
          "needs_review",
          "approved",
          "scheduled",
          "posted",
          "archived",
        ]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!prof?.is_active) throw new Error("Forbidden: account pending approval");
    const { data: row, error } = await supabase
      .from("content_items")
      .select("status")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const current = row.status as ContentStatus;
    if (!isTransitionAllowed(current, data.next)) {
      throw new Error(`Cannot move ${current} → ${data.next}`);
    }
    if (data.next === "approved") {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const ok = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "reviewer");
      if (!ok) throw new Error("Only reviewers or admins can approve");
    }
    const patch = {
      status: data.next,
      ...(data.next === "posted" ? { posted_date: new Date().toISOString() } : {}),
    };
    const { error: upErr } = await supabase.from("content_items").update(patch).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const getSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!prof?.is_active) throw new Error("Forbidden: account pending approval");
    const { data: signed, error } = await context.supabase.storage
      .from("media")
      .createSignedUrl(data.path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

const ROLE_ENUM = z.enum(["admin", "manager", "creator", "reviewer", "staff", "viewer"]);

export const approveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        role: ROLE_ENUM,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Admins only");
    await supabase
      .from("profiles")
      .update({
        is_active: true,
        approved_at: new Date().toISOString(),
        approved_by: userId,
      })
      .eq("id", data.userId);
    await supabase.from("user_roles").insert({ user_id: data.userId, role: data.role });
    return { ok: true };
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        role: ROLE_ENUM,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Admins only");
    await supabase.from("user_roles").delete().eq("user_id", data.userId);
    await supabase.from("user_roles").insert({ user_id: data.userId, role: data.role });
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Admins only");
    await context.supabase
      .from("profiles")
      .update({ is_active: data.active })
      .eq("id", data.userId);
    return { ok: true };
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        role: ROLE_ENUM,
        display_name: z.string().trim().min(1).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Admins only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invited, error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      {
        data: data.display_name ? { display_name: data.display_name } : undefined,
      },
    );
    if (invErr) throw new Error(invErr.message);
    const newUserId = invited.user?.id;
    if (!newUserId) throw new Error("Invite created but no user id returned");
    // handle_new_user trigger created the profile row (is_active=false). Activate + assign role.
    await supabaseAdmin
      .from("profiles")
      .update({
        is_active: true,
        approved_at: new Date().toISOString(),
        approved_by: userId,
        ...(data.display_name ? { display_name: data.display_name } : {}),
      })
      .eq("id", newUserId);
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: newUserId, role: data.role }, { onConflict: "user_id,role" });
    return { ok: true, userId: newUserId };
  });
