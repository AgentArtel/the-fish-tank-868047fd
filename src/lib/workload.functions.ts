import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
// The workload badge exposes operational counts, so it's gated to active editors.
import { requireEditor } from "@/lib/auth-guards";

export const getWorkload = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireEditor(context.supabase, context.userId);
    const { supabase } = context;

    const [batches, pricing, inv, media, content] = await Promise.all([
      supabase.from("vendor_batches").select("id,intake_status"),
      supabase
        .from("vendor_line_items")
        .select("id", { count: "exact", head: true })
        .eq("kind", "sellable")
        .neq("pricing_status", "approved")
        .in("review_status", ["approved", "pending"]),
      supabase
        .from("inventory_items")
        .select("id,availability_status,live_sale_status,item_type,pricing_status"),
      supabase.from("inventory_media").select("inventory_item_id,has_price_tag"),
      supabase.from("content_items").select("id,status,scheduled_date"),
    ]);

    const batchRows = batches.data ?? [];
    const intakeOpen = batchRows.filter(
      (b) => !["converted", "archived"].includes(b.intake_status as string),
    ).length;
    const intakeAwaitingReview = batchRows.filter((b) =>
      ["uploaded", "parsing", "review"].includes(b.intake_status as string),
    ).length;

    const invRows = inv.data ?? [];

    // Coral discovery drafts awaiting pricing review (not yet priced, not yet live).
    const coralDraftsPending = invRows.filter(
      (i) =>
        i.item_type === "coral" &&
        i.pricing_status === "not_priced" &&
        (i.availability_status === "incoming" || i.availability_status === "needs_id"),
    ).length;

    // The Pricing Queue surface now owns both vendor lines and coral drafts.
    const pricingPending = (pricing.count ?? 0) + coralDraftsPending;
    const inventoryTotal = invRows.length;
    const available = invRows.filter((i) => i.availability_status === "available").length;
    const hold = invRows.filter(
      (i) => i.availability_status === "on_hold" || i.availability_status === "quarantine",
    ).length;
    const liveSale = invRows.filter(
      (i) => i.live_sale_status === "live" || i.live_sale_status === "staged",
    ).length;

    // Items with at least one photo tagged with a price tag.
    const taggedSet = new Set(
      (media.data ?? [])
        .filter((m) => m.has_price_tag === true)
        .map((m) => m.inventory_item_id as string),
    );
    const missingTags = invRows.filter(
      (i) =>
        i.availability_status !== "dead_lost" &&
        i.availability_status !== "sold_out" &&
        !taggedSet.has(i.id as string),
    ).length;

    const contentRows = content.data ?? [];
    const contentCounts: Record<string, number> = {};
    contentRows.forEach((r) => {
      const s = r.status as string;
      contentCounts[s] = (contentCounts[s] ?? 0) + 1;
    });
    const nowIso = new Date().toISOString();
    const upcomingPosts = contentRows.filter(
      (r) => r.scheduled_date && (r.scheduled_date as string) >= nowIso,
    ).length;

    return {
      intakeOpen,
      intakeAwaitingReview,
      pricingPending,
      coralDraftsPending,
      inventoryTotal,
      available,
      hold,
      liveSale,
      missingTags,
      contentCounts,
      upcomingPosts,
    };
  });
