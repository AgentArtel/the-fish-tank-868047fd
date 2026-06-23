# Scope — Public business website (decoupled, data-driven, marketing → live auctions)

Date: 2026-06-23 · Author: Claude Code (scoping/design — no app code changed).
Status: **Phase 4 scoping — direction, not committed scope.** This is the **master doc** of a 5-doc
handoff packet (index in §9). Needs the owner's un-park sign-off before any build.

> **Parked-layer note.** A public customer-facing site is **roadmap Phase 4** in `VISION.md`
> ("direction, not scope"), and current focus per `CLAUDE.md` is *organizing the coral inventory*.
> This packet is written so the website is a **thin, decoupled read-consumer** of the workspace DB —
> it adds public *surface*, not new operational machinery — and so it does **not** compete with the
> coral-inventory work. Build only on explicit go.

---

## 1. Intent (from the owner)

> "A decoupled, data-driven website that populates from the workspace database. Everything is
> organized and set up there as the source of truth. The website just displays what we need to the
> public side." First pass = **business/marketing site** (what we carry, services, blog/articles,
> customer showcases). Scaling later to **live auctions** and **public customer accounts**. Right
> now: research the biggest coral/marine-fish players, blueprint what works, establish a clean
> competitive design system, and map the data/JSON schemas that pages render from the DB.

This packet delivers exactly those four: competitive blueprint, design system, data/JSON-schema map,
and the architecture/phasing spec (this doc) — plus a public-accounts scope for the Phase-4 goal.

---

## 2. Architecture — the decoupling boundary

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  Internal ops app (src/)    │  writes │   Supabase (workspace DB)    │
│  staff CRM, intake, pricing │────────▶│   = SINGLE SOURCE OF TRUTH   │
│  review → go-live gates     │         │                              │
└─────────────────────────────┘         │   public_* VIEWS (anon RLS)  │
                                        │   sanitized, allowlisted      │
                                        └──────────────┬───────────────┘
                                          reads only   │  (PostgREST anon key
                                                       │   + read-only edge fns)
                                        ┌──────────────▼───────────────┐
                                        │  Public website (decoupled)  │
                                        │  marketing · catalog · blog  │
                                        │  live sales · accounts (P4)  │
                                        └──────────────────────────────┘
```

**Principles:**
- **DB is the source of truth; the site is read-only** over sanitized `public_*` views. Staff never
  "edit the website" — they organize inventory/content in the app, and the site reflects it. (This is
  exactly the data-driven posture CLAUDE.md already mandates for edge-fn integrations.)
- **Public reads belong in Supabase, not the app Worker** (Engineering Rule 7). The decoupled site
  reads PostgREST views with the anon key + RLS, or thin **read-only edge functions** where signing /
  shaping / real-time (auctions) is needed. The existing app-side `getPublicCatalog` is an interim
  shim to migrate off this boundary. (Aligns with `scope-edge-function-migration.md`.)
- **Sanitization is structural.** The view column list is the contract; internal columns (cost,
  vendor, PII, workflow) cannot physically appear. See `scope-public-website-data-schemas.md` §2.
- **Decoupled deploy.** The public site can be its own deployment/theme (own design tokens), so its
  traffic never hits the ops Worker's budget and its look isn't coupled to the internal app.
  *Open decision (§8):* separate app vs. a public route-group within this repo.

---

## 3. Sitemap / information architecture

Consensus IA distilled from the category leaders (`research-public-website-competitors.md` §2):

```
Home                     hero · featured/WYSIWYG rail · latest articles · trust strip · CTAs
Livestock / Shop         = existing public catalog, expanded
  Corals (SPS·LPS·Euphyllia·Zoas·Softies·Anemones) · Fish · Inverts · Live Rock · Dry Goods
  WYSIWYG (badge/filter across the above)
