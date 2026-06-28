// Publish-to-website edge function.
//
// Copies an inventory item's primary `inventory-media` photo (PRIVATE bucket)
// into the `public-media` bucket at `inventory/<item_id>/<filename>`, then
// upserts an `inventory_media` row tagged 'website' (is_primary=true) pointing
// at the new public path. Idempotent: re-publishing overwrites the file and
// updates the existing website row.
//
// The DB trigger compute_inventory_website_ready then flips is_website_ready,
// which surfaces the item in v_public_inventory.
//
// Invoke contract
// ----------------
// POST https://<project-ref>.functions.supabase.co/publish-inventory-item
// Headers:
//   Authorization: Bearer <user JWT>     // editor/admin session
//   apikey:        <publishable key>
//   Content-Type:  application/json
// Body:
//   { "inventory_item_id": "<uuid>" }
// Response 200:
//   { "ok": true, "inventory_media_id": "<uuid>", "public_path": "inventory/<id>/<name>" }
// Response 4xx/5xx:
//   { "ok": false, "error": "..." }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SRC_BUCKET = "inventory-media";
const DST_BUCKET = "public-media";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ ok: false, error: "Missing bearer token" }, 401);
    }

    // 1) Identify the caller and verify editor/admin role.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isEditor } = await admin.rpc("is_floor_staff_or_above", { _user_id: userId });
    if (!isEditor) return json({ ok: false, error: "Forbidden: editor role required" }, 403);

    // 2) Parse + validate input.
    const body = (await req.json().catch(() => ({}))) as { inventory_item_id?: string };
    const itemId = body.inventory_item_id;
    if (!itemId || typeof itemId !== "string") {
      return json({ ok: false, error: "inventory_item_id (uuid) required" }, 400);
    }

    // 3) Find the primary inventory-media source row.
    const { data: srcRow, error: srcErr } = await admin
      .from("inventory_media")
      .select("id, storage_path, view, is_primary")
      .eq("inventory_item_id", itemId)
      .neq("tag", "website")
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (srcErr) return json({ ok: false, error: `media lookup: ${srcErr.message}` }, 500);
    if (!srcRow?.storage_path) {
      return json({ ok: false, error: "No source photo found in inventory-media" }, 404);
    }

    // 4) Download source from private bucket.
    const { data: file, error: dlErr } = await admin.storage
      .from(SRC_BUCKET)
      .download(srcRow.storage_path);
    if (dlErr || !file) return json({ ok: false, error: `download: ${dlErr?.message}` }, 500);

    const filename = srcRow.storage_path.split("/").pop() || `${crypto.randomUUID()}.jpg`;
    const dstPath = `inventory/${itemId}/${filename}`;

    // 5) Upload (overwrite) into public bucket.
    const { error: upErr } = await admin.storage
      .from(DST_BUCKET)
      .upload(dstPath, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (upErr) return json({ ok: false, error: `upload: ${upErr.message}` }, 500);

    // 6) Upsert the website-tagged inventory_media row.
    const { data: existing } = await admin
      .from("inventory_media")
      .select("id")
      .eq("inventory_item_id", itemId)
      .eq("tag", "website")
      .maybeSingle();

    let mediaId: string;
    if (existing?.id) {
      const { data: updated, error: updErr } = await admin
        .from("inventory_media")
        .update({
          storage_path: dstPath,
          is_primary: true,
          view: srcRow.view ?? "daylight",
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (updErr) return json({ ok: false, error: `update media: ${updErr.message}` }, 500);
      mediaId = updated.id;
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("inventory_media")
        .insert({
          inventory_item_id: itemId,
          storage_path: dstPath,
          tag: "website",
          is_primary: true,
          view: srcRow.view ?? "daylight",
          uploaded_by: userId,
        })
        .select("id")
        .single();
      if (insErr) return json({ ok: false, error: `insert media: ${insErr.message}` }, 500);
      mediaId = inserted.id;
    }

    return json({ ok: true, inventory_media_id: mediaId, public_path: dstPath });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
