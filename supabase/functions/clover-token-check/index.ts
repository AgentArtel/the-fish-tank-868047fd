// Edge function: clover-token-check
// Self-cleaning probe that verifies which Clover REST capabilities the saved
// API token actually has. Never throws on the first denial — each probe's
// HTTP status is captured so a 401/403 is recorded as "missing scope" rather
// than aborting the run. Gating step before building the push-back queue.
//
// Probe sequence (in order):
//   1. read       GET    /v3/merchants/{mId}/items?limit=1
//   2. create     POST   /v3/merchants/{mId}/items   (hidden:true probe item)
//   3. update     POST   /v3/merchants/{mId}/items/{id}
//   4. setStock   POST   /v3/merchants/{mId}/item_stocks/{id}
//   5. delete     DELETE /v3/merchants/{mId}/items/{id}   (always in finally)

import {
  corsHeaders,
  json,
  requireAdminCaller,
  requireCloverCreds,
  cloverWriteRaw,
  cloverGet,
  type CloverCreds,
} from "../_shared/clover.ts";

type ProbeResult = {
  status: number;
  ok: boolean;
  itemId?: string;
  note?: string;
};

type Verdict = boolean | "skipped";

function verdictFromStatus(status: number): Verdict {
  if (status >= 200 && status < 300) return true;
  // 401/403 = scope denied. Anything else (404/400/5xx) is also "not capable"
  // but surfaced in errors so transient failures are distinguishable.
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const { admin, error } = await requireAdminCaller(req);
  if (error) return error;

  let creds: CloverCreds;
  try {
    creds = await requireCloverCreds(admin);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 400);
  }

  const ranAt = new Date().toISOString();
  const mode = creds.baseUrl.includes("sandbox") ? "sandbox" : "live";
  const details: Record<string, ProbeResult> = {};
  const errors: { probe: string; status: number; message: string }[] = [];

  let canRead: Verdict = false;
  let canCreateItem: Verdict = false;
  let canUpdateItem: Verdict = "skipped";
  let canSetStock: Verdict = "skipped";
  let canDelete: Verdict = "skipped";

  let probeItemId: string | null = null;
  let cleanedUp = true;
  let leakedItemId: string | null = null;

  // 1. READ
  try {
    await cloverGet(creds, `/v3/merchants/${creds.merchantId}/items`, { limit: 1 });
    details.read = { status: 200, ok: true };
    canRead = true;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    const m = /HTTP (\d+)/.exec(msg);
    const status = m ? Number(m[1]) : 0;
    details.read = { status, ok: false, note: msg.slice(0, 200) };
    errors.push({ probe: "read", status, message: msg.slice(0, 200) });
  }

  try {
    // 2. CREATE (hidden probe item)
    const createBody = {
      name: `__ZZ_TOKEN_CHECK__ ${ranAt}`,
      price: 1,
      priceType: "FIXED",
      hidden: true,
    };
    const createRes = await cloverWriteRaw(
      creds,
      "POST",
      `/v3/merchants/${creds.merchantId}/items`,
      createBody,
    );
    probeItemId = createRes.ok ? (createRes.body?.id ?? null) : null;
    details.create = {
      status: createRes.status,
      ok: createRes.ok,
      itemId: probeItemId ?? undefined,
      note: createRes.ok ? undefined : truncateBody(createRes.body),
    };
    canCreateItem = verdictFromStatus(createRes.status);
    if (!createRes.ok) {
      errors.push({
        probe: "create",
        status: createRes.status,
        message: truncateBody(createRes.body),
      });
    }

    // 3. UPDATE — only if create succeeded
    if (probeItemId) {
      const updRes = await cloverWriteRaw(
        creds,
        "POST",
        `/v3/merchants/${creds.merchantId}/items/${probeItemId}`,
        { price: 2 },
      );
      details.update = {
        status: updRes.status,
        ok: updRes.ok,
        note: updRes.ok ? undefined : truncateBody(updRes.body),
      };
      canUpdateItem = verdictFromStatus(updRes.status);
      if (!updRes.ok) {
        errors.push({
          probe: "update",
          status: updRes.status,
          message: truncateBody(updRes.body),
        });
      }

      // 4. SET STOCK — Scope-3 readiness. 403 = no scope; 400/404 = tracking off.
      const stockRes = await cloverWriteRaw(
        creds,
        "POST",
        `/v3/merchants/${creds.merchantId}/item_stocks/${probeItemId}`,
        { quantity: 1 },
      );
      const stockNote =
        stockRes.status === 403
          ? "denied — INVENTORY_W scope likely missing for item_stocks"
          : stockRes.status === 400 || stockRes.status === 404
            ? "endpoint reachable but item not stock-tracked (expected — tracking is off)"
            : stockRes.ok
              ? undefined
              : truncateBody(stockRes.body);
      details.setStock = { status: stockRes.status, ok: stockRes.ok, note: stockNote };
      canSetStock = verdictFromStatus(stockRes.status);
      if (!stockRes.ok && stockRes.status !== 400 && stockRes.status !== 404) {
        errors.push({ probe: "setStock", status: stockRes.status, message: stockNote ?? "" });
      }
    } else {
      details.update = { status: 0, ok: false, note: "skipped — create failed" };
      details.setStock = { status: 0, ok: false, note: "skipped — create failed" };
    }
  } finally {
    // 5. DELETE — always attempt cleanup
    if (probeItemId) {
      try {
        const delRes = await cloverWriteRaw(
          creds,
          "DELETE",
          `/v3/merchants/${creds.merchantId}/items/${probeItemId}`,
        );
        details.delete = {
          status: delRes.status,
          ok: delRes.ok,
          note: delRes.ok ? undefined : truncateBody(delRes.body),
        };
        canDelete = verdictFromStatus(delRes.status);
        if (!delRes.ok) {
          cleanedUp = false;
          leakedItemId = probeItemId;
          errors.push({
            probe: "delete",
            status: delRes.status,
            message:
              "Probe item could not be deleted; it remains hidden:true so it stays off the register. Manually remove from Clover.",
          });
        }
      } catch (e) {
        cleanedUp = false;
        leakedItemId = probeItemId;
        const msg = (e as Error).message ?? String(e);
        details.delete = { status: 0, ok: false, note: msg.slice(0, 200) };
        errors.push({ probe: "delete", status: 0, message: msg.slice(0, 200) });
      }
    } else {
      details.delete = { status: 0, ok: false, note: "skipped — nothing to delete" };
    }
  }

  const writeCapable = canCreateItem === true && canUpdateItem === true;
  const verdict = writeCapable
    ? "write-capable — safe to build push"
    : canCreateItem === false || canUpdateItem === false
      ? "cannot create/update — fix token scopes (need INVENTORY_W) before building the queue"
      : "incomplete — read/create did not run cleanly; see errors";

  return json({
    ok: true,
    merchantId: creds.merchantId,
    ranAt,
    mode,
    canRead: canRead === true,
    canCreateItem: canCreateItem === true,
    canUpdateItem: canUpdateItem === true ? true : canUpdateItem === false ? false : "skipped",
    canSetStock: canSetStock === true ? true : canSetStock === false ? false : "skipped",
    canDelete: canDelete === true ? true : canDelete === false ? false : "skipped",
    writeCapable,
    verdict,
    cleanedUp,
    leakedItemId,
    permissionsEndpointUsed: false,
    details,
    errors,
  });
});

function truncateBody(body: unknown): string {
  const s = typeof body === "string" ? body : JSON.stringify(body);
  return (s ?? "").slice(0, 200);
}
