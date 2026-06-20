// Supabase Edge Function: gather-species-images
// Owner-directed: external integrations (Firecrawl + AI) live here, not in the app Worker.
// Invoked by an authenticated editor:
//   supabase.functions.invoke('gather-species-images', { body: { contentItemId } })
// Returns: { created, perSpecies: [{ lineId, speciesKey, added, note? }] }

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") || "";
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ARRIVAL_IMG_TYPES = ["fish", "coral", "invert", "live_rock"] as const;
const MAX_CANDIDATES_PER_SPECIES = 4;

type GatheredCandidate = {
  source: string;
  source_url: string;
  image_url: string;
  license: string | null;
  attribution: string | null;
  commercial_ok: boolean | null;
};

function jres(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---- AI helper (Lovable AI Gateway) ----
async function callAI(messages: any[]): Promise<string> {
  if (!LOVABLE_API_KEY) return "";
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
  });
  if (!res.ok) return "";
  const j: any = await res.json().catch(() => null);
  return j?.choices?.[0]?.message?.content ?? "";
}

// ---- Resolve messy line name → clean common + scientific ----
async function resolveSpecies(
  rawName: string,
): Promise<{ common: string | null; scientific: string | null }> {
  try {
    const txt = await callAI([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are a marine-aquarium expert. For this livestock line item (which may be a common name, a multi-species "pack", or messy text), identify the PRIMARY species and reply EXACTLY two lines:
COMMON: <clean common name, e.g. Royal Gramma>
SCIENTIFIC: <Genus species, or NONE>
Line: "${rawName}"`,
          },
        ],
      },
    ]);
    let common = txt.match(/COMMON:\s*(.+)/i)?.[1]?.trim() || null;
    if (common && /^none/i.test(common)) common = null;
    let scientific = txt.match(/SCIENTIFIC:\s*(.+)/i)?.[1]?.trim() || null;
    if (scientific && /^none/i.test(scientific)) scientific = null;
    if (scientific) scientific = scientific.match(/[A-Z][a-z]+ [a-z]+/)?.[0] ?? null;
    return { common, scientific };
  } catch {
    return { common: null, scientific: null };
  }
}

// ---- AI vision verify ----
async function aiMatchConfidence(
  imageUrl: string,
  scientificName: string,
): Promise<number | null> {
  try {
    const txt = await callAI([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Does this image depict the aquarium species "${scientificName}"? Reply with ONLY a number from 0 to 1 (your confidence it is a match). No other text.`,
          },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ]);
    const m = txt.match(/0?\.\d+|[01](?:\.0+)?/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
  } catch {
    return null;
  }
}

// ---- Firecrawl scrape (returns raw page body) ----
async function fetchViaFirecrawl(url: string): Promise<string> {
  if (!FIRECRAWL_API_KEY) throw new Error("FIRECRAWL_API_KEY not configured");
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
    },
    body: JSON.stringify({ url, formats: ["rawHtml"], onlyMainContent: false }),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}`);
  const j: any = await res.json();
  // v2 SDK shape: { data: { rawHtml, html, markdown, ... } }
  return (
    j?.data?.rawHtml ??
    j?.data?.html ??
    j?.data?.markdown ??
    j?.rawHtml ??
    j?.html ??
    ""
  );
}

// ---- Top Shelf Aquatics (Shopify) via Firecrawl ----
async function fromTopShelf(query: string): Promise<GatheredCandidate[]> {
  const q = query.replace(/[;,].*$/, "").trim() || query;
  const url = `https://topshelfaquatics.com/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=5`;
  const body = await fetchViaFirecrawl(url);
  let j: any;
  try {
    j = JSON.parse(body);
  } catch {
    const s = body.indexOf("{");
    const e = body.lastIndexOf("}");
    if (s < 0 || e <= s) return [];
    try {
      j = JSON.parse(body.slice(s, e + 1));
    } catch {
      return [];
    }
  }
  const products: any[] = j?.resources?.results?.products ?? [];
  const out: GatheredCandidate[] = [];
  for (const p of products) {
    let img: any =
      p?.image || p?.featured_image || (Array.isArray(p?.images) ? p.images[0] : null);
    if (img && typeof img === "object") img = img.src || img.url || null;
    if (!img || typeof img !== "string") continue;
    if (img.startsWith("//")) img = `https:${img}`;
    out.push({
      source: "topshelf",
      source_url: p?.url ? `https://topshelfaquatics.com${p.url}` : url,
      image_url: img,
      license: "Top Shelf Aquatics product photo",
      attribution: `Top Shelf Aquatics — ${p?.title ?? q}`,
      commercial_ok: false,
    });
    if (out.length >= 3) break;
  }
  return out;
}

