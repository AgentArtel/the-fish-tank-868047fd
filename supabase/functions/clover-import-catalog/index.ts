// Edge function: clover-import-catalog
//
// Per-handoff rewrite (.lovable/handoff-clover-import-rewrite.md):
//   - Iterate /categories then /categories/{id}/items?expand=itemStock,tags
//     (flat /items silently drops `expand` for this merchant).
//   - Flat pass over /items for uncategorized items (id/name/price/code only).
//   - Dedup by clover_item_id across both passes.
//   - Capture clover_category_id/name, clover_code (UPC), clover_price_type,
//     clover_modified_time on clover_item_links.
//   - DO NOT import itemStock.quantity (all zero — meaningless).
//   - Seed inventory_items.item_type ONLY when null, from category:
//       Coral->coral · Fish->fish · Inverts->invert · Dry Goods/Food/Water->dry_good
//   - Leave quantities + pricing_status alone.
//
// Orphan-safety key (attrs.clover_item_id) preserved.

import {
  corsHeaders,
  json,
  requireAdminCaller,
  requireCloverCreds,
  cloverGet,
  looksLikeCoral,
  type CloverCreds,
} from "../_shared/clover.ts";

type EnrichedItem = {
  id: string;
  name: string;
  priceCents: number | null;
  priceType: string | null;
  code: string | null;
  modifiedTime: number | null;
  categoryId: string | null;
  categoryName: string | null;
};

// Coral · Fish · Inverts · Dry Goods · Food · Water  → item_type
function categoryToItemType(name: string | null): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (n === "coral" || n === "corals") return "coral";
  if (n === "fish") return "fish";
  if (n === "inverts" || n === "invert" || n === "invertebrates") return "invert";
  if (n === "dry goods" || n === "food" || n === "water") return "dry_good";
  return null;
}

async function listCategories(creds: CloverCreds): Promise<Array<{ id: string; name: string }>> {
  const out: Array<{ id: string; name: string }> = [];
  let offset = 0;
  while (offset < 5_000) {
    const j = await cloverGet(creds, `/v3/merchants/${creds.merchantId}/categories`, {
      limit: 100,
      offset,
    });
    const els: any[] = j.elements ?? [];
    for (const c of els) out.push({ id: c.id, name: c.name ?? "(unnamed)" });
    if (els.length < 100) break;
    offset += 100;
  }
  return out;
}

async function listItemsInCategory(
  creds: CloverCreds,
  cat: { id: string; name: string },
): Promise<EnrichedItem[]> {
  const out: EnrichedItem[] = [];
  let offset = 0;
  while (offset < 20_000) {
    const j = await cloverGet(
      creds,
      `/v3/merchants/${creds.merchantId}/categories/${cat.id}/items`,
      { expand: "itemStock,tags", limit: 100, offset },
    );
    const els: any[] = j.elements ?? [];
    for (const e of els) {
      if (e.hidden) continue;
      out.push({
        id: e.id,
        name: e.name ?? "(unnamed)",
        priceCents: typeof e.price === "number" ? e.price : null,
        priceType: e.priceType ?? null,
        code: e.code ?? null,
        modifiedTime: typeof e.modifiedTime === "number" ? e.modifiedTime : null,
        categoryId: cat.id,
        categoryName: cat.name,
      });
    }
    if (els.length < 100) break;
    offset += 100;
  }
  return out;
}

