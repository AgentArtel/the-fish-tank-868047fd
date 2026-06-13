# Hand-off — Vendor Watch: Firecrawl fallback for blocked sources (for Lovable)

Date: 2026-06-13 · Author: Claude Code. This queues the egress fallback for
sources whose free Shopify `products.json` fetch is network-blocked.

## ⚠️ Precondition — confirm the block is real before we spend anything

The Furnace `products.json` is 403'ing our Cloudflare Worker egress. Headers
(User-Agent + retry) are already merged and **didn't help** → it's a network/TLS
fingerprint block, not headers. **But** we'd been hammering it with repeated
forced test passes, which can trip Cloudflare bot-protection on its own — and the
real cron only hits this store **once a week**. So before building this:

1. Confirm a residential `curl` of the URL returns 200 (store serves normal
   clients), and
2. Let tonight's **single** scheduled 22:00 ET tick run — if it 200s, the earlier
   403s were our test-volume and **there's nothing to build here.**

Only proceed if a single, cooled-down request still 403s. (Good news: at ~weekly
volume per source, Firecrawl's **free tier** should cover us, so even when we do
turn it on, cost is ~nil.)

## Design (KISS): Firecrawl is a transport, with auto-fallback

We do **not** add a new source type or change parsing. The plan:

- `runScrapeForSource` tries the **free direct fetch** first (unchanged — no
  Firecrawl credits for the vendors it already works for).
- **Only if that fetch is blocked** (403/429, or a network error), it retries the
  *same URL* through **Firecrawl** as a clean-egress proxy, gets the raw
  `products.json` body back, and runs the **same** append-only snapshot logic.
- We record which transport succeeded (in the source's `last_scrape_error` /
  status text) so the new status strip shows it.

This means: free path stays free; Firecrawl is spent only on the rare blocked
source, automatically, with no per-source config to manage.

## Lane split

| Piece | Owner |
|---|---|
| Provision the Firecrawl **API key** server-side (see below) | **Lovable** |
| `firecrawl` fetch transport + auto-fallback in `runScrapeForSource` | **Claude** (`src/`) |

### What I need from you (Lovable)
1. **A Firecrawl API key available to the server**, as `FIRECRAWL_API_KEY` in the
   app runtime env (same mechanism as `SCRAPE_CRON_SECRET`) **and** Vault. Per the
   locked decision, keys are Vault-stored, server-side only, masked — resolution =
   workspace key if set, else the Lovable Firecrawl integration fallback. For now
   I just need the key reachable as `process.env.FIRECRAWL_API_KEY`; the full
   API-keys **settings UI** is a later phase, not this hand-off.
2. **Confirm the access path:** do we call `https://api.firecrawl.dev/v1/scrape`
   directly with that key, or does the Lovable Firecrawl integration expose a
   different endpoint/proxy you'd rather I call? Tell me the endpoint + auth
   header shape and I'll wire to it.
3. **Confirm free-tier limits** on the key so we know our weekly volume stays
   inside them.

### What I'll do (Claude) once the key + endpoint are confirmed
- Add a `fetchViaFirecrawl(url)` helper that POSTs to the Firecrawl scrape
  endpoint requesting the **raw body** of the `.json` URL, parses the JSON, and
  returns it in the same shape `runScrapeForSource` already consumes.
- Wrap the existing direct fetch so a block transparently falls back to Firecrawl;
  surface the transport in the scrape status.
- No change to parsing, snapshots, RLS, or the cron.

## Not in scope
- No full API-keys settings surface yet (later phase).
- No change to the Shopify JSON parsing or the append-only snapshot logic.
- Don't spend Firecrawl on sources the direct fetch already serves.