// ---- Wikipedia REST summary ----
async function fromWikipedia(scientificName: string): Promise<GatheredCandidate[]> {
  const title = scientificName.trim().replace(/\s+/g, "_");
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const j: any = await res.json();
  const img = j?.originalimage?.source || j?.thumbnail?.source;
  if (!img) return [];
  return [
    {
      source: "wikipedia",
      source_url: j?.content_urls?.desktop?.page || url,
      image_url: img,
      license: "CC-BY-SA",
      attribution: `Wikipedia: ${j?.title ?? scientificName}`,
      commercial_ok: true,
    },
  ];
}

// ---- iNaturalist (commercial-license-only) ----
const INAT_COMMERCIAL_LICENSES = new Set(["cc0", "cc-by", "cc-by-sa"]);
async function fromINaturalist(scientificName: string): Promise<GatheredCandidate[]> {
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&per_page=3`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const j: any = await res.json();
  const out: GatheredCandidate[] = [];
  for (const t of j?.results ?? []) {
    const photo = t?.default_photo;
    if (!photo?.medium_url && !photo?.url) continue;
    const lic = (photo?.license_code || "").toLowerCase();
    const commercialOk = INAT_COMMERCIAL_LICENSES.has(lic);
    if (!commercialOk) continue;
    out.push({
      source: "inaturalist",
      source_url: `https://www.inaturalist.org/taxa/${t.id}`,
      image_url: photo.medium_url || photo.url,
      license: photo?.license_code || null,
      attribution: photo?.attribution || `iNaturalist taxon ${t?.name ?? scientificName}`,
      commercial_ok: true,
    });
    if (out.length >= 2) break;
  }
  return out;
}

