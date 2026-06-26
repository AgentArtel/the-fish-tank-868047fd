// Shared Clover REST client + auth helpers for the clover-* edge functions.
// Money is in cents. Creds are loaded from the `clover_credentials` table via
// the service role — never from env — so admins can rotate via the app UI.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function makeAdmin(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Authorize: caller must be an active admin (matches the app's testCloverConnection /
// importCloverCatalog / syncCloverSalesChunk guards). Returns { admin, userId }.
// Service-role callers (e.g. pg_cron with the service key as Authorization) bypass
// this check — `_internal` mode skips user-token verification.
export async function requireAdminCaller(req: Request): Promise<{
  admin: SupabaseClient;
  userId: string | null;
  error?: Response;
}> {
  const admin = makeAdmin();
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { admin, userId: null, error: json({ error: "Missing Authorization header" }, 401) };
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  // If the caller used the service-role key directly (cron), allow.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (jwt === serviceKey) return { admin, userId: null };
  // Allow pg_cron callers presenting the shared cron secret (stored in Vault +
  // edge-fn env). Same pattern the vendor-watch cron uses.
  const cronSecret = Deno.env.get("SCRAPE_CRON_SECRET");
  if (cronSecret && jwt === cronSecret) return { admin, userId: null };

  const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userRes?.user) {
    return { admin, userId: null, error: json({ error: "Invalid auth token" }, 401) };
  }
  const userId = userRes.user.id;
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) {
    return { admin, userId, error: json({ error: "Admins only" }, 403) };
  }
  return { admin, userId };
}

export type CloverCreds = { token: string; merchantId: string; baseUrl: string };

export async function loadCloverCreds(admin: SupabaseClient): Promise<CloverCreds | null> {
  const { data } = await admin
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

export async function requireCloverCreds(admin: SupabaseClient): Promise<CloverCreds> {
  const c = await loadCloverCreds(admin);
  if (!c)
    throw new Error(
      "Clover not configured — enter the API token and merchant ID under Settings → Clover.",
    );
  return c;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function cloverGet(
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
};

export async function cloverTestConnection(
  creds: CloverCreds,
): Promise<{ id: string; name: string }> {
  try {
    const j = await cloverGet(creds, `/v3/merchants/${creds.merchantId}`);
    return { id: j.id, name: j.name };
  } catch (e: any) {
    // Some tokens lack merchant-info scope but have inventory/orders scope —
    // fall back to a read we actually rely on.
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
      if (e.hidden) continue;
      out.push({
        id: e.id,
        name: e.name ?? "(unnamed)",
        priceCents: typeof e.price === "number" ? e.price : null,
        priceType: e.priceType ?? null,
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
export type CloverCustomer = {
  cloverId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};
export type CloverOrder = {
  id: string;
  state: string | null;
  createdTime: number | null;
  modifiedTime: number | null;
  paymentId: string | null;
  paid: boolean;
  customer: CloverCustomer | null;
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
      expand: "lineItems,payments,customers",
      limit: 100,
      offset,
    });
    const els: any[] = j.elements ?? [];
    for (const o of els) out.push(mapCloverOrder(o));
    if (els.length < 100) break;
    offset += 100;
  }
  return out;
}

function mapCloverOrder(o: any): CloverOrder {
  const payEls: any[] = o.payments?.elements ?? [];
  const liEls: any[] = o.lineItems?.elements ?? [];
  const c0: any = o.customers?.elements?.[0] ?? null;
  const customer: CloverCustomer | null = c0
    ? {
        cloverId: c0.id,
        firstName: c0.firstName ?? null,
        lastName: c0.lastName ?? null,
        email: c0.emailAddresses?.elements?.[0]?.emailAddress ?? null,
        phone: c0.phoneNumbers?.elements?.[0]?.phoneNumber ?? null,
      }
    : null;
  return {
    id: o.id,
    state: o.state ?? null,
    createdTime: typeof o.createdTime === "number" ? o.createdTime : null,
    modifiedTime: typeof o.modifiedTime === "number" ? o.modifiedTime : null,
    paymentId: payEls[0]?.id ?? null,
    paid: payEls.length > 0 || o.state === "locked",
    customer,
    lineItems: liEls.map((li) => ({
      id: li.id,
      name: li.name ?? null,
      cloverItemId: li.item?.id ?? null,
      priceCents: typeof li.price === "number" ? li.price : null,
      refunded: !!li.refunded,
    })),
  };
}

// Same heuristic as src/lib/coral-type.ts — kept inline so edge fns don't need
// to import the app's TS. Match if the name contains a coral keyword.
const CORAL_KEYWORDS = [
  "coral","acro","acropora","monti","montipora","zoa","zoanthid","palytho","paly",
  "mushroom","ricordea","rhodactis","discosoma","euphyllia","hammer","torch","frogspawn",
  "chalice","favia","favites","goniopora","gonio","alveopora","duncan","blasto",
  "lobophyllia","lobo","scolymia","scoly","trachyphyllia","trachy","wellso","platygyra",
  "stylophora","stylo","seriatopora","birdsnest","pocillopora","pocci","leptastrea",
  "leptoseris","cyphastrea","psammacora","pavona","turbinaria","sps","lps",
];
export function looksLikeCoral(name: string): boolean {
  const s = (name || "").toLowerCase();
  return CORAL_KEYWORDS.some((k) => s.includes(k));
}