async function listAllItemsFlat(creds: CloverCreds): Promise<EnrichedItem[]> {
  const out: EnrichedItem[] = [];
  let offset = 0;
  while (offset < 50_000) {
    const j = await cloverGet(creds, `/v3/merchants/${creds.merchantId}/items`, {
      limit: 100,
      offset,
    });
    const els: any[] = j.elements ?? [];
    for (const e of els) {
      if (e.hidden) continue;
      out.push({
        id: e.id,
        name: e.name ?? "(unnamed)",
        priceCents: typeof e.price === "number" ? e.price : null,
        priceType: e.priceType ?? null,
        code: e.code ?? null,
        modifiedTime: typeof e.modifiedTime === "number" ? e.modifiedTime : null,
        categoryId: null,
        categoryName: null,
      });
    }
    if (els.length < 100) break;
    offset += 100;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { admin, userId, error } = await requireAdminCaller(req);
  if (error) return error;

  try {
    const creds = await requireCloverCreds(admin);
    const nowIso = new Date().toISOString();

    // ---- Fetch ----
    const categories = await listCategories(creds);

    // Per-category pass (honors expand)
    const byId = new Map<string, EnrichedItem>();
    let perCatCount = 0;
    for (const cat of categories) {
      const items = await listItemsInCategory(creds, cat);
      perCatCount += items.length;
      for (const it of items) {
        // First write wins for category attribution.
        if (!byId.has(it.id)) byId.set(it.id, it);
      }
    }

    // Final flat pass — fills in uncategorized items only.
    const flat = await listAllItemsFlat(creds);
    let flatAdded = 0;
    for (const it of flat) {
      if (byId.has(it.id)) continue;
      byId.set(it.id, it);
      flatAdded++;
    }

    const items = Array.from(byId.values());

    // ---- Index existing inventory + links ----
    const { data: inv } = await admin
      .from("inventory_items")
      .select("id, item_name, item_type, attrs");
    const invByName = new Map<string, string>();
    const invByCloverId = new Map<string, string>();
    const invTypeById = new Map<string, string | null>();
    for (const it of (inv as any[]) ?? []) {
      const nm = (it.item_name ?? "").trim().toLowerCase();
      if (nm && !invByName.has(nm)) invByName.set(nm, it.id);
      const cid = (it.attrs as any)?.clover_item_id;
      if (cid && !invByCloverId.has(cid)) invByCloverId.set(cid, it.id);
      invTypeById.set(it.id, it.item_type ?? null);
    }

    const { data: existingLinks } = await admin
      .from("clover_item_links")
      .select("clover_item_id, inventory_item_id");
    const linkByClover = new Map<string, any>(
      ((existingLinks as any[]) ?? []).map((r) => [r.clover_item_id, r]),
    );

    // ---- Pass 1: upsert links (with enrichment) ----
    const initialLinks = items.map((ci) => {
      const invId =
        linkByClover.get(ci.id)?.inventory_item_id ??
        invByCloverId.get(ci.id) ??
        invByName.get(ci.name.trim().toLowerCase()) ??
        null;
      return {
        clover_item_id: ci.id,
        inventory_item_id: invId,
        clover_name: ci.name,
        clover_price_cents: ci.priceCents,
        clover_category_id: ci.categoryId,
        clover_category_name: ci.categoryName,
        clover_code: ci.code,
        clover_price_type: ci.priceType,
        clover_modified_time: ci.modifiedTime,
        link_status: invId ? "linked" : "unlinked",
        last_synced_at: nowIso,
      };
    });
    let alreadyLinked = initialLinks.filter((l) => l.inventory_item_id).length;
    for (let i = 0; i < initialLinks.length; i += 500) {
      const { error: e } = await admin
        .from("clover_item_links")
        .upsert(initialLinks.slice(i, i + 500), { onConflict: "clover_item_id" });
      if (e) throw new Error(e.message);
    }

    // ---- Pass 2: create drafts for still-unlinked items + relink ----
    let created = 0;
    let relinked = 0;
    let processed = 0;
    const CHUNK = 200;

    while (true) {
      const { data: pending } = await admin
        .from("clover_item_links")
        .select(
          "clover_item_id, clover_name, clover_price_cents, clover_category_name, clover_price_type",
        )
        .is("inventory_item_id", null)
        .order("clover_item_id")
        .limit(CHUNK);
      const batch = (pending as any[]) ?? [];
      if (batch.length === 0) break;
      processed += batch.length;

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
          const hasPrice =
            typeof b.clover_price_cents === "number" && b.clover_price_type !== "VARIABLE";
          const typeFromCat = categoryToItemType(b.clover_category_name);
          const itemType =
            typeFromCat ?? (looksLikeCoral(b.clover_name ?? "") ? "coral" : null);
          return {
            item_name: b.clover_name ?? "(unnamed)",
            item_type: itemType,
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
      relinked += Math.max(0, linkUpserts.length - (toCreate.length || 0));
      if (linkUpserts.length) {
        const { error: e } = await admin
          .from("clover_item_links")
          .upsert(linkUpserts, { onConflict: "clover_item_id" });
        if (e) throw new Error(e.message);
      }

      await admin
        .from("clover_connection")
        .update({ connected: true, last_import_at: nowIso })
        .eq("id", true);

      if (batch.length < CHUNK) break;
    }

    // ---- Pass 3: seed item_type on linked rows where still null ----
    // (Backfill for pre-existing inventory_items that imported before this rewrite.)
    let typeSeeded = 0;
    const { data: linkedForSeed } = await admin
      .from("clover_item_links")
      .select("inventory_item_id, clover_category_name, clover_name")
      .not("inventory_item_id", "is", null)
      .not("clover_category_name", "is", null);

    const updatesByType = new Map<string, string[]>();
    for (const row of (linkedForSeed as any[]) ?? []) {
      const invId = row.inventory_item_id as string;
      const currentType = invTypeById.get(invId);
      if (currentType) continue; // never clobber
      const t = categoryToItemType(row.clover_category_name);
      if (!t) continue;
      if (!updatesByType.has(t)) updatesByType.set(t, []);
      updatesByType.get(t)!.push(invId);
    }
    for (const [t, ids] of updatesByType) {
      for (let i = 0; i < ids.length; i += 500) {
        const slice = ids.slice(i, i + 500);
        const { error: e } = await admin
          .from("inventory_items")
          .update({ item_type: t })
          .in("id", slice)
          .is("item_type", null);
        if (e) throw new Error(e.message);
        typeSeeded += slice.length;
      }
    }

    return json({
      ok: true,
      categoriesIterated: categories.length,
      perCategoryItems: perCatCount,
      flatAddedUncategorized: flatAdded,
      totalUniqueItems: items.length,
      alreadyLinked,
      processed,
      created,
      relinked,
      typeSeeded,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? String(e) }, 500);
  }
});