// =========================================================================
// HTTP entry
// =========================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return jres({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return jres({ error: "Unauthorized" }, 401);

  // User-scoped client: RLS applies as the caller, and inserts are gated by
  // can_edit_content() policy on species_image_candidates.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return jres({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  // Active editor gate (mirrors requireEditor on the app side).
  const { data: canEdit } = await supabase.rpc("can_edit_content", { _user_id: userId });
  if (!canEdit) return jres({ error: "Forbidden: editor role required" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jres({ error: "Invalid JSON body" }, 400);
  }
  const contentItemId: string | undefined = body?.contentItemId;
  if (!contentItemId || typeof contentItemId !== "string") {
    return jres({ error: "contentItemId required" }, 400);
  }

  // Resolve post → source vendor batch.
  const { data: item, error: itemErr } = await supabase
    .from("content_items")
    .select("id, source_vendor_batch_id")
    .eq("id", contentItemId)
    .maybeSingle();
  if (itemErr) return jres({ error: itemErr.message }, 500);
  if (!item) return jres({ error: "Content item not found" }, 404);
  if (!item.source_vendor_batch_id) {
    return jres({ error: "This post is not linked to a vendor batch (no source batch)." }, 400);
  }
  const batchId = item.source_vendor_batch_id;

  // Livestock lines on the batch.
  const { data: lines, error: linesErr } = await supabase
    .from("vendor_line_items")
    .select("id, clean_item_name, raw_description, scientific_name, item_type")
    .eq("vendor_batch_id", batchId)
    .eq("kind", "sellable")
    .or(`item_type.is.null,item_type.in.(${ARRIVAL_IMG_TYPES.join(",")})`);
  if (linesErr) return jres({ error: linesErr.message }, 500);

  const lineIds = (lines ?? []).map((l: any) => l.id);

  // Clear stale unapproved candidates for these lines so re-runs are fresh.
  if (lineIds.length) {
    await supabase
      .from("species_image_candidates")
      .delete()
      .in("vendor_line_item_id", lineIds)
      .eq("approved", false);
  }

  // Track approved (image_url) per line for idempotent skip.
  const existingKeys = new Set<string>();
  if (lineIds.length) {
    const { data: existing } = await supabase
      .from("species_image_candidates")
      .select("vendor_line_item_id, image_url")
      .in("vendor_line_item_id", lineIds)
      .eq("approved", true);
    for (const e of existing ?? []) {
      existingKeys.add(`${e.vendor_line_item_id}::${e.image_url}`);
    }
  }

  let created = 0;
  const perSpecies: Array<{
    lineId: string;
    speciesKey: string | null;
    added: number;
    note?: string;
  }> = [];

  for (const line of lines ?? []) {
    const rawName =
      line.clean_item_name?.toString().trim() ||
      line.raw_description?.toString().trim() ||
      null;
    let scientific = line.scientific_name?.toString().trim() || null;
    let common: string | null = null;
    if (rawName) {
      const r = await resolveSpecies(rawName);
      common = r.common;
      if (!scientific) scientific = r.scientific;
    }
    const searchCommon = common || rawName;
    const speciesKey = scientific || common || rawName;
    if (!searchCommon && !scientific) {
      perSpecies.push({ lineId: line.id, speciesKey, added: 0, note: "no usable name" });
      continue;
    }
    const verifyName = scientific || common || rawName || "";

    const gathered: GatheredCandidate[] = [];
    if (searchCommon) {
      try {
        gathered.push(...(await fromTopShelf(searchCommon)));
      } catch (e) {
        console.error("topshelf failed", line.id, (e as Error).message);
      }
    }
    if (scientific) {
      try {
        gathered.push(...(await fromWikipedia(scientific)));
      } catch (e) {
        console.error("wikipedia failed", line.id, (e as Error).message);
      }
      try {
        gathered.push(...(await fromINaturalist(scientific)));
      } catch (e) {
        console.error("inaturalist failed", line.id, (e as Error).message);
      }
    }

    const seen = new Set<string>();
    const unique = gathered.filter((c) => {
      if (!c.image_url) return false;
      if (seen.has(c.image_url)) return false;
      seen.add(c.image_url);
      return true;
    });

    let added = 0;
    for (const cand of unique.slice(0, MAX_CANDIDATES_PER_SPECIES)) {
      const dedupeKey = `${line.id}::${cand.image_url}`;
      if (existingKeys.has(dedupeKey)) continue;

      const confidence = await aiMatchConfidence(cand.image_url, verifyName);

      const { error: insErr } = await supabase.from("species_image_candidates").insert({
        vendor_line_item_id: line.id,
        species_key: speciesKey,
        source: cand.source,
        source_url: cand.source_url,
        image_url: cand.image_url,
        license: cand.license,
        attribution: cand.attribution,
        commercial_ok: cand.commercial_ok,
        ai_match_confidence: confidence,
        approved: false,
        created_by: userId,
      });
      if (insErr) {
        console.error("candidate insert failed", line.id, insErr.message);
        continue;
      }
      existingKeys.add(dedupeKey);
      added++;
      created++;
    }
    perSpecies.push({ lineId: line.id, speciesKey, added });
  }

  return jres({ created, perSpecies });
});
