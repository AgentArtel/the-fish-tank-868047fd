import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isTransitionAllowed, type ContentStatus } from "./workflow";
import { requireAdmin, requireEditor } from "@/lib/auth-guards";

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

// Phase 1A: build a draft "new arrivals" CMS post from a vendor batch.
// App-lane only — no schema, no external network, no auto-publish. Draft only.
// The batch→post link is recorded in content_items.notes (no FK column exists).
const ARRIVAL_LIVESTOCK_TYPES = ["fish", "coral", "invert", "live_rock"] as const;

export const buildArrivalPostFromBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ batchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!prof?.is_active) throw new Error("Forbidden: account pending approval");

    const { data: batch, error: batchErr } = await supabase
      .from("vendor_batches")
      .select("id, invoice_number, arrival_date, invoice_date, vendors(name)")
      .eq("id", data.batchId)
      .maybeSingle();
    if (batchErr) throw new Error(batchErr.message);
    if (!batch) throw new Error("Batch not found");

    const { data: lines, error: linesErr } = await supabase
      .from("vendor_line_items")
      .select("clean_item_name, raw_description, scientific_name, item_type, quantity, kind")
      .eq("vendor_batch_id", data.batchId)
      .eq("kind", "sellable")
      // Livestock OR not-yet-classified: AI extraction sets kind='sellable' but
      // leaves item_type NULL until lines are classified, so an unclassified
      // (freshly-extracted) batch must still count. Once classified, dry goods
      // /equipment drop out.
      .or(`item_type.is.null,item_type.in.(${ARRIVAL_LIVESTOCK_TYPES.join(",")})`)
      .order("line_number", { nullsFirst: false });
    if (linesErr) throw new Error(linesErr.message);

    const livestock = lines ?? [];
    if (livestock.length === 0) {
      throw new Error("No livestock lines (fish/coral/invert/live rock) on this batch yet.");
    }

    const invoiceLabel =
      batch.invoice_number ||
      batch.arrival_date ||
      batch.invoice_date ||
      new Date().toISOString().slice(0, 10);
    const vendorName = (batch.vendors as any)?.name ?? "our supplier";

    // Build a simple, editable plain-text/markdown caption: intro + one line per species.
    const speciesLines = livestock.map((l) => {
      const name = (l.clean_item_name || l.raw_description || "New arrival").toString().trim();
      const sci = l.scientific_name?.toString().trim();
      const qty = l.quantity != null ? Math.round(Number(l.quantity)) : null;
      let line = `- ${name}`;
      if (sci) line += ` (*${sci}*)`;
      if (qty != null && qty > 0) line += ` — ${qty} available`;
      return line;
    });
    const caption = [
      `Fresh arrivals just landed from ${vendorName}! Here's what's new this week:`,
      "",
      ...speciesLines,
      "",
      "Come by the shop or message us to reserve yours.",
    ].join("\n");

    const title = `New arrivals — ${invoiceLabel}`;
    const notes = `Source vendor batch: ${batch.invoice_number || data.batchId}`;

    const { data: inserted, error: insErr } = await supabase
      .from("content_items")
      .insert({
        title,
        content_type: "announcement",
        status: "idea",
        caption,
        notes,
        source_vendor_batch_id: data.batchId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    // Auto-attach any previously-uploaded images for these species. So the
    // second time a fish shows up in a PO, the draft post comes back already
    // illustrated — no clicks needed.
    const keys = Array.from(
      new Set(livestock.map((l) => speciesKeyFromLine(l)).filter(Boolean) as string[]),
    );
    if (keys.length) {
      const { data: assets } = await supabase
        .from("media_assets")
        .select("id, species_key, created_at")
        .in("species_key", keys)
        .eq("media_type", "image")
        .order("created_at", { ascending: false });
      // Pick the most-recent asset per species_key.
      const picked = new Map<string, string>();
      for (const a of assets ?? []) {
        const k = (a as any).species_key as string;
        if (!picked.has(k)) picked.set(k, (a as any).id);
      }
      if (picked.size) {
        await supabase.from("content_media").insert(
          Array.from(picked.values()).map((mediaAssetId) => ({
            content_item_id: inserted.id,
            media_asset_id: mediaAssetId,
          })),
        );
      }
    }

    return { contentItemId: inserted.id };
  });

