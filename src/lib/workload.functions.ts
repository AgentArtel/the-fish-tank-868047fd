import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWorkload = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const [batches, pricing, inv, media, content] = await Promise.all([
      supabase.from("vendor_batches").select("id,intake_status"),
      supabase.from("vendor_line_items")
        .select("id", { count: "exact", head: true })
        .eq("kind", "sellable")
        .neq("pricing_status", "approved")
        .in("review_status", ["approved", "pending"]),
      supabase.from("inventory_items").select("id,availability_status,live_sale_status"),
      supabase.from("inventory_media").select("inventory_item_id,has_price_tag"),
      supabase.from("content_items").select("id,status,scheduled_date"),
    ]);

    const batchRows = batches.data ?? [];
    const intakeOpen = batchRows.filter(b =>
      !["converted", "archived"].includes(b.intake_status as string)
    ).length;
    const intakeAwaitingReview = batchRows.filter(b =>
      ["uploaded", "parsing", "review"].includes(b.intake_status as string)
    ).length;

    const pricingPending = pricing.count ?? 0;

    const invRows = inv.data ?? [];
    const inventoryTotal = invRows.length;
    const available = invRows.filter(i => i.availability_status === "available").length;
    const hold = invRows.filter(i => i.availability_status === "on_hold" || i.availability_status === "quarantine").length;
    const liveSale = invRows.filter(i => i.live_sale_status === "live" || i.live_sale_status === "staged").length;

    // Items with at least one photo tagged with a price tag.
    const taggedSet = new Set(
      (media.data ?? [])
        .filter(m => m.has_price_tag === true)
        .map(m => m.inventory_item_id as string)
    );
    const missingTags = invRows.filter(i =>
      i.availability_status !== "archived" && !taggedSet.has(i.id as string)
    ).length;

    const contentRows = content.data ?? [];
    const contentCounts: Record<string, number> = {};
    contentRows.forEach(r => {
      const s = r.status as string;
      contentCounts[s] = (contentCounts[s] ?? 0) + 1;
    });
    const nowIso = new Date().toISOString();
    const upcomingPosts = contentRows
      .filter(r => r.scheduled_date && (r.scheduled_date as string) >= nowIso)
      .length;

    return {
      intakeOpen,
      intakeAwaitingReview,
      pricingPending,
      inventoryTotal,
      available,
      hold,
      liveSale,
      missingTags,
      contentCounts,
      upcomingPosts,
    };
  });