Care Guides / Learn      per-species + how-to articles — the SEO engine
Live Sales & Events      calendar now → drops/auctions (Phase 4+)
Services                 maintenance · custom builds · quarantine · trade-in
About / The Shop         story · team · location/hours · gallery
Visit / Contact          map · hours · form · socials
Account (Phase 4)        login · wishlist · order history · Reef Credit · bids
Guarantee · Shipping · FAQ   trust pages, surfaced site-wide (not buried)
```

---

## 4. Reuse map — what already exists vs. net-new

| Need | Already exists | Net-new |
|---|---|---|
| **Catalog / "what we carry"** | ✅ `getPublicCatalog` + `/catalog` (sanitized, SEO meta, signed photos) | Detail page, care-stats row, WYSIWYG badge, blue/white gallery, slugs |
| **Care/lighting/flow data** | ✅ `inventory_items.attrs` per type (`item-type-attrs.ts`) | Public projection (strip `inventory_role`); optional PAR-band/feeding additions |
| **Blog / articles** | ✅ marketing `content_items` + `content_media` + `media_assets` | `status='posted'` public view, article slugs, reading view |
| **Customer profiles** | ✅ internal `customers` CRM (Clover-sourced) | **Public accounts** (auth + RLS) linked to it — `scope-public-customer-accounts.md` |
| **Loyalty / credit** | ✅ `loyalty_ledger`+`loyalty_config` (Reef Credit), `store_credit_ledger` | Read-only public balance surface |
| **Systems/tanks browse** | ✅ `store_locations` (+ `store_location_media`) | Friendly public `public_systems` view |
| **Design system** | ✅ Tailwind v4 + shadcn/Radix tokens | Dark public theme — `design-public-website-system.md` |
| **Live sales / auctions** | — (parked) | New tables + real-time edge fn (`scope-...-data-schemas.md` §3.8) |

**Headline:** the marketing site is *mostly assembly* of data + content that already exists. The two
genuinely new builds are **public accounts** (auth/RLS) and **live auctions** (real-time) — both
Phase 4+.

---

## 5. Phasing

| Phase | Scope | Lanes |
|---|---|---|
| **4a — Marketing shell** | Static Home/Services/About/Visit + trust pages; reuse existing catalog; SEO meta. **No DB changes.** | Claude (frontend) |
| **4b — Data-driven catalog+blog** | `public_*` views, slugs, detail page, care stats, public articles, systems browse | Lovable (views/RLS) + Claude (frontend) |
| **4c — Public accounts** | Auth, `customer_accounts`, wishlist, alerts, Reef Credit balance | Lovable (auth/RLS/edge) + Claude |
| **4d — Live sales / auctions** | Drop model first, then timed auction (anti-snipe), real-time edge fn | Lovable (edge/tables) + Claude |

Each phase is independently shippable and reversible. 4a touches no DB and no parked layer behavior —
it's the safe first step if the owner wants momentum without un-parking inventory work.

---

## 6. "Scaffold the public shell" — concrete 4a plan (no DB, no sign-off needed beyond go)

If the owner wants the shell built now (one of the three requested deliverables):
- **Routes:** a public route group (e.g. `src/routes/(public)/...`) or a separate deploy — `home`,
  `services`, `about`, `visit`, `guarantee`, `shipping`, `faq`; link out to the existing `/catalog`.
- **Theme:** dark token set from `design-public-website-system.md`, isolated from the ops app.
- **Components:** `SiteHeader/Footer`, `Hero`, `TrustStrip`, reusing shadcn primitives; extend the
  existing `CatalogCard`.
- **Content:** static MDX/JSX for marketing copy (no CMS in v1).
- **Definition of Done:** typecheck+build clean; no white-screen on empty data; the human tests the
  running site. **No routing/architecture change to the internal app** (Engineering Rule 2) — the
  public group is additive.

This stays within Claude's lane and the parked-layer rule (additive public surface, no inventory
behavior change), but still wants an explicit "build 4a now" before code lands.

---

## 7. Domain-invariant compliance

- **Read-only / data-driven.** The site never approves pricing, marks review, or creates inventory —
  it reflects what staff already took live through the existing gates. AI is uninvolved.
- **No item public without a photo.** The catalog filter (`availability='available'`,
  `retail_price>0`, `qty>0`, photo-ranked) already enforces this; public views inherit it.
- **External/public I/O in edge functions, not the Worker** (Rule 7) — the public read boundary and
  all alert/auction logic are Supabase-side.
- **DB changes are Lovable's lane** — every `public_*` view, new table, RLS policy, and auth change
  ships as a reviewed migration in `supabase/migrations/`, never dashboard SQL (WORKFLOW Golden Rule
  #1). This doc provides specs, not applied schema.
- **Review gate.** Nothing is "done" until Claude reviews RLS/IDOR/cache-invalidation/CORS and the
  human tests the live flow.

---

## 8. Open questions for the owner (cross-packet)

1. **Un-park sign-off:** approve scoping Phase 4 at all, and which phase to start (recommend **4a
   marketing shell** for safe momentum, or **4b** if you want the data-driven catalog first)?
2. **Deployment shape:** separate decoupled app/deploy, or a public route-group inside this repo?
   (Both are "decoupled by data"; a separate deploy is more literally decoupled.)
3. **Read boundary:** anon PostgREST on `public_*` views vs. read-only edge functions (recommend
   views + edge fns for signed/real-time).
4. **Brand/design:** existing logo/palette to anchor, or adopt the neon-coral/cyan-on-charcoal
   direction? (`design-...-system.md` §8.)
5. **Customer profiles = real accounts** (confirmed by owner): start at rung 0→2 (login + wishlist +
   balances)? (`scope-public-customer-accounts.md` §8.)
6. **Live-sale mechanic:** start with the **drop** model (simplest) and design for a later **timed
   auction**, per `research-...-competitors.md` §5?
7. **Schema additions** (slugs, `public_description`, blue/white-light flag, PAR band): approve the
   small additive changes that make listings best-in-class? (`scope-...-data-schemas.md` §7.)

---

## 9. Packet index

| Doc | What it covers |
|---|---|
| **`scope-public-website.md`** (this) | Architecture, sitemap/IA, reuse map, phasing, 4a shell plan, invariants, cross-packet open questions. |
| `research-public-website-competitors.md` | Competitive blueprint — WWC, Tidal Gardens, Top Shelf, LiveAquaria, Unique, Cherry, Aquatic Collection + Whatnot/CommentSold auction models; the "what works" pattern library; live-auction UX. |
| `design-public-website-system.md` | Dark-canvas design system (color/type/spacing/motion/components) on Tailwind v4 + shadcn to compete with the premium players. |
| `scope-public-website-data-schemas.md` | Data → public JSON contracts per page (real columns), the sanitization allowlist, `attrs`→care-stats map, media contract, where contracts run. |
| `scope-public-customer-accounts.md` | Phase-4 public accounts (auth/RLS/wishlist/alerts/Reef Credit/bidding) extending the internal `customers` + loyalty ledgers. |

Related existing docs this packet builds on: `scope-customer-profiles.md`, `scope-loyalty-program.md`,
`scope-store-credit.md`, `scope-edge-function-migration.md`, `VISION.md`, `REALITY_MAP.md`,
`WORKFLOW.md`, `CLAUDE.md`.
</content>
