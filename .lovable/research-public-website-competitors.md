# Research — Public website competitive blueprint (coral & marine-fish leaders)

Date: 2026-06-23 · Author: Claude Code (research/scoping — no app code changed).
Status: **research input for Phase 4.** Feeds `scope-public-website.md`,
`design-public-website-system.md`, `scope-public-website-data-schemas.md`,
`scope-public-customer-accounts.md`.

> **Method & confidence.** Synthesized from multi-source web research across the category's
> leaders. **Every major vendor site (WWC, Tidal Gardens, Unique, Cherry, Top Shelf, LiveAquaria,
> Aquatic Collection, Battlecorals, etc.) hard-blocks automated fetchers with HTTP 403** (Cloudflare /
> Shopify bot protection), so findings come from search-indexed page content, the vendors' own
> policy/help pages, and community corroboration (Reef2Reef, Reef Builders). **IA, mechanics, and
> policy numbers are well-grounded; exact hex/fonts/pixel layout are inferred** and must be confirmed
> with a manual browser pass before locking visual decisions. Quoted numbers (point tiers, DOA
> windows, shipping thresholds) were each confirmed in indexed page content but vendor terms drift —
> re-verify before publishing any figure on our own site.

---

## 0. TL;DR — the 10 patterns the leaders share

1. **WYSIWYG is the trust backbone.** The best vendors photograph *each individual frag* ("what you
   see is what you ship"), shot under controlled lighting — often **both blue/actinic AND white
   light** to defuse the community's well-documented distrust of saturation-boosted actinic-only
   photos. This maps 1:1 onto our invariant *"no item `available` without a photo."*
2. **Tiered/labeled inventory.** WWC's SI / Vic's Picks / Live Sale / WYSIWYG / Outlet tiers each
   carry their own pricing + guarantee rules — a direct precedent for our plug/rack-tag + review →
   go-live model.
3. **Structured per-species care metadata.** LiveAquaria's "Quick Stats" (care level, temperament,
   reef-compat, lighting/flow/placement, diet, water, max size, min tank) is the single most
   copy-worthy feature. We already store most of this in `inventory_items.attrs`.
4. **Dark canvas, coral as the only color.** Near-black/charcoal UI so blue-lit fluorescent coral
   photography "bleeds into" the page instead of sitting in white boxes.
5. **Care-guide SEO library.** Per-genus/species evergreen guides (Tidal Gardens, LiveAquaria
   Education Center, BRStv) that rank for "[species] care" and funnel into live stock.
6. **Live-sale / drop cadence as a merchandising engine.** Fixed weekly drops ("Sunday WYSIWYG"),
   timed photo drops every 10–30 min, daily 6pm refresh — freshness *is* the content.
7. **Live Arrival Guarantee is table stakes** — tight photo window (**2 hours** is the premium
   norm), **store credit not cash**, tiered durations, photo-on-white protocol.
8. **Overnight single-carrier + free-over-threshold shipping** (free over ~$200–$300, flat rate
   under), with packaging sold as a trust feature (heat packs, insulated boxes).
9. **Loyalty: points and/or credit-membership.** WWC Rewards (1pt/$1, 500=$50, 1yr expiry) is the
   reference points program; Top Shelf "Build Your Reef" ($99/$199/$299 monthly credit tiers,
   rollover) is the reference subscription model. **We already have `loyalty_ledger` +
   `loyalty_config` ("Reef Credit").**
10. **Wishlist + restock/price-drop alerts are unusually high-value** because WYSIWYG inventory is
    one-of-one — the item sells once, so "notify me" is the core retention hook.

---

## 1. Platform landscape

Almost the entire category runs on **Shopify** (WWC, Unique, Cherry, Top Shelf, Aquatic Collection,
Battlecorals, Vivid). Two notable legacy exceptions: **Tidal Gardens** (Magento / custom `.html`)
and **LiveAquaria** (Adobe ColdFusion `.cfm`, partially re-platformed). Implication: the bar for
"looks like a real store" is a clean modern Shopify theme — **which we can match or beat with our own
TanStack + Tailwind v4 + shadcn stack**, since the category's differentiation is photography +
WYSIWYG discipline + content, *not* bespoke storefront tech. Live auctions are the one place real
custom tech appears (see §5).

