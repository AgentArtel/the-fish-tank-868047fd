// Supabase Edge Function: gather-species-images
// Owner-directed: external integrations (Firecrawl + AI) live here, not in the app Worker.
// Invoked by an authenticated editor:
//   supabase.functions.invoke('gather-species-images', { body: { contentItemId } })
// Returns: { created, perSpecies: [{ lineId, speciesKey, added, note? }] }
//
// Strategy (rewritten 2026-06-20 after wrong-species bug):
//   1. Resolve messy line name -> {common, scientific} via AI.
//   2. Top Shelf (Shopify suggest.json via Firecrawl) is queried with multiple
//      variants (common, scientific, genus, last word) and results are unioned
//      and dedup'd by product handle.
//   3. Each product is scored by title token overlap + scientific/genus bonus.
//      Top ~6 by title score go to AI-vision verification.
//   4. AI vision scores each candidate; candidates below threshold are dropped.
//      Surviving candidates are ranked by 0.6*vision + 0.4*title and the top
//      N (<=5) are inserted as species_image_candidates with vision score as
//      ai_match_confidence. Human approves.
//   5. Wikipedia + iNaturalist always contribute fallback candidates so a line
//      with zero Top Shelf hits (e.g. species the store doesn't carry) still
//      has something to approve.

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
const MAX_CANDIDATES_PER_SPECIES = 5;
const MAX_VISION_CHECKS_PER_LINE = 6;
const VISION_MIN_CONFIDENCE = 0.35;

