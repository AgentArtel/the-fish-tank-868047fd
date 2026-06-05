import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ITEM_TYPES } from "@/lib/ops";

const inputSchema = z.object({
  search: z.string().max(200).optional(),
  locationId: z.string().uuid().optional(),
  descendants: z.boolean().optional(),
  type: z.enum(ITEM_TYPES).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const getPublicCatalog = createServerFn({ method: "POST" })
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Locations for the filter UI (active only)
    const { data: locsRaw } = await supabaseAdmin
      .from("store_locations")
      .select("id,name,kind,parent_location_id,is_active")
      .eq("is_active", true)
      .order("name");
    const locations = (locsRaw ?? []).map((l: any) => ({
      id: l.id, name: l.name, kind: l.kind, parent_location_id: l.parent_location_id,
    }));

    // Resolve descendant location ids if needed
    let locationIds: string[] | null = null;
    if (data.locationId) {
      if (data.descendants) {
        const byParent: Record<string, string[]> = {};
        for (const l of locations) {
          if (l.parent_location_id) (byParent[l.parent_location_id] ||= []).push(l.id);
        }
        const ids = new Set<string>([data.locationId]);
        const stack = [data.locationId];
        while (stack.length) {
          const cur = stack.pop()!;
          for (const c of byParent[cur] ?? []) if (!ids.has(c)) { ids.add(c); stack.push(c); }
        }
        locationIds = Array.from(ids);
      } else {
        locationIds = [data.locationId];
      }
    }

    // Public catalog query: must be available with a sellable price
    let q = supabaseAdmin
      .from("inventory_items")
      .select("id,item_name,scientific_name,size,retail_price,item_type,location_id,quantity_available,updated_at,store_locations(name)")
      .eq("availability_status", "available")
      .gt("retail_price", 0)
      .gt("quantity_available", 0)
      .order("updated_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.type) q = q.eq("item_type", data.type);
    if (locationIds) q = q.in("location_id", locationIds);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`item_name.ilike.${s},scientific_name.ilike.${s}`);
    }
    const { data: items, error } = await q;
    if (error) throw new Error(error.message);

    const itemIds = (items ?? []).map((i: any) => i.id);
    // One photo per item (prefer website tag, fallback to most recent)
    let photoByItem: Record<string, string> = {};
    if (itemIds.length) {
      const { data: media } = await supabaseAdmin
        .from("inventory_media")
        .select("inventory_item_id,storage_path,tag,created_at")
        .in("inventory_item_id", itemIds)
        .eq("media_type", "image")
        .order("created_at", { ascending: false });
      const chosen: Record<string, any> = {};
      for (const m of media ?? []) {
        const cur = chosen[m.inventory_item_id];
        if (!cur) { chosen[m.inventory_item_id] = m; continue; }
        // prefer website > social > internal
        const rank = (t: string) => t === "website" ? 3 : t === "social" ? 2 : t === "live_sale" ? 2 : 1;
        if (rank(m.tag) > rank(cur.tag)) chosen[m.inventory_item_id] = m;
      }
      const paths = Object.values(chosen).map((m: any) => m.storage_path);
      if (paths.length) {
        const { data: signed } = await supabaseAdmin.storage
          .from("inventory-media")
          .createSignedUrls(paths, 60 * 60);
        const byPath: Record<string, string> = {};
        for (const s of signed ?? []) if (s.signedUrl) byPath[s.path!] = s.signedUrl;
        for (const [iid, m] of Object.entries(chosen)) {
          const url = byPath[(m as any).storage_path];
          if (url) photoByItem[iid] = url;
        }
      }
    }

    // Only return items with a photo (catalog is photo-first)
    const visible = (items ?? [])
      .filter((i: any) => photoByItem[i.id])
      .map((i: any) => ({
        id: i.id,
        item_name: i.item_name,
        scientific_name: i.scientific_name,
        size: i.size,
        retail_price: i.retail_price ? Number(i.retail_price) : null,
        item_type: i.item_type,
        location_id: i.location_id,
        location_name: i.store_locations?.name ?? null,
        photo_url: photoByItem[i.id],
      }));

    return { items: visible, locations };
  });
