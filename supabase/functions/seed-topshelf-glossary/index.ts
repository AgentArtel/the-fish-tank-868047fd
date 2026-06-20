// Edge function: seed-topshelf-glossary
//
// One-time (idempotent) seed: pull every fish entry from the Top Shelf
// glossary's Shopify Storefront GraphQL endpoint (the same one the page
// itself uses), download each image, and insert one media_assets row per
// species — tagged with species_key so future PO drafts auto-attach them.
//
// Admin-only. Triggered manually from Settings → AI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// These are baked into the public page markup (data-endpoint / data-token on
// the <section class="glossary-grid"> element). They're a public Storefront
// API token — safe to use server-side without secrets management.
const SHOPIFY_GQL = "https://763aab.myshopify.com/api/2024-07/graphql.json";
const STOREFRONT_TOKEN = "e769c8926d6b26e7efbf0c3d5d4f1935";
const METAOBJECT_TYPE = "fish_glossary_template";
const BUCKET = "media";

type Card = {
  handle: string;
  common_name: string;
  scientific_name: string | null;
  image_url: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function speciesKey(c: { scientific_name: string | null; common_name: string }) {
  // Match the app's speciesKeyFromLine: PO line items carry the common name,
  // not the scientific name — so we key on common name and normalize the same
  // way on both sides (lowercase, non-alphanumerics → single space, trim).
  const raw = (c.common_name || c.scientific_name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
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

const GQL_QUERY = `
  query Glossary($type: String!, $first: Int!, $after: String) {
    metaobjects(type: $type, first: $first, after: $after) {
      edges {
        cursor
        node {
          handle
          common: field(key: "common_name") { value }
          sci: field(key: "scientific_name") { value }
          name: field(key: "name") { value }
          img: field(key: "image") {
            reference { ... on MediaImage { image { url } } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

type GqlNode = {
  handle: string;
  common: { value: string | null } | null;
  sci: { value: string | null } | null;
  name: { value: string | null } | null;
  img: { reference: { image: { url: string } | null } | null } | null;
};

async function fetchAllCards(): Promise<Card[]> {
  const rows: Card[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const res = await fetch(SHOPIFY_GQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
      },
      body: JSON.stringify({
        query: GQL_QUERY,
        variables: { type: METAOBJECT_TYPE, first: 250, after: cursor },
      }),
    });
    if (!res.ok) {
      throw new Error(`Shopify GraphQL ${res.status}: ${(await res.text()).slice(0, 400)}`);
    }
    const body = await res.json();
    if (body.errors) throw new Error(`GraphQL errors: ${JSON.stringify(body.errors).slice(0, 400)}`);
    const mo = body?.data?.metaobjects;
    const edges: Array<{ cursor: string; node: GqlNode }> = mo?.edges ?? [];
    for (const { node } of edges) {
      const common = node.common?.value || node.name?.value || "";
      const sci = node.sci?.value || null;
      const url = node.img?.reference?.image?.url || "";
      if (!common || !url) continue;
      rows.push({
        handle: node.handle,
        common_name: common.trim(),
        scientific_name: sci ? sci.trim() : null,
        image_url: url,
      });
    }
    if (!mo?.pageInfo?.hasNextPage) break;
    cursor = mo.pageInfo.endCursor;
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  // Optional: wipe previously-seeded entries (DB rows + storage objects) so we
  // can re-seed with a different keying strategy. Triggered with {"reset":true}.
  let body: { reset?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  let resetDeleted = 0;
  if (body.reset) {
    const { data: oldRows } = await admin
      .from("media_assets")
      .select("id, storage_path")
      .like("source_notes", "%Top Shelf glossary%");
    const paths = (oldRows ?? []).map((r: any) => r.storage_path).filter(Boolean);
    if (paths.length) {
      // Storage supports batch removal up to 1000 paths.
      for (let i = 0; i < paths.length; i += 500) {
        await admin.storage.from(BUCKET).remove(paths.slice(i, i + 500));
      }
      const ids = (oldRows ?? []).map((r: any) => r.id);
      // content_media has FK on media_asset_id; drop any links first.
      await admin.from("content_media").delete().in("media_asset_id", ids);
      await admin.from("media_assets").delete().in("id", ids);
      resetDeleted = ids.length;
    }
  }

  // 1. Pull every glossary entry via the storefront GraphQL endpoint.
  let cards: Card[];
  try {
    cards = await fetchAllCards();
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

  // 3. Download → upload → insert, one species at a time.
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
        source_notes: `Seeded from Top Shelf glossary: https://topshelfaquatics.com/pages/saltwater-fish/${card.handle}`,
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
    resetDeleted,
    errors,
  });
});
