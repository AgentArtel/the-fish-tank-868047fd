// Edge function: clover-import-catalog
// Full Clover catalog → upsert clover_item_links → create workspace inventory
// drafts for any still-unlinked items, in ONE server-side pass. Replaces the
// browser-chunked importCloverCatalog + createWorkspaceItemsFromClover pair —
// no Cloudflare Worker budget here, so we don't need to chunk back to the client.
//
// Orphan-safety key (attrs.clover_item_id) is preserved: a prior interrupted run
// may have created the inventory_item but missed writing the link row, so we
// re-link by attrs.clover_item_id before creating duplicates.

import {
  corsHeaders,
  json,
  requireAdminCaller,
  requireCloverCreds,
  cloverListItems,
  looksLikeCoral,
} from "../_shared/clover.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { admin, userId, error } = await requireAdminCaller(req);
  if (error) return error;

  try {
    const creds = await requireCloverCreds(admin);
    const items = await cloverListItems(creds);
    const nowIso = new Date().toISOString();

    // 1) Index existing workspace inventory by name + by attrs.clover_item_id provenance.
    const { data: inv } = await admin.from("inventory_items").select("id, item_name, attrs");
    const invByName = new Map<string, string>();
    const invByCloverId = new Map<string, string>();
    for (const it of (inv as any[]) ?? []) {
      const nm = (it.item_name ?? "").trim().toLowerCase();
      if (nm && !invByName.has(nm)) invByName.set(nm, it.id);
      const cid = (it.attrs as any)?.clover_item_id;
      if (cid && !invByCloverId.has(cid)) invByCloverId.set(cid, it.id);
    }

    // 2) Existing link rows — preserve already-assigned inventory_item_id.
    const { data: existingLinks } = await admin
      .from("clover_item_links")
      .select("clover_item_id, inventory_item_id");
    const linkByClover = new Map<string, any>(
      ((existingLinks as any[]) ?? []).map((r) => [r.clover_item_id, r]),
    );

    // 3) First link-upsert pass: link to any pre-existing inventory_item we can find.
    const initialLinks: any[] = [];
    let alreadyLinked = 0;
    for (const ci of items) {
      const invId =
        linkByClover.get(ci.id)?.inventory_item_id ??
        invByCloverId.get(ci.id) ??
        invByName.get(ci.name.trim().toLowerCase()) ??
        null;
      if (invId) alreadyLinked++;
      initialLinks.push({
        clover_item_id: ci.id,
        inventory_item_id: invId,
        clover_name: ci.name,
        clover_price_cents: ci.priceCents,
        link_status: invId ? "linked" : "unlinked",
        last_synced_at: nowIso,
      });
    }
    for (let i = 0; i < initialLinks.length; i += 500) {
      const { error: e } = await admin
        .from("clover_item_links")
        .upsert(initialLinks.slice(i, i + 500), { onConflict: "clover_item_id" });
      if (e) throw new Error(e.message);
    }

    // 4) Create workspace drafts for all still-unlinked clover items, in chunks.
    //    Done in the single server-side request — no browser loop.
    let created = 0;
    let relinked = 0;
    let processed = 0;
    const CHUNK = 200;

    while (true) {
      const { data: pending } = await admin
        .from("clover_item_links")
        .select("clover_item_id, clover_name, clover_price_cents")
        .is("inventory_item_id", null)
        .order("clover_item_id")
        .limit(CHUNK);
      const batch = (pending as any[]) ?? [];
      if (batch.length === 0) break;
      processed += batch.length;

      // Orphan-safety: re-link by attrs.clover_item_id before duplicating.
      const cloverIds = batch.map((b) => b.clover_item_id);
      const { data: orphans } = await admin
        .from("inventory_items")
        .select("id, attrs")
        .in("attrs->>clover_item_id", cloverIds);
      const itemByClover = new Map<string, string>();
      for (const it of (orphans as any[]) ?? []) {
        const cid = (it.attrs as any)?.clover_item_id;
        if (cid && !itemByClover.has(cid)) itemByClover.set(cid, it.id);
      }

      const toCreate = batch.filter((b) => !itemByClover.has(b.clover_item_id));
      if (toCreate.length) {
        const rows = toCreate.map((b) => {
          const hasPrice = typeof b.clover_price_cents === "number";
          return {
            item_name: b.clover_name ?? "(unnamed)",
            item_type: looksLikeCoral(b.clover_name ?? "") ? "coral" : null,
            quantity_received: 0,
            quantity_available: 0,
            wholesale_cost: null,
            retail_price: hasPrice ? b.clover_price_cents / 100 : null,
            pricing_status: hasPrice ? "approved" : "not_priced",
            availability_status: "not_for_sale",
            live_sale_status: "not_eligible",
            needs_photo: true,
            notes: "Imported from Clover POS",
            attrs: { source: "clover", clover_item_id: b.clover_item_id },
            created_by: userId,
          };
        });
        const { data: createdRows, error: insErr } = await admin
          .from("inventory_items")
          .insert(rows)
          .select("id, attrs");
        if (insErr) throw new Error(insErr.message);
        for (const r of (createdRows as any[]) ?? []) {
          const cid = (r.attrs as any)?.clover_item_id;
          if (cid) {
            itemByClover.set(cid, r.id);
            created++;
          }
        }
      }

      const linkUpserts = batch
        .map((b) => {
          const invId = itemByClover.get(b.clover_item_id) ?? null;
          if (!invId) return null;
          return {
            clover_item_id: b.clover_item_id,
            inventory_item_id: invId,
            clover_name: b.clover_name,
            clover_price_cents: b.clover_price_cents,
            link_status: "linked",
            last_synced_at: nowIso,
          };
        })
        .filter(Boolean);
      relinked += linkUpserts.length - (toCreate.length || 0);
      if (linkUpserts.length) {
        const { error: e } = await admin
          .from("clover_item_links")
          .upsert(linkUpserts, { onConflict: "clover_item_id" });
        if (e) throw new Error(e.message);
      }

      // Checkpoint after each chunk.
      await admin
        .from("clover_connection")
        .update({ connected: true, last_import_at: nowIso })
        .eq("id", true);

      if (batch.length < CHUNK) break;
    }

    return json({
      ok: true,
      fetched: items.length,
      alreadyLinked,
      processed,
      created,
      relinked: Math.max(0, relinked),
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? String(e) }, 500);
  }
});
