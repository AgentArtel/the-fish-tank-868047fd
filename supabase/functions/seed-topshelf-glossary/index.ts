// Edge function: seed-topshelf-glossary
//
// One-time (idempotent) seed: scrape the Top Shelf saltwater fish glossary,
// download every fish image, and insert one media_assets row per species —
// tagged with species_key so future PO drafts auto-attach them.
//
// Admin-only. Triggered manually from Settings → AI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { DOMParser, type Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GLOSSARY_URL = "https://topshelfaquatics.com/pages/fish-glossary";
const BUCKET = "media";

type CardRow = {
  common_name: string;
  scientific_name: string | null;
  image_url: string;
  detail_url: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function speciesKey(c: { scientific_name: string | null; common_name: string }) {
  const raw = (c.scientific_name || c.common_name || "").trim().toLowerCase();
  return raw || null;
}

function extOf(url: string) {
  const m = url.split("?")[0].toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|avif)$/);
  return m ? m[1].replace("jpeg", "jpg") : "jpg";
}

function safeSlug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function fetchGlossaryHtml(firecrawlKey: string): Promise<string> {
  // Click "View More" repeatedly so all cards render, then return the full HTML.
  const actions: Array<Record<string, unknown>> = [
    { type: "wait", milliseconds: 2000 },
  ];
  for (let i = 0; i < 40; i++) {
    actions.push({ type: "click", selector: "[data-glossary-more]" });
    actions.push({ type: "wait", milliseconds: 700 });
  }
  actions.push({ type: "scroll", direction: "down" });
  actions.push({ type: "wait", milliseconds: 800 });

  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${firecrawlKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: GLOSSARY_URL,
      formats: ["html"],
      onlyMainContent: false,
      waitFor: 3000,
      actions,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firecrawl scrape failed ${res.status}: ${txt.slice(0, 500)}`);
  }
  const body = await res.json();
  const html: string | undefined =
    body?.data?.html ?? body?.html ?? body?.data?.rawHtml ?? body?.rawHtml;
  if (!html) throw new Error("Firecrawl returned no HTML");
  return html;
}

function parseCards(html: string): CardRow[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  if (!doc) return [];
  const cards = Array.from(doc.querySelectorAll("a.glossary-card")) as Element[];
  const rows: CardRow[] = [];
  for (const card of cards) {
    const title = card.querySelector(".glossary-card-title")?.textContent?.trim() ?? "";
    const sub = card.querySelector(".glossary-card-subtitle")?.textContent?.trim() ?? "";
    const img = card.querySelector("img") as Element | null;
    let src = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
    if (src && src.startsWith("//")) src = "https:" + src;
    // Drop Shopify resize params to grab the largest available variant.
    src = src.replace(/(\?|&)width=\d+/g, "").replace(/(\?|&)height=\d+/g, "");
    const href = card.getAttribute("href") || null;
    if (!title || !src) continue;
    rows.push({
      common_name: title,
      scientific_name: sub || null,
      image_url: src,
      detail_url: href,
    });
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const firecrawlKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!firecrawlKey) return json({ error: "FIRECRAWL_API_KEY not configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  // Verify caller is an active admin.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userRes, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userRes?.user) return json({ error: "Invalid auth token" }, 401);
  const userId = userRes.user.id;

  const { data: roleRow } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!roleRow) return json({ error: "Admins only" }, 403);

  // 1. Scrape and parse.
  let cards: CardRow[];
  try {
    const html = await fetchGlossaryHtml(firecrawlKey);
    cards = parseCards(html);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 502);
  }

  const errors: Array<{ name: string; error: string }> = [];
  let inserted = 0;
  let skipped = 0;

  // 2. Existing keys — skip duplicates so this is safe to re-run.
  const keys = Array.from(
    new Set(cards.map((c) => speciesKey(c)).filter(Boolean) as string[]),
  );
  let existingKeys = new Set<string>();
  if (keys.length) {
    const { data: existing } = await admin
      .from("media_assets")
      .select("species_key")
      .in("species_key", keys);
    existingKeys = new Set(
      (existing ?? []).map((r: { species_key: string | null }) => r.species_key ?? "").filter(Boolean),
    );
  }

  // 3. Download → upload → insert, one species at a time (avoid bursting).
  for (const card of cards) {
    const key = speciesKey(card);
    if (!key) {
      skipped++;
      continue;
    }
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    try {
      const imgRes = await fetch(card.image_url);
      if (!imgRes.ok) throw new Error(`image fetch ${imgRes.status}`);
      const buf = new Uint8Array(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const ext = extOf(card.image_url);
      const path = `species-seed/topshelf/${safeSlug(key)}.${ext}`;
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buf, {
        contentType,
        upsert: true,
      });
      if (upErr) throw new Error(`storage upload: ${upErr.message}`);

      const altParts = [card.common_name];
      if (card.scientific_name) altParts.push(`(${card.scientific_name})`);

      const { error: insErr } = await admin.from("media_assets").insert({
        storage_path: path,
        file_name: `${safeSlug(key)}.${ext}`,
        media_type: "image",
        species_key: key,
        alt_text: altParts.join(" "),
        source_type: "vendor_asset",
        source_notes: card.detail_url
          ? `Seeded from Top Shelf glossary: ${card.detail_url}`
          : "Seeded from Top Shelf glossary",
        usage_rights: "vendor_allowed",
        usage_status: "unused",
        uploader_id: userId,
      });
      if (insErr) throw new Error(`db insert: ${insErr.message}`);
      existingKeys.add(key);
      inserted++;
    } catch (e) {
      errors.push({ name: card.common_name, error: String((e as Error).message ?? e) });
    }
  }

  return json({
    scanned: cards.length,
    inserted,
    skipped,
    errors,
  });
});
