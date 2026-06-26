// Edge function: clover-push
// Drain for clover_push_queue. Picks up to BATCH_SIZE pending rows, status-flips
// each to in_progress (atomic lock), then for each:
//   - create_item: POST /v3/merchants/{mId}/items → capture returned id back into
//     clover_item_links + inventory_items.attrs.clover_item_id.
//   - update_item: POST /v3/merchants/{mId}/items/{cloverId}.
//   - Skip-if-unchanged: row.content_hash == clover_item_links.last_pushed_hash.
//   - Success → status='done', write last_pushed_hash/at on the link.
//   - Failure → attempts++, status back to 'pending' until cap (5) → 'failed'.
//
// Invoked by pg_cron every 3 min (Bearer SCRAPE_CRON_SECRET) AND by an admin
// "Push now" button. App-authored rows only (origin='app'); the inbound
// sales-decrement sync never enqueues, preventing echo loops.

import {
  corsHeaders,
  json,
  requireAdminCaller,
  requireCloverCreds,
  cloverWriteRaw,
  type CloverCreds,
} from "../_shared/clover.ts";

const BATCH_SIZE = 20;
const ATTEMPT_CAP = 5;

type QueueRow = {
  id: string;
  inventory_item_id: string;
  op: "create_item" | "update_item";
  payload: Record<string, unknown>;
  content_hash: string;
  attempts: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { admin, error } = await requireAdminCaller(req);
  if (error) return error;

  try {
    const creds = await requireCloverCreds(admin);

    // Status-flip-as-lock: atomically claim a small batch.
    const { data: claimed, error: claimErr } = await admin.rpc(
      "claim_clover_push_batch" as any,
      { _limit: BATCH_SIZE },
    );

    let rows: QueueRow[] = [];
    if (claimErr || !claimed) {
      // Fallback: do the claim inline via update…in (select … for update skip locked).
      const { data: pendingIds } = await admin
        .from("clover_push_queue")
        .select("id")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);
      const ids = (pendingIds ?? []).map((r: any) => r.id);
      if (ids.length === 0) {
        return json({ ok: true, claimed: 0, results: [] });
      }
      const { data: locked } = await admin
        .from("clover_push_queue")
        .update({ status: "in_progress" })
        .in("id", ids)
        .eq("status", "pending")
        .select("id, inventory_item_id, op, payload, content_hash, attempts");
      rows = (locked ?? []) as QueueRow[];
    } else {
      rows = claimed as QueueRow[];
    }

    if (rows.length === 0) return json({ ok: true, claimed: 0, results: [] });

    const results: Array<{
      id: string;
      op: string;
      status: "done" | "skipped" | "pending" | "failed";
      cloverItemId?: string | null;
      error?: string;
    }> = [];

    for (const row of rows) {
      try {
        const out = await processRow(admin, creds, row);
        results.push({ id: row.id, op: row.op, ...out });
      } catch (e: any) {
        const msg = String(e?.message ?? e).slice(0, 500);
        const nextAttempts = row.attempts + 1;
        const finalStatus = nextAttempts >= ATTEMPT_CAP ? "failed" : "pending";
        await admin
          .from("clover_push_queue")
          .update({
            status: finalStatus,
            attempts: nextAttempts,
            last_error: msg,
          })
          .eq("id", row.id);
        results.push({ id: row.id, op: row.op, status: finalStatus, error: msg });
      }
    }

    return json({ ok: true, claimed: rows.length, results });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

async function processRow(
  admin: any,
  creds: CloverCreds,
  row: QueueRow,
): Promise<{
  status: "done" | "skipped" | "pending" | "failed";
  cloverItemId?: string | null;
}> {
  // Look up existing link for this inventory item.
  const { data: link } = await admin
    .from("clover_item_links")
    .select("clover_item_id, last_pushed_hash")
    .eq("inventory_item_id", row.inventory_item_id)
    .maybeSingle();

  // Skip-if-unchanged.
  if (link?.last_pushed_hash && link.last_pushed_hash === row.content_hash) {
    await admin
      .from("clover_push_queue")
      .update({ status: "done", done_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
    return { status: "skipped", cloverItemId: link.clover_item_id ?? null };
  }

  const payload = row.payload || {};
  const itemBody: Record<string, unknown> = {};
  if (payload.name != null) itemBody.name = payload.name;
  if (payload.price_cents != null) itemBody.price = payload.price_cents;
  if (payload.price_type != null) itemBody.priceType = payload.price_type;
  if (payload.code != null) itemBody.code = payload.code;

  let cloverItemId: string | null = link?.clover_item_id ?? null;

  if (row.op === "create_item") {
    // Create-guard: if a link already exists, treat as update instead.
    if (cloverItemId) {
      const r = await cloverWriteRaw(
        creds,
        "POST",
        `/v3/merchants/${creds.merchantId}/items/${cloverItemId}`,
        itemBody,
      );
      if (!r.ok) throw new Error(`Clover ${r.status}: ${snippet(r.body)}`);
    } else {
      const r = await cloverWriteRaw(
        creds,
        "POST",
        `/v3/merchants/${creds.merchantId}/items`,
        itemBody,
      );
      if (!r.ok) throw new Error(`Clover ${r.status}: ${snippet(r.body)}`);
      cloverItemId = r.body?.id ?? null;
      if (!cloverItemId) throw new Error("Clover create returned no id");

      // Upsert link, mirror id onto inventory_items.attrs.
      await admin
        .from("clover_item_links")
        .upsert(
          {
            inventory_item_id: row.inventory_item_id,
            clover_item_id: cloverItemId,
            link_status: "linked",
          },
          { onConflict: "inventory_item_id" },
        );

      const { data: inv } = await admin
        .from("inventory_items")
        .select("attrs")
        .eq("id", row.inventory_item_id)
        .maybeSingle();
      const attrs = (inv?.attrs as Record<string, unknown> | null) ?? {};
      await admin
        .from("inventory_items")
        .update({ attrs: { ...attrs, clover_item_id: cloverItemId } })
        .eq("id", row.inventory_item_id);
    }
  } else if (row.op === "update_item") {
    if (!cloverItemId) throw new Error("update_item: no clover_item_id linked");
    const r = await cloverWriteRaw(
      creds,
      "POST",
      `/v3/merchants/${creds.merchantId}/items/${cloverItemId}`,
      itemBody,
    );
    if (!r.ok) throw new Error(`Clover ${r.status}: ${snippet(r.body)}`);
  } else {
    throw new Error(`Unknown op: ${row.op}`);
  }

  // Mark link as freshly pushed.
  await admin
    .from("clover_item_links")
    .update({
      last_pushed_hash: row.content_hash,
      last_pushed_at: new Date().toISOString(),
    })
    .eq("inventory_item_id", row.inventory_item_id);

  await admin
    .from("clover_push_queue")
    .update({
      status: "done",
      done_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", row.id);

  return { status: "done", cloverItemId };
}

function snippet(b: unknown): string {
  const s = typeof b === "string" ? b : JSON.stringify(b);
  return String(s ?? "").slice(0, 200);
}
