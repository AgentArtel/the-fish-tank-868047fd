import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isTransitionAllowed, type ContentStatus } from "./workflow";

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
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
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    next: z.enum(["idea","needs_media","drafting","needs_review","approved","scheduled","posted","archived"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("content_items").select("status").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const current = row.status as ContentStatus;
    if (!isTransitionAllowed(current, data.next)) {
      throw new Error(`Cannot move ${current} → ${data.next}`);
    }
    if (data.next === "approved") {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const ok = (roles ?? []).some((r: any) => r.role === "admin" || r.role === "reviewer");
      if (!ok) throw new Error("Only reviewers or admins can approve");
    }
    const patch: Record<string, unknown> = { status: data.next };
    if (data.next === "posted") patch.posted_date = new Date().toISOString();
    const { error: upErr } = await supabase.from("content_items").update(patch).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const getSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("media").createSignedUrl(data.path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const approveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    userId: z.string().uuid(),
    role: z.enum(["admin","creator","reviewer"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Admins only");
    await supabase.from("profiles").update({
      is_active: true, approved_at: new Date().toISOString(), approved_by: userId,
    }).eq("id", data.userId);
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
    await context.supabase.from("profiles").update({ is_active: data.active }).eq("id", data.userId);
    return { ok: true };
  });
