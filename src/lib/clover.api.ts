// Clover REST API client (server-only). Credentials are loaded from the
// admin-only `clover_credentials` table at call time and passed in here —
// nothing is read from process.env so admins can rotate creds via the UI.
// Money is in cents throughout.

export type CloverCreds = {
  token: string;
  merchantId: string;
  baseUrl: string;
};

// Load creds via the service-role client. Caller MUST have already authorized
// the request (admin or editor) before invoking this.
export async function loadCloverCreds(): Promise<CloverCreds | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("clover_credentials")
    .select("api_token, merchant_id, base_url")
    .maybeSingle();
  const token = (data as any)?.api_token?.trim();
  const merchantId = (data as any)?.merchant_id?.trim();
  if (!token || !merchantId) return null;
  return {
    token,
    merchantId,
    baseUrl: ((data as any)?.base_url ?? "https://api.clover.com").replace(/\/$/, ""),
  };
}

export async function requireCloverCreds(): Promise<CloverCreds> {
  const c = await loadCloverCreds();
  if (!c) {
    throw new Error(
      "Clover not configured — enter the API token and merchant ID under Settings → Clover.",
    );
  }
  return c;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cloverGet(
  creds: CloverCreds,
  path: string,
  params?: Record<string, string | number>,
): Promise<any> {
  const url = new URL(`${creds.baseUrl}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${creds.token}`, Accept: "application/json" },
    });
    if (res.status === 429) {
      await sleep(600 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Clover HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  throw new Error("Clover rate-limited (429) after retries");
}

export type CloverItem = {
  id: string;
  name: string;
  priceCents: number | null;
  priceType: string | null;
  hidden: boolean;
};

export async function cloverTestConnection(creds: CloverCreds): Promise<{ id: string; name: string }> {
  try {
    const j = await cloverGet(creds, `/v3/merchants/${creds.merchantId}`);
    return { id: j.id, name: j.name };
  } catch (e: any) {
    // Some Clover API tokens carry Inventory + Orders read scope but NOT
    // merchant-info read — so /merchants/{mid} 401s even though the creds are
    // valid for everything we actually use. Fall back to an endpoint we rely on
    // (items); if that works, the connection is good.
    if (!/HTTP 401|HTTP 403/.test(e?.message ?? "")) throw e;
    await cloverGet(creds, `/v3/merchants/${creds.merchantId}/items`, { limit: 1 });
    return { id: creds.merchantId, name: `merchant ${creds.merchantId}` };
  }
}

export async function cloverListItems(creds: CloverCreds): Promise<CloverItem[]> {
  const out: CloverItem[] = [];
  let offset = 0;
  while (offset < 50_000) {
    const j = await cloverGet(creds, `/v3/merchants/${creds.merchantId}/items`, {
      limit: 100,
      offset,
    });
    const els: any[] = j.elements ?? [];
    for (const e of els) {
      out.push({
        id: e.id,
        name: e.name ?? "(unnamed)",
        priceCents: typeof e.price === "number" ? e.price : null,
        priceType: e.priceType ?? null,
        hidden: !!e.hidden,
      });
    }
    if (els.length < 100) break;
    offset += 100;
  }
  return out;
}

export type CloverLineItem = {
  id: string;
  name: string | null;
  cloverItemId: string | null;
  priceCents: number | null;
  refunded: boolean;
};
export type CloverOrder = {
  id: string;
  state: string | null;
  createdTime: number | null;
  modifiedTime: number | null;
  paymentId: string | null;
  paid: boolean;
  lineItems: CloverLineItem[];
};

export async function cloverListRecentOrders(
  creds: CloverCreds,
  sinceMs: number,
): Promise<CloverOrder[]> {
  const out: CloverOrder[] = [];
  let offset = 0;
  while (offset < 50_000) {
    const j = await cloverGet(creds, `/v3/merchants/${creds.merchantId}/orders`, {
      filter: `modifiedTime>=${sinceMs}`,
      expand: "lineItems,payments",
      limit: 100,
      offset,
    });
    const els: any[] = j.elements ?? [];
    for (const o of els) {
      const payEls: any[] = o.payments?.elements ?? [];
      const liEls: any[] = o.lineItems?.elements ?? [];
      out.push({
        id: o.id,
        state: o.state ?? null,
        createdTime: typeof o.createdTime === "number" ? o.createdTime : null,
        modifiedTime: typeof o.modifiedTime === "number" ? o.modifiedTime : null,
        paymentId: payEls[0]?.id ?? null,
        paid: payEls.length > 0 || o.state === "locked",
        lineItems: liEls.map((li) => ({
          id: li.id,
          name: li.name ?? null,
          cloverItemId: li.item?.id ?? null,
          priceCents: typeof li.price === "number" ? li.price : null,
          refunded: !!li.refunded,
        })),
      });
    }
    if (els.length < 100) break;
    offset += 100;
  }
  return out;
}
