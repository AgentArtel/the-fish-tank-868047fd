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
// Phase 2 — species image sourcing + human approve.
//
// Draft-only / human-in-the-loop. Every external (Wikipedia / iNaturalist /
// vendor-Firecrawl) and AI step is wrapped so one failure is skipped and never
// breaks the whole run. NO auto-publish, NO Facebook. A human approves every
// image before it becomes a media asset on the post.
// =========================================================================

// Approved candidate images are materialized into media_assets / the media
// library. The media library (media.tsx, getSignedUrl) signs from the "media"
// bucket, so approved images must land there. downloadImage (reused) targets the
// "inventory-media" bucket, which is the wrong bucket for media_assets — so on
// APPROVE we fetch+upload into "media" with this tiny helper (no scraper logic;
// just fetch → upload, mirroring downloadImage's shape). downloadImage stays the
// precedent / reused helper for any inventory-media materialization.
async function materializeIntoMediaBucket(
  supabaseAdmin: any,
  opts: { url: string; bucketPath: string },
): Promise<string> {
  const res = await fetch(opts.url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "image/*,*/*",
    },
  });
  if (!res.ok) throw new Error(`Image fetch ${res.status} for ${opts.url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const { error } = await supabaseAdmin.storage
    .from("media")
    .upload(opts.bucketPath, buf, { contentType, upsert: true });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  return opts.bucketPath;
}

const ARRIVAL_IMG_TYPES = ["fish", "coral", "invert", "live_rock"] as const;

// List candidates for a post (grouped client-side). Active-staff read.
export const listSpeciesImageCandidates = createServerFn({ method: "POST" })
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
    if (!item?.source_vendor_batch_id) return { lines: [], candidates: [] };

    const { data: lines } = await supabase
      .from("vendor_line_items")
      .select("id, clean_item_name, raw_description, scientific_name, item_type")
      .eq("vendor_batch_id", item.source_vendor_batch_id)
      .eq("kind", "sellable")
      // Livestock OR not-yet-classified (item_type NULL after AI extraction).
      .or(`item_type.is.null,item_type.in.(${ARRIVAL_IMG_TYPES.join(",")})`)
      .order("line_number", { nullsFirst: false });

    const lineIds = (lines ?? []).map((l: any) => l.id);
    let candidates: any[] = [];
    if (lineIds.length) {
      const { data: cands } = await supabase
        .from("species_image_candidates")
        .select(
          "id, vendor_line_item_id, species_key, source, source_url, image_url, license, attribution, commercial_ok, ai_match_confidence, storage_path, approved, approved_at",
        )
        .in("vendor_line_item_id", lineIds)
        .order("ai_match_confidence", { ascending: false, nullsFirst: false });
      candidates = cands ?? [];
    }
    return { lines: lines ?? [], candidates };
  });

export const approveSpeciesImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ candidateId: z.string().uuid(), contentItemId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireEditor(supabase, userId);

    const { data: cand, error: candErr } = await supabase
      .from("species_image_candidates")
      .select(
        "id, vendor_line_item_id, species_key, source, source_url, image_url, license, attribution, commercial_ok, storage_path, approved",
      )
      .eq("id", data.candidateId)
      .maybeSingle();
    if (candErr) throw new Error(candErr.message);
    if (!cand) throw new Error("Candidate not found");

    // Confirm the post is linked to a batch (and exists). Draft-only — we never
    // change the post's status here.
    const { data: item } = await supabase
      .from("content_items")
      .select("id")
      .eq("id", data.contentItemId)
      .maybeSingle();
    if (!item) throw new Error("Content item not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Materialize the remote image into the media bucket (idempotent path).
    const ext = (cand.image_url.split("?")[0].split(".").pop() || "jpg").toLowerCase().slice(0, 5);
    const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
    const bucketPath = `species/${data.candidateId}.${safeExt}`;
    let storagePath = cand.storage_path as string | null;
    if (!storagePath) {
      storagePath = await materializeIntoMediaBucket(supabaseAdmin, {
        url: cand.image_url,
        bucketPath,
      });
    }

    // Map the candidate license → media_assets usage_rights enum.
    const usageRights =
      cand.source === "vendor"
        ? "vendor_allowed"
        : cand.commercial_ok
          ? "owned"
          : "needs_permission";

    const fileName = `${(cand.species_key || "species").toString().slice(0, 80)} (${cand.source})`;
    const sourceNotes = [
      cand.attribution ? `Attribution: ${cand.attribution}` : null,
      cand.license ? `License: ${cand.license}` : null,
      cand.source_url ? `Source: ${cand.source_url}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    const { data: asset, error: assetErr } = await supabase
      .from("media_assets")
      .insert({
        file_name: fileName,
        media_type: "image",
        storage_path: storagePath,
        source_type: "vendor_asset",
        usage_rights: usageRights,
        source_notes: sourceNotes || null,
        alt_text: cand.species_key || null,
        uploader_id: userId,
      })
      .select("id")
      .single();
    if (assetErr) throw new Error(assetErr.message);

    // Link to the post via content_media (skip if already linked).
    const { error: linkErr } = await supabase.from("content_media").insert({
      content_item_id: data.contentItemId,
      media_asset_id: asset.id,
    });
    if (linkErr && !/duplicate|unique/i.test(linkErr.message)) {
      throw new Error(linkErr.message);
    }

    // Flag the candidate approved.
    const { error: upErr } = await supabase
      .from("species_image_candidates")
      .update({
        storage_path: storagePath,
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: userId,
      })
      .eq("id", data.candidateId);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, mediaAssetId: asset.id };
  });

export const rejectSpeciesImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ candidateId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireEditor(supabase, userId);
    // Reject = remove the candidate row (it was never approved/materialized).
    const { error } = await supabase
      .from("species_image_candidates")
      .delete()
      .eq("id", data.candidateId)
      .eq("approved", false);
    if (error) throw new Error(error.message);
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
