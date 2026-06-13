# Hand-off — Vendor Watch: Firecrawl fallback for blocked sources (for Lovable)

Date: 2026-06-13 · Author: Claude Code. This queues the egress fallback for
sources whose free Shopify `products.json` fetch is network-blocked.

## Status: the adapter is SHIPPED — only the API key remains

Per the boss's call, the Firecrawl transport is **built and merged** (in
`scrape.functions.ts`). It's safe to wire up now because of the design below:
**zero Firecrawl credits are spent until a source is actually blocked.** The
direct free fetch always runs first; Firecrawl only fires on a 403/429. So
turning it on now costs nothing for working vendors and gives us a ready,
reusable fallback for any future blocked vendor.

(At ~weekly volume per source, Firecrawl's **free tier** should cover us anyway.)

Side note on whether the Furnace block is even "real" vs our own test-volume: a
single cooled-down request (tonight's 22:00 ET tick, or one "Refresh now" on the
deployed app) is the cleanest signal. But we no longer need to decide that before
building — auto-fallback means a blocked Furnace will just transparently use
Firecrawl and a working Furnace won't touch it.

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

| Piece | Owner | Status |
|---|---|---|
| Provision the Firecrawl **API key** server-side | **Lovable** | ⬅ the only open item |
| `firecrawl` transport + auto-fallback in `runScrapeForSource` | **Claude** (`src/`) | ✅ shipped |

### The one thing I need from you (Lovable)
**A Firecrawl API key reachable as `process.env.FIRECRAWL_API_KEY`** on the
deployed app — same mechanism as `SCRAPE_CRON_SECRET` (app runtime env + Vault
mirror). That's it; the adapter reads the key from the env and self-activates on
the next blocked fetch. (The full Vault-backed API-keys **settings UI** —
workspace key else Lovable-integration fallback, masked — is a later phase, not
this hand-off.)

Endpoint is already wired to your default: **`POST https://api.firecrawl.dev/v2/scrape`**,
`Authorization: Bearer <key>`, body `{ url, formats: ["rawHtml"] }`. If your
Firecrawl access differs, tell me and I'll adjust.

### What's already built (Claude — for your review)
- `fetchViaFirecrawl(url)` → POSTs to v2/scrape, returns the raw body;
  `extractProductsJson()` recovers the JSON even if Firecrawl wraps it in
  HTML/markdown.
- The pagination loop tries **direct** first and **auto-falls back to Firecrawl**
  on a 403/429 (only if a key is present), per page.
- The scrape summary now reports `transport: "direct" | "firecrawl"`; the manual
  "Refresh now" toast shows "· via Firecrawl" when the fallback fired.
- No change to parsing, snapshots, RLS, or the cron.

### To verify once the key is in
Click "Refresh now" on the Furnace source (currently blocked). Expected: the
direct fetch 403s, Firecrawl transparently takes over, items load, and the toast
reads "… · via Firecrawl". If Firecrawl's `rawHtml` for a `.json` URL comes back
in an unexpected shape, paste me the `net._http_response` body and I'll tune
`extractProductsJson`.

## Not in scope
- No full API-keys settings surface yet (later phase).
- No change to the Shopify JSON parsing or the append-only snapshot logic.
- Don't spend Firecrawl on sources the direct fetch already serves.