---

## 2. Information architecture (the consensus sitemap)

Every leader converges on a similar tree. Two organizing axes appear, usually both at once:

- **By taxonomy/genus:** Corals → SPS / Acropora / LPS / Euphyllia (Hammers, Torches) / Zoanthids /
  Mushrooms / Softies / Anemones; then Fish (by family), Inverts, Live Rock, Dry Goods/Supplies.
- **By "line"/tier:** WYSIWYG (one-of-one) vs. stock/representative frags vs. frag packs vs.
  colonies vs. sale/outlet, plus the Live Sale / Auction surface.

**Recommended consensus sitemap for The Fish Tank (marketing → live-sale ready):**

```
Home
Livestock / Shop  (= our existing public catalog, expanded)
  ├─ Corals → SPS · LPS · Euphyllia · Zoas · Softies · Anemones
  ├─ Fish → by family
  ├─ Inverts · Live Rock
  ├─ WYSIWYG (filter/badge across the above)
  └─ Dry Goods / Supplies
Care Guides / Learn   (per-species + how-to; the SEO engine)
Live Sales & Events   (calendar now; live drops/auctions Phase 4+)
Services              (maintenance, custom builds, quarantine, trade-in)
About / The Shop      (story, team, location, hours, gallery)
Visit / Contact       (map, hours, form, socials)
Account (Phase 4)     (login, wishlist, order history, Reef Credit, bids)
Guarantee · Shipping · FAQ   (trust pages — surfaced site-wide, not buried)
```

---

## 3. Per-leader notes (condensed)

