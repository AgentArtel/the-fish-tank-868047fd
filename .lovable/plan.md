## One-time seed: Top Shelf fish glossary → species image library

Scrape `https://topshelfaquatics.com/pages/fish-glossary` once, download every fish image, and load them into `media_assets` tagged with `species_key` so they auto-attach to future PO drafts (same upload-once flow we just shipped).

### How it runs

A new admin-only Supabase Edge Function `seed-topshelf-glossary` (per project rule 7: external HTTP belongs in an edge function, not the app Worker). Triggered manually by an admin via a small button on `/settings.ai` (or wherever you prefer — say the word). No cron, no schedule, no UI elsewhere.

### What it does

1. Fetch the glossary page via Firecrawl (`scrape`, formats `['html','links']`).
2. Parse out each fish entry — pair the `<img>` with its nearby caption (common name, and scientific name when present in italics/parentheses).
3. For each entry:
   - Compute `species_key` = `lower(trim(scientific_name))` if available, else `lower(trim(common_name))` — same rule as `buildArrivalPostFromBatch`.
   - Skip if a `media_assets` row already exists with that `species_key` (idempotent — safe to re-run).
   - Download the image, upload to the existing `media-assets` storage bucket under `species-seed/topshelf/<species_key>.<ext>`.
   - Insert a `media_assets` row: `species_key`, `storage_path`, `public_url`, `kind='image'`, `source='topshelf-glossary'`, `attribution='Top Shelf Aquatics'`, `created_by = caller`.
4. Return `{ scanned, inserted, skipped, errors[] }` so the admin sees the result inline.

### Out of scope

- No changes to PO flow, content detail page, or `buildArrivalPostFromBatch` — they already read `media_assets` by `species_key`, so seeded rows just show up.
- No vendor scraper, no AI matching, no candidate-review step. Trust the glossary's own labels.
- No corals/inverts — fish glossary only. (Easy to add a second page later.)

### Files

- `supabase/functions/seed-topshelf-glossary/index.ts` — new edge function (Firecrawl + parse + upload + insert).
- `supabase/config.toml` — register the function.
- `src/lib/cms.functions.ts` — thin `seedTopshelfGlossary` server fn that invokes the edge fn (admin-gated).
- `src/routes/_app/settings.ai.tsx` (or your pick) — "Seed Top Shelf fish glossary" button + result toast.

### Open question

Where do you want the trigger button? Options: **Settings → AI**, **Media library page**, or a one-off **admin tools** spot. Default I'll use if you don't say: Settings → AI.