// Delete a content item (admin-only, matching the content_items DELETE RLS).
// content_media / content_platforms cascade on delete; species_image_candidates
// are per vendor line (shared) and are left untouched.
export const deleteContentItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { error } = await supabase.from("content_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
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

// =========================================================================
// Species image library — manual upload, reused across PO posts.
//
// One image per species lives in media_assets keyed by species_key. The next
// time the same species shows up on a vendor batch, we look up the existing
// asset and auto-attach it to the new draft post — no re-upload needed.
// =========================================================================

const ARRIVAL_IMG_TYPES = ["fish", "coral", "invert", "live_rock"] as const;

// Normalize a species name to the lookup key. Prefers scientific over common.
export function speciesKeyFromLine(line: {
  scientific_name?: string | null;
  clean_item_name?: string | null;
  raw_description?: string | null;
}): string | null {
  const raw = line.scientific_name || line.clean_item_name || line.raw_description;
  if (!raw) return null;
  const k = raw.toString().trim().toLowerCase();
  return k || null;
}

// List livestock lines on the batch tied to this post + any media_assets that
// already match those species (so we can show "already uploaded — attach" vs.
// "needs upload"). Active-staff read.
export const listSpeciesMediaForPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ contentItemId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!prof?.is_active) throw new Error("Forbidden: account pending approval");

    const { data: item } = await supabase
      .from("content_items")
      .select("source_vendor_batch_id")
      .eq("id", data.contentItemId)
      .maybeSingle();
    if (!item?.source_vendor_batch_id) return { lines: [], assetsByKey: {} as Record<string, any[]>, attachedAssetIds: [] as string[] };

    const { data: lines } = await supabase
      .from("vendor_line_items")
      .select("id, clean_item_name, raw_description, scientific_name, item_type")
      .eq("vendor_batch_id", item.source_vendor_batch_id)
      .eq("kind", "sellable")
      .or(`item_type.is.null,item_type.in.(${ARRIVAL_IMG_TYPES.join(",")})`)
      .order("line_number", { nullsFirst: false });

    const keys = Array.from(
      new Set((lines ?? []).map((l: any) => speciesKeyFromLine(l)).filter(Boolean) as string[]),
    );
    let assetsByKey: Record<string, any[]> = {};
    if (keys.length) {
      const { data: assets } = await supabase
        .from("media_assets")
        .select("id, file_name, storage_path, media_type, alt_text, species_key, created_at")
        .in("species_key", keys)
        .eq("media_type", "image")
        .order("created_at", { ascending: false });
      for (const a of assets ?? []) {
        const k = (a as any).species_key as string;
        (assetsByKey[k] ??= []).push(a);
      }
    }

    const { data: attached } = await supabase
      .from("content_media")
      .select("media_asset_id")
      .eq("content_item_id", data.contentItemId);

    return {
      lines: lines ?? [],
      assetsByKey,
      attachedAssetIds: (attached ?? []).map((r: any) => r.media_asset_id),
    };
  });

// Attach an existing media_asset to the post (idempotent on duplicate link).
export const attachMediaToPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ contentItemId: z.string().uuid(), mediaAssetId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireEditor(supabase, userId);
    const { error } = await supabase.from("content_media").insert({
      content_item_id: data.contentItemId,
      media_asset_id: data.mediaAssetId,
    });
    if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

// --- Workspace content settings (admin-only singleton) ---
export const getContentSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!prof?.is_active) throw new Error("Forbidden: account pending approval");
    const { data } = await supabase
      .from("workspace_content_settings")
      .select("vendor_photos_ok, vendor_photos_ok_attested_at")
      .limit(1)
      .maybeSingle();
    return {
      vendorPhotosOk: !!data?.vendor_photos_ok,
      attestedAt: data?.vendor_photos_ok_attested_at ?? null,
    };
  });

export const setVendorPhotosOk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ok: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    // Singleton: update the existing row, else insert one.
    const { data: existing } = await supabase
      .from("workspace_content_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    const patch = {
      vendor_photos_ok: data.ok,
      vendor_photos_ok_attested_at: data.ok ? new Date().toISOString() : null,
      vendor_photos_ok_attested_by: data.ok ? userId : null,
      updated_by: userId,
    };
    if (existing) {
      const { error } = await supabase
        .from("workspace_content_settings")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("workspace_content_settings").insert(patch);
      if (error) throw new Error(error.message);
    }
    return { ok: true, vendorPhotosOk: data.ok };
  });
