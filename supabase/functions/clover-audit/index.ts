// One-off audit endpoint — dumps raw Clover payloads for the data audit.
// Admin-only. Returns JSON: { items_expanded, categories, single_item, summary }.
import { corsHeaders, json, requireAdminCaller, requireCloverCreds, cloverGet } from "../_shared/clover.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { admin, error } = await requireAdminCaller(req);
    if (error) return error;
    const creds = await requireCloverCreds(admin);
    const mId = creds.merchantId;

    const items = await cloverGet(creds, `/v3/merchants/${mId}/items`, {
      expand: "categories,itemStock,tags,options",
      limit: 10,
    });
    const categories = await cloverGet(creds, `/v3/merchants/${mId}/categories`, { limit: 100 });

    // Also pull items via the Coral category (livestock) to test itemStock on livestock specifically.
    const coralCat = categories?.elements?.find((c: any) => /coral|fish/i.test(c.name));
    let livestockItems: unknown = null;
    if (coralCat?.id) {
      livestockItems = await cloverGet(
        creds,
        `/v3/merchants/${mId}/categories/${coralCat.id}/items`,
        { expand: "categories,itemStock,tags", limit: 5 },
      );
    }

    // Pick a likely livestock item (best-effort: first item; client can switch).
    const first = items?.elements?.[0];
    let single: unknown = null;
    if (first?.id) {
      single = await cloverGet(creds, `/v3/merchants/${mId}/items/${first.id}`, {
        expand: "categories,itemStock,tags,modifierGroups",
      });
    }

    // Quick summary of which fields are populated across the sample.
    const els: any[] = items?.elements ?? [];
    const summary = {
      sample_size: els.length,
      with_itemStock: els.filter((e) => e.itemStock).length,
      with_stock_quantity_number: els.filter((e) => typeof e.itemStock?.quantity === "number").length,
      with_stock_stockCount_number: els.filter((e) => typeof e.itemStock?.stockCount === "number").length,
      with_code: els.filter((e) => e.code).length,
      with_sku: els.filter((e) => e.sku).length,
      with_cost: els.filter((e) => typeof e.cost === "number").length,
      with_categories: els.filter((e) => e.categories?.elements?.length).length,
      with_unitName: els.filter((e) => e.unitName).length,
      priceTypes: Array.from(new Set(els.map((e) => e.priceType).filter(Boolean))),
      hidden_count: els.filter((e) => e.hidden).length,
      available_false_count: els.filter((e) => e.available === false).length,
      category_count: categories?.elements?.length ?? 0,
    };

    return json({ summary, items_expanded: items, categories, single_item: single });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
