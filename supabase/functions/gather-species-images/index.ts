// Supabase Edge Function: gather-species-images
// Owner-directed: external integrations live here, not in the app Worker.
// Invoked by an authenticated editor:
//   supabase.functions.invoke('gather-species-images', { body: { contentItemId } })
// Returns: { created, perSpecies: [{ lineId, speciesKey, added, note? }] }
//
// Strategy (simplified 2026-06-20): Wikipedia only.
//   1. Resolve messy line name -> scientific name via AI (if not already set).
//   2. Fetch the species' Wikipedia page summary (lead image) and its
//      media-list (other images on the page).
//   3. Insert up to N candidates per species. Human approves.
//   No Top Shelf, no iNaturalist, no AI-vision scoring.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ARRIVAL_IMG_TYPES = ["fish", "coral", "invert", "live_rock"] as const;
const MAX_CANDIDATES_PER_SPECIES = 6;
const WIKI_HEADERS = {
  Accept: "application/json",
  "User-Agent": "TheFishTank/1.0 (https://the-fish-tank.lovable.app; contact via Lovable)",
};

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

// ---- Wikipedia: resolve the best page title for a species ----
// Tries scientific first (more precise), falls back to common name.
async function resolveWikiTitle(
  scientific: string | null,
  common: string | null,
): Promise<{ title: string; pageUrl: string } | null> {
  const candidates = [scientific, common].filter(Boolean) as string[];
  for (const q of candidates) {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q.trim().replace(/\s+/g, "_"))}?redirect=true`;
    const res = await fetch(url, { headers: WIKI_HEADERS });
    if (!res.ok) continue;
    const j: any = await res.json().catch(() => null);
    // Skip disambiguation pages
    if (!j || j.type === "disambiguation") continue;
    const title = j.title as string | undefined;
    if (!title) continue;
    const pageUrl =
      j?.content_urls?.desktop?.page ||
      `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
    return { title, pageUrl };
  }
  return null;
}

// ---- Wikipedia: lead image (summary) ----
async function fetchWikiLeadImage(
  title: string,
  pageUrl: string,
): Promise<GatheredCandidate | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
  const res = await fetch(url, { headers: WIKI_HEADERS });
  if (!res.ok) return null;
  const j: any = await res.json().catch(() => null);
  const img = j?.originalimage?.source || j?.thumbnail?.source;
  if (!img) return null;
  return {
    source: "wikipedia",
    source_url: pageUrl,
    image_url: img,
    license: "See Wikimedia Commons file page",
    attribution: `Wikipedia: ${j?.title ?? title}`,
    commercial_ok: true,
  };
}

// ---- Wikipedia: all images on the page (media-list) ----
async function fetchWikiMediaList(
  title: string,
  pageUrl: string,
  limit: number,
): Promise<GatheredCandidate[]> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
  const res = await fetch(url, { headers: WIKI_HEADERS });
  if (!res.ok) return [];
  const j: any = await res.json().catch(() => null);
  const items: any[] = Array.isArray(j?.items) ? j.items : [];
  const out: GatheredCandidate[] = [];
  for (const it of items) {
    if (it?.type !== "image") continue;
    // Prefer the largest srcset entry, else the inline `src`.
    let src: string | null = null;
    if (Array.isArray(it?.srcset) && it.srcset.length) {
      const last = it.srcset[it.srcset.length - 1];
      src = last?.src ?? null;
    }
    if (!src) src = it?.src ?? null;
    if (!src) continue;
    if (src.startsWith("//")) src = `https:${src}`;
    // Wikipedia thumbnails often come back as /thumb/...; that's fine for preview.
    const caption =
      it?.caption?.text || it?.caption?.html || it?.title || title;
    out.push({
      source: "wikipedia",
      source_url: pageUrl,
      image_url: src,
      license: "See Wikimedia Commons file page",
      attribution: `Wikipedia (${title}): ${String(caption).replace(/<[^>]+>/g, "").slice(0, 200)}`,
      commercial_ok: true,
    });
    if (out.length >= limit) break;
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
    if (rawName && (!scientific || !common)) {
      const r = await resolveSpecies(rawName);
      common = r.common;
      if (!scientific) scientific = r.scientific;
    }
    const speciesKey = scientific || common || rawName;
    if (!scientific && !common) {
      perSpecies.push({ lineId: line.id, speciesKey, added: 0, note: "no usable name" });
      continue;
    }

    // Resolve Wikipedia page once for this species.
    let wiki: { title: string; pageUrl: string } | null = null;
    try {
      wiki = await resolveWikiTitle(scientific, common);
    } catch (e) {
      console.error("wiki resolve failed", line.id, (e as Error).message);
    }
    if (!wiki) {
      perSpecies.push({ lineId: line.id, speciesKey, added: 0, note: "no Wikipedia page" });
      continue;
    }

    // Gather lead image + all media-list images, dedup by URL.
    const gathered: GatheredCandidate[] = [];
    try {
      const lead = await fetchWikiLeadImage(wiki.title, wiki.pageUrl);
      if (lead) gathered.push(lead);
    } catch (e) {
      console.error("wiki lead failed", line.id, (e as Error).message);
    }
    try {
      const media = await fetchWikiMediaList(wiki.title, wiki.pageUrl, MAX_CANDIDATES_PER_SPECIES);
      gathered.push(...media);
    } catch (e) {
      console.error("wiki media-list failed", line.id, (e as Error).message);
    }

    const seen = new Set<string>();
    const unique = gathered.filter((c) => {
      if (!c.image_url) return false;
      if (seen.has(c.image_url)) return false;
      seen.add(c.image_url);
      return true;
    }).slice(0, MAX_CANDIDATES_PER_SPECIES);

    let added = 0;
    for (const cand of unique) {
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
        ai_match_confidence: null,
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
    perSpecies.push({
      lineId: line.id,
      speciesKey,
      added,
      note: added ? `wiki:${wiki.title}` : "no images on Wikipedia page",
    });
  }

  return jres({ created, perSpecies });
});