### World Wide Corals (Shopify) — tiered inventory + live-sale hype
- IA layered by **genus collections AND product tier**: **SI** (Standard Inventory / aquacultured),
  **VP** (Vic's Picks, founder hand-picked one-of-ones), **LS** (Live Sale), **WYSIWYG**, **Outlet**.
- WYSIWYG = "each image is the exact frag," added in batch "updates" when a rack fills (mirrors our
  tank-by-tank plug-tag intake).
- **Live sale:** timed flash drops + Facebook/YouTube Live → standard Shopify cart, first-to-checkout
  wins. "Coral Maynia" etc. on dedicated event landing pages. No bidding, no cart hold.
- **WWC Rewards:** 1 pt/$1, 500 pts → $50 coupon (scales to 2000→$200), **expire after 1 year**,
  coral-frags-only redemption, non-transferable.
- **Guarantee:** 5-day DOA+survival on SI/VP/LS/WYSIWYG; arrive-alive only on inverts/outlet; **store
  credit**; must not remove coral from plug for 5 days or guarantee voids; FedEx Next-Day only.

### Tidal Gardens (Magento) — content + photography leader
- Care-taxonomy URL tree (`/corals/lps/chalice-corals-echinopora.html`) where each page is both shop
  + SEO landing page.
- **WYSIWYG photographed under two color temps + multiple angles** — directly addresses the
  blue-light color-shift trust gap.
- **Best-in-class structured care fields:** explicit **PAR bands (Low 30–50 / Med 50–150 / High
  150+), flow, feeding, acclimation**. Founder is a published author / podcaster (CORAL Magazine,
  BBC/Smithsonian credibility). Education is the brand's center of gravity.
- **Live sale:** YouTube-centric; each live item numbered (#5), add-to-cart → checkout; explicit
  rule *"having the coral in your cart DOES NOT reserve it."* "Add to existing order" consolidates
  shipping. Guarantee 7-day, case-by-case DOA, no returns; UPS Next Day $34.99 / free >$275.

### Top Shelf Aquatics (Shopify) — modern UX + subscription loyalty
- WYSIWYG / **Almost-WYSIWYG** split; weekly "Super Specials" up to ~70% off.
- **Live sale:** new WYSIWYG posted every ~10–15 min from noon, ~12 hours, Shopify cart.
- **Reefer Rewards** points (5 pts/$1, ~1yr expiry) **plus "Build Your Reef" credit-membership**
  ($99 Coral Cadet / $199 Marine Master / $299 Reefer Royalty per month; monthly credits to spend on
  a rotating catalog; **unused credits roll over**; shipping not included). The subscription model is
  the standout differentiator — recurring revenue from one-off buyers.
- **DOA within 2 hours** of FedEx delivery → replacement/credit; free overnight on supplies $399+.

### LiveAquaria (ColdFusion) — taxonomy + care-data + education moat
- Widest catalog (marine + freshwater + pond + supplies), deepest tree.
- **"Quick Stats" care-icon matrix** on every species page (care level, temperament, reef-compat,
  lighting/waterflow/placement, color form, diet, supplements, water conditions, max size, min tank,
  family, origin) + filters by difficulty/temperament/color/diet/price. **The template to emulate.**
- **Diver's Den** = WYSIWYG storefront, daily 5–6pm CT refresh, email-alert subscription, qty-1 =
  unique, first-to-checkout wins.
- **Education Center:** hundreds of categorized expert articles + acclimation guides = organic-search
  moat. Guarantee tiered 7-day (most) / 30-day for aquacultured (CCGC). **⚠ In bankruptcy/wind-down
  as of Nov 2025 — reference its IA/care-data, not its reliability.**

### Unique Corals & Cherry Corals (Shopify) — the live-sale/auction specialists
- Unique: "Reefing Transformed," WYSIWYG tag + filtered collection, **forum-driven flash drops**
  (~50 corals/30 min, FCFS cart links, **mandatory shipping module**), **UC Rewards** points.
- **Cherry Corals — the auction reference.** Two engines: **Live Sale** (forum link-per-coral, FCFS,
  10+ hrs, 1,000+ corals) AND a **native on-site Auctions** collection with **real bidding**:
  - $1 start, **no reserve**, **no proxy/auto-bid** (manual), one-tap "Quick Bid".
  - **Popcorn / anti-snipe:** a bid in the final minute extends **+2 minutes**, repeating until no
    last-second bids.
  - **Checkout within 2 days** of winning; **non-payment → banned from future auctions**.
  - Fulfillment: local pickup or buy a **shipping-module product** ($34.99 near / $49.99 far states);
    **$100 minimum shipped order**; UPS Next Day Air.

---

## 4. Trust & conversion template (the industry standard to match/beat)

| Element | Category norm | Notes |
|---|---|---|
| **DOA window** | **2 hours** (premium); 4h some; up to 72h for out-of-bag | Photo in-bag (unopened) AND out-of-bag, order # visible |
| **Remedy** | **Store credit**, rarely cash refund | Cherry/Reef Chasers credit-only; credit for livestock value, never shipping |
| **Guarantee length** | 24h (fragile SPS) → 5–7d (most) → 14d / 30d aquacultured (differentiators) | Pieces of the Ocean 14-day, LiveAquaria 30-day CCGC stand out |
| **Shipping** | Overnight single carrier; **free over ~$200–$300**, flat under (e.g. $39–$45) | Packaging (heat/cool packs, 1.5" styro) sold as a trust feature |
| **Reviews** | Judge.me / Yotpo widgets, "Verified Buyer" badges, UGC photos | Shopify-standard |
| **Press / "as seen on"** | **Reef Builders** coverage = category trust badge | Plus Reef2Reef sponsor sub-forum presence |
| **Conversion engine** | Timed live-sale drops + one-of-one scarcity | Cadence (weekly Sunday drop) trains demand |

**Community caveat worth heeding:** a polished site is *not* sufficient for trust — respected sellers
run plain sites; reputation + customer service + honest photography outweigh chrome. So: **nail the
dark-canvas + honest WYSIWYG photography + a crisp guarantee first; visual polish second.**

---

## 5. Live-auction / live-sale UX (the future scaling goal)

There are **two fundamentally different mechanics** — pick deliberately (this is a data-model
decision, not just UX). See `scope-public-website-data-schemas.md` §"Live sale / auctions (Phase 4+)"
for the proposed tables.

**Model A — "Live Sale" = first-to-checkout drop (NOT an auction).** Dominant model. Fixed price;
the "live" element is scarcity + timing. Timed WYSIWYG photo drops, each with a buy link; **add-to-
cart reserves nothing — first to complete checkout wins**; conflict → website-first honored, loser
auto-refunded. Shipping via prepaid **module** (calendar slot) or **pay-once-then-combine**. Purchase
caps spread inventory; all sales final. **Make-or-break = checkout speed** (express pay, pre-saved
accounts). Simplest; Shopify-native; creates the "in my cart but I lost it" frustration.

**Model B — Real auctions (proxy/max bid).** CoralAuctions, Whitlyn, eBay, and Cherry's native
auctions. Proxy/max bid, quick-bid button, reserve vs. no-reserve, bid increments. **Integrity risk:
shill/bot bidding is a known category hazard → show transparent bid history.** Cherry's popcorn
+2-min anti-snipe is the community-expected close behavior.

**Model C — Livestream-auction (Whatnot) = the gold-standard hybrid.** Real-time bidding + video:
- **Standard auction** with soft-close (a bid in the last 10s resets timer to 10s); **Sudden-Death**
  option (hard zero); **pre-bids**; **secret max/proxy bid**.
- Mixed sale types in one stream: **Buy It Now**, **Flash Sale** (seconds-long discounted BIN),
  **Giveaways** (5-min, must be present, gateable to followers/buyers).
- **No cart** — each win is its own transaction; **Smart Bundling** consolidates a stream's wins into
  cheapest shipment post-sale; ship within 2 business days; payment + address saved before bidding.

**Model D — CommentSold (Facebook/IG Live "comment SOLD").** Comment a code+"sold" → auto-invoice via
Messenger → **waitlist** auto-adds on restock with pre-authorized payment. Common in apparel; rare in
coral (coral norm is link-in-thread). Note: **Facebook Marketplace bans live coral** — happens in
Groups/Live only.

**Recommendation for our roadmap:** start with **Model A (drop)** because it is the simplest layer
over the catalog we already have and reuses standard checkout; design the data model so a **Model B
timed-auction** (with soft-close + transparent bid history) can be added without reshaping the
inventory tables. Treat Whatnot/livestream as an external channel we *cross-promote* into, not
something to rebuild in v1.

---

## 6. Sources (key — all read via search; direct fetch 403-blocked)

WWC: worldwidecorals.com (/collections/wysiwyg, /collections/vics-picks, /pages/live-sale,
/pages/guarantee, /pages/rewards), wwc-help-center.gorgias.help · Tidal Gardens: tidalgardens.com
(/corals.html, /wysiwyg-corals.html, /live-sale.html, /articles/coral-care-articles/, /guarantee),
youtube.com/user/tidalgardens · Top Shelf: topshelfaquatics.com (/collections/wysiwyg-corals,
/pages/live-sale, /pages/reefer-rewards) + reefbuilders.com/2024/04/26 (Build Your Reef) · LiveAquaria:
liveaquaria.com (/divers-den, general.cfm?general_pagesid=489 Quick Stats, =176 Education Center,
/pages/compatibility-charts), help.liveaquaria.com, reefbuilders.com Nov-2025 closure coverage ·
Unique: uniquecorals.com (/collections/coral/wysiwyg, /collections/livesale, /pages/guarantee) ·
Cherry: cherrycorals.com (/collections/livesale, /collections/auctions, /products/shipping-box),
youtube.com/@CherryCorals · Aquatic Collection: aquaticcollection.com (/collections/wysiwyg/corals,
/pages/live-arrival-guarantee) · Aquatic Arts: aquaticarts.com (/pages/rewards-program,
/pages/live-arrival-guarantee) · Battlecorals: battlecorals.com/pages/shipping · Whatnot:
help.whatnot.com (start-auction, bidding, Smart Bundling) · CommentSold: help.commentsold.com ·
Trust/design: reef2reef.com ("What's in a Photo?", "Don't trust every image", best-vendor threads),
reefbuilders.com, bulkreefsupply.com/content (BRStv), judge.me, yotpo docs, coral-reef color-palette
design sources (media.io, filmora).
