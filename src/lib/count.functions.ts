import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireEditor } from "@/lib/auth-guards";

// Inventory count / baseline (wizard 3). Cold-start: walk the Clover-imported
// catalog one item at a time, set the true type/qty/location/price, and it drops
// out of the queue once placed. Grouped by Clover category. Editor-gated for the
// baseline pass (the owner does it); a floor-staff audit mode needs a SECURITY
// DEFINER RPC later (narrow-write model) — see handoff when we get there.

const UNCATEGORIZED = "Uncategorized";
const ITEM_TYPES = [
  "fish",
  "coral",
  "invert",
  "dry_good",
  "live_rock",
  "equipment",
  "other",
] as const;

// "Needs a baseline" = a Clover-linked item that hasn't been placed in a location yet.
// As you set a location in the deck, the item leaves the queue.
export const getCountCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;
    const { data, error } = await db
      .from("clover_item_links")
      .select("clover_category_name, inventory_items!inner(id, location_id)")
      .not("inventory_item_id", "is", null)
      .limit(5000);
    if (error) throw new Error(error.message);

    const groups = new Map<string, { needs: number; total: number }>();
    const seen = new Set<string>();
    for (const r of data ?? []) {
      const it = r.inventory_items;
      if (!it || seen.has(it.id)) continue;
      seen.add(it.id);
      const key = r.clover_category_name || UNCATEGORIZED;
      const g = groups.get(key) ?? { needs: 0, total: 0 };
      g.total++;
      if (it.location_id == null) g.needs++;
      groups.set(key, g);
    }
    const rows = [...groups.entries()]
      .map(([category, g]) => ({ category, needs: g.needs, total: g.total }))
      .sort((a, b) => b.needs - a.needs || a.category.localeCompare(b.category));
    const needsTotal = rows.reduce((s, r) => s + r.needs, 0);
    return { rows, needsTotal };
  });

// The cards for one category — items still needing a baseline (no location).
export const getCountDeck = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ category: z.string().min(1).max(160) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;

    let q = db
      .from("clover_item_links")
      .select(
        "clover_category_name, clover_code, clover_price_type, inventory_items!inner(id, item_name, scientific_name, item_type, retail_price, quantity_available, location_id, needs_photo)",
      )
      .not("inventory_item_id", "is", null)
      .limit(3000);
    if (data.category === UNCATEGORIZED) q = q.is("clover_category_name", null);
    else q = q.eq("clover_category_name", data.category);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const seen = new Set<string>();
    const items: any[] = [];
    for (const r of rows ?? []) {
      const it = r.inventory_items;
      if (!it || it.location_id != null || seen.has(it.id)) continue;
      seen.add(it.id);
      items.push({
        id: it.id,
        itemName: it.item_name,
        scientificName: it.scientific_name,
        itemType: it.item_type,
        retailPrice: it.retail_price,
        quantityAvailable: Number(it.quantity_available ?? 0),
        needsPhoto: it.needs_photo,
        cloverCode: r.clover_code,
        cloverPriceType: r.clover_price_type,
      });
    }
    items.sort((a, b) => a.itemName.localeCompare(b.itemName));
    return { items, total: items.length };
  });

// Record one item's baseline: set type/qty/location/price in a single write.
// quantity_received is bumped to keep the inventory_qty_balance CHECK satisfied
// (received >= available + on_hold + sold + lost).
//
// Optionally register a primary photo and take the item LIVE in the same pass
// (count + photo + price → available), so the owner can do all of it per item.
// Going live is gated: needs a photo on file, an approved price, a location, and
// qty>0 — enforced here AND by the inv_guard_gates DB trigger as the backstop.
// Pricing approval + go-live stay editor-tier (admin|dev), per the invariant.
export const recordItemCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        item_type: z.enum(ITEM_TYPES).nullable().optional(),
        quantity: z.number().int().min(0).max(100000),
        location_id: z.string().uuid().nullable().optional(),
        retail_price: z.number().min(0).max(1_000_000).nullable().optional(),
        photo_path: z.string().max(500).optional(),
        photo_file_name: z.string().max(200).optional(),
        take_live: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireEditor(context.supabase, context.userId);
    const db = context.supabase as any;

    const { data: item, error: readErr } = await db
      .from("inventory_items")
      .select("quantity_on_hold, quantity_sold, quantity_lost, retail_price, needs_photo")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!item) throw new Error("Item not found");

    // Register the primary photo FIRST so it's on file before the go-live gate runs.
    if (data.photo_path) {
      const { error: mErr } = await db.from("inventory_media").insert({
        inventory_item_id: data.id,
        storage_path: data.photo_path,
        file_name: data.photo_file_name ?? "count.jpg",
        media_type: "image",
        tag: "internal",
        uploader_id: context.userId,
      });
      if (mErr) throw new Error(`Photo: ${mErr.message}`);
    }

    const reserved =
      Number(item.quantity_on_hold ?? 0) +
      Number(item.quantity_sold ?? 0) +
      Number(item.quantity_lost ?? 0);

    const patch: Record<string, any> = {
      quantity_available: data.quantity,
      quantity_received: data.quantity + reserved,
    };
    if (data.item_type !== undefined) patch.item_type = data.item_type;
    if (data.location_id !== undefined) patch.location_id = data.location_id;
    if (data.retail_price !== undefined) patch.retail_price = data.retail_price;
    if (data.photo_path) patch.needs_photo = false;

    if (data.take_live) {
      const effectivePrice = data.retail_price ?? Number(item.retail_price ?? 0);
      const hasPhoto = !!data.photo_path || !item.needs_photo;
      if (!effectivePrice || effectivePrice <= 0)
        throw new Error("A price is required to take an item live");
      if (data.quantity <= 0) throw new Error("Quantity must be greater than 0 to go live");
      if (!data.location_id) throw new Error("A location is required to go live");
      if (!hasPhoto) throw new Error("A photo is required to go live");
      patch.pricing_status = "approved"; // admin approving the price
      patch.availability_status = "available";
    }

    // One atomic UPDATE so the gate trigger evaluates the final row.
    const { error } = await db.from("inventory_items").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, tookLive: !!data.take_live };
  });