type GatheredCandidate = {
  source: string;
  source_url: string;
  image_url: string;
  license: string | null;
  attribution: string | null;
  commercial_ok: boolean | null;
  /** product title or fallback caption — used for title scoring */
  title: string;
  /** product handle / unique key to dedup across queries */
  dedupeKey: string;
  /** title-match score in [0,1]; null for non-TopShelf where we trust the source */
  titleScore: number | null;
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

// ---- Resolve messy line name -> clean common + scientific ----
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
  verifyName: string,
): Promise<number | null> {
  try {
    const txt = await callAI([
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Does this image depict the aquarium species "${verifyName}"? Consider body shape, coloration, and distinguishing markings. Reply with ONLY a number from 0 to 1 (your confidence it IS this exact species — not just the same family). No other text.`,
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
  return (
    j?.data?.rawHtml ??
    j?.data?.html ??
    j?.data?.markdown ??
    j?.rawHtml ??
    j?.html ??
    ""
  );
}

// ---- Text helpers for scoring ----
const STOPWORDS = new Set([
  "the","a","an","and","or","of","with","for","fish","coral","invert","saltwater","marine",
  "captive","bred","captive-bred","aquacultured","wysiwyg","pack","small","medium","large",
  "sm","md","lg","xl","tiny","mini","jumbo","show","size","piece","pcs","each","ea",
  "tsa","reef","safe","live","frag","colony",
]);
function tokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}
function titleScore(productTitle: string, common: string | null, scientific: string | null): number {
  const titleToks = new Set(tokens(productTitle));
  if (titleToks.size === 0) return 0;
  let score = 0;
  // Common-name token overlap (Jaccard-ish, weighted toward query coverage)
  if (common) {
    const q = tokens(common);
    if (q.length) {
      const hit = q.filter((t) => titleToks.has(t)).length;
      score += (hit / q.length) * 0.7;
    }
  }
  // Scientific name: full or genus
  if (scientific) {
    const lower = productTitle.toLowerCase();
    if (lower.includes(scientific.toLowerCase())) score += 0.4;
    else {
      const genus = scientific.split(/\s+/)[0]?.toLowerCase();
      if (genus && titleToks.has(genus)) score += 0.25;
    }
  }
  return Math.min(1, score);
}

// ---- Top Shelf Aquatics (Shopify) via Firecrawl, multi-query ----
function cleanQuery(s: string): string {
  return s
    .replace(/\b(WYSIWYG|pack|small|medium|large|sm|md|lg|xl|jumbo|tiny|mini|show)\b/gi, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[;,/].*$/, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function buildTopShelfQueries(common: string | null, scientific: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string | null | undefined) => {
    if (!s) return;
    const q = cleanQuery(s);
    if (!q) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(q);
  };
  push(common);
  push(scientific);
  if (scientific) push(scientific.split(/\s+/)[0]); // genus
  if (common) {
    const toks = common.trim().split(/\s+/);
    if (toks.length > 1) push(toks[toks.length - 1]); // last word (e.g. "Basslet")
  }
  return out.slice(0, 4);
}

async function fetchTopShelfSuggest(query: string): Promise<any[]> {
  const url = `https://topshelfaquatics.com/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10`;
  const body = await fetchViaFirecrawl(url);
  let j: any;
  try { j = JSON.parse(body); }
  catch {
    const s = body.indexOf("{");
    const e = body.lastIndexOf("}");
    if (s < 0 || e <= s) return [];
    try { j = JSON.parse(body.slice(s, e + 1)); } catch { return []; }
  }
  return j?.resources?.results?.products ?? [];
}

async function fromTopShelf(
  common: string | null,
  scientific: string | null,
): Promise<GatheredCandidate[]> {
  const queries = buildTopShelfQueries(common, scientific);
  if (queries.length === 0) return [];
  const byHandle = new Map<string, GatheredCandidate>();
  for (const q of queries) {
    let products: any[] = [];
    try {
      products = await fetchTopShelfSuggest(q);
    } catch (e) {
      console.error("topshelf query failed", q, (e as Error).message);
      continue;
    }
    for (const p of products) {
      let img: any =
        p?.image || p?.featured_image || (Array.isArray(p?.images) ? p.images[0] : null);
      if (img && typeof img === "object") img = img.src || img.url || null;
      if (!img || typeof img !== "string") continue;
      if (img.startsWith("//")) img = `https:${img}`;
      const handle = p?.handle || p?.url || img;
      if (byHandle.has(handle)) continue;
      const title = p?.title ?? q;
      const cleanUrl = p?.url ? `https://topshelfaquatics.com${String(p.url).split("?")[0]}` : `https://topshelfaquatics.com/search?q=${encodeURIComponent(q)}`;
      const score = titleScore(title, common, scientific);
      byHandle.set(handle, {
        source: "topshelf",
        source_url: cleanUrl,
        image_url: img,
        license: "Top Shelf Aquatics product photo",
        attribution: `Top Shelf Aquatics — ${title}`,
        commercial_ok: false,
        title,
        dedupeKey: `topshelf::${handle}`,
        titleScore: score,
      });
    }
  }
  // Rank by title score desc; keep all non-zero so vision can still try edge cases.
  return [...byHandle.values()].sort((a, b) => (b.titleScore ?? 0) - (a.titleScore ?? 0));
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
  return [{
    source: "wikipedia",
    source_url: j?.content_urls?.desktop?.page || url,
    image_url: img,
    license: "CC-BY-SA",
    attribution: `Wikipedia: ${j?.title ?? scientificName}`,
    commercial_ok: true,
    title: j?.title ?? scientificName,
    dedupeKey: `wikipedia::${img}`,
    titleScore: 0.9, // Wikipedia page-title match implies strong signal
  }];
}

// ---- iNaturalist (allow NC since human approves and we mark commercial_ok accordingly) ----
const INAT_COMMERCIAL_LICENSES = new Set(["cc0", "cc-by", "cc-by-sa"]);
async function fromINaturalist(scientificName: string): Promise<GatheredCandidate[]> {
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(scientificName)}&per_page=3`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const j: any = await res.json();
  const out: GatheredCandidate[] = [];
  for (const t of j?.results ?? []) {
    const photo = t?.default_photo;
    const imgUrl = photo?.medium_url || photo?.url;
    if (!imgUrl) continue;
    const lic = (photo?.license_code || "").toLowerCase();
    if (!lic) continue; // skip "all rights reserved"
    const commercialOk = INAT_COMMERCIAL_LICENSES.has(lic);
    out.push({
      source: "inaturalist",
      source_url: `https://www.inaturalist.org/taxa/${t.id}`,
      image_url: imgUrl,
      license: photo?.license_code || null,
      attribution: photo?.attribution || `iNaturalist taxon ${t?.name ?? scientificName}`,
      commercial_ok: commercialOk,
      title: t?.name ?? scientificName,
      dedupeKey: `inaturalist::${imgUrl}`,
      titleScore: 0.8,
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return jres({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  const { data: canEdit } = await supabase.rpc("can_edit_content", { _user_id: userId });
  if (!canEdit) return jres({ error: "Forbidden: editor role required" }, 403);

  let body: any;
  try { body = await req.json(); }
  catch { return jres({ error: "Invalid JSON body" }, 400); }
  const contentItemId: string | undefined = body?.contentItemId;
  if (!contentItemId || typeof contentItemId !== "string") {
    return jres({ error: "contentItemId required" }, 400);
  }

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
    const speciesKey = scientific || common || rawName;
    if (!common && !scientific && !rawName) {
      perSpecies.push({ lineId: line.id, speciesKey, added: 0, note: "no usable name" });
      continue;
    }
    const verifyName = scientific || common || rawName || "";

    // Gather from all sources.
    const gathered: GatheredCandidate[] = [];
    try {
      gathered.push(...(await fromTopShelf(common, scientific)));
    } catch (e) {
      console.error("topshelf failed", line.id, (e as Error).message);
    }
    if (scientific) {
      try { gathered.push(...(await fromWikipedia(scientific))); }
      catch (e) { console.error("wikipedia failed", line.id, (e as Error).message); }
      try { gathered.push(...(await fromINaturalist(scientific))); }
      catch (e) { console.error("inaturalist failed", line.id, (e as Error).message); }
    }

    // Dedup by dedupeKey (already unique per source); also dedup by image_url.
    const seenImg = new Set<string>();
    const unique = gathered.filter((c) => {
      if (!c.image_url) return false;
      if (seenImg.has(c.image_url)) return false;
      seenImg.add(c.image_url);
      return true;
    });

    // Cap how many we vision-check per line: prioritise high title-score TopShelf
    // hits and always include Wiki/iNat (they're cheap signal).
    const tsRanked = unique
      .filter((c) => c.source === "topshelf")
      .sort((a, b) => (b.titleScore ?? 0) - (a.titleScore ?? 0))
      .slice(0, MAX_VISION_CHECKS_PER_LINE - 2);
    const others = unique.filter((c) => c.source !== "topshelf");
    const toCheck = [...tsRanked, ...others].slice(0, MAX_VISION_CHECKS_PER_LINE);

    type Scored = GatheredCandidate & { vision: number | null; final: number };
    const scored: Scored[] = [];
    for (const cand of toCheck) {
      const vision = await aiMatchConfidence(cand.image_url, verifyName);
      const v = vision ?? 0;
      const ts = cand.titleScore ?? 0.5;
      const final = 0.6 * v + 0.4 * ts;
      scored.push({ ...cand, vision, final });
    }

    // Drop obvious non-matches; if everything filtered, fall back to keeping
    // best-by-final so the human always has something to look at.
    let kept = scored.filter((s) => (s.vision ?? 0) >= VISION_MIN_CONFIDENCE);
    if (kept.length === 0 && scored.length > 0) {
      kept = scored.sort((a, b) => b.final - a.final).slice(0, 2);
    } else {
      kept.sort((a, b) => b.final - a.final);
      kept = kept.slice(0, MAX_CANDIDATES_PER_SPECIES);
    }

    let added = 0;
    for (const cand of kept) {
      const dedupeKey = `${line.id}::${cand.image_url}`;
      if (existingKeys.has(dedupeKey)) continue;
      const { error: insErr } = await supabase.from("species_image_candidates").insert({
        vendor_line_item_id: line.id,
        species_key: speciesKey,
        source: cand.source,
        source_url: cand.source_url,
        image_url: cand.image_url,
        license: cand.license,
        attribution: cand.attribution,
        commercial_ok: cand.commercial_ok,
        ai_match_confidence: cand.vision,
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
    const topVision = kept[0]?.vision ?? null;
    perSpecies.push({
      lineId: line.id,
      speciesKey,
      added,
      note: added
        ? `top vision=${topVision?.toFixed(2) ?? "n/a"} (${kept[0]?.source})`
        : "no candidates passed filter",
    });
  }

  return jres({ created, perSpecies });
});
