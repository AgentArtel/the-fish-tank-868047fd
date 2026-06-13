// Clover REST API client (server-only — reads credentials from env). Money is in
// cents throughout. Used by the Clover import + (later) the sale-ingest poll.
// Configured via CLOVER_API_TOKEN / CLOVER_MERCHANT_ID / CLOVER_BASE_URL.

function cfg() {
  const token = process.env.CLOVER_API_TOKEN;
  const mid = process.env.CLOVER_MERCHANT_ID;
  const base = process.env.CLOVER_BASE_URL || "https://api.clover.com";
  if (!token || !mid) {
    throw new Error(
      "Clover not configured — set CLOVER_API_TOKEN and CLOVER_MERCHANT_ID in the app secrets.",
    );
  }
  return { token, mid, base: base.replace(/\/$/, "") };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cloverGet(path: string, params?: Record<string, string | number>): Promise<any> {
  const { token, base } = cfg();
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 429) {
      await sleep(600 * (attempt + 1)); // rate limit (16 req/s) — back off
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

// Confirm the token/merchant work; returns the merchant name.
export async function cloverTestConnection(): Promise<{ id: string; name: string }> {
  const { mid } = cfg();
  const j = await cloverGet(`/v3/merchants/${mid}`);
  return { id: j.id, name: j.name };
}

// Paginate all inventory items (limit 100/page).
export async function cloverListItems(): Promise<CloverItem[]> {
  const { mid } = cfg();
  const out: CloverItem[] = [];
  let offset = 0;
  while (offset < 50_000) {
    const j = await cloverGet(`/v3/merchants/${mid}/items`, { limit: 100, offset });
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
