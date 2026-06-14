# Research — Reef-Loyalty Fit: Rewards That Match a Reef-Keeper's Brain

> **Status:** RESEARCH / CONCEPTS ONLY. No schema, no SQL, no code, no PR. Claude Code, 2026-06-14.
> This is upstream of `.lovable/scope-loyalty-program.md` (the *how-to-build* / ledger spec) and
> `.lovable/scope-customer-profiles.md` (the *who-bought* keystone). Those two own the mechanics and
> the POS-redemption constraint; **this doc owns the "what would actually delight a reef keeper"**
> and ties each concept to data we already capture.
> **DB changes are Lovable's lane** — anything here that implies a new column/table is a *spec to
> hand off*, never dashboard SQL (CLAUDE.md). Loyalty is a **later phase** vs. the North Star
> (organizing coral inventory) — this is direction for the sign-off conversation, not a build order.

---

## 0. Why generic points are wrong for this store

A coffee punch card rewards *frequency of identical small purchases*. A reef keeper is the opposite
customer: **mid-frequency, wildly variable basket** (a $20 zoa frag one week, a $350 WYSIWYG acro
colony the next), and — more importantly — **emotionally invested in the thing itself**, not the
discount. Reef keeping is described by long-time hobbyists as a "primordial urge" to recreate the
reef at home, paired with a caretaker's sense of responsibility for living animals
([Reef2Reef essay on the psychology of reefing](https://www.reef2reef.com/ams/an-essay-the-psychology-of-reefing.710/)).
You don't keep a reef; you *build* one over years of "boring, consistent small tasks"
([Bulk Reef Supply](https://www.bulkreefsupply.com/content/post/saltwater-aquarium-beginners-guide-episode-8)),
and you collect named, lineage'd specimens as a kind of living trophy case
([Reef2Reef: collector vs keeper](https://www.reef2reef.com/threads/are-you-a-coral-collector-or-keeper.964557/)).

So the five emotional levers a reef-tailored program should pull are:

| Lever | What it is in this hobby | Source |
|---|---|---|
| **Chase** | Hunting rare/named/WYSIWYG one-of-one corals; limited "Collector Edition" frags; the drop. | [Reef Chasers WYSIWYG colonies](https://reefchasers.com/collections/wysiwyg-coral-colonies), [Cornbred rare corals](https://cornbredcorals.com/) |
| **Build** | The multi-year tank project; weekly cadence of testing/dosing/water changes; coming back for "the next piece." | [BRS weekly routine](https://www.bulkreefsupply.com/content/post/saltwater-aquarium-beginners-guide-episode-8), [SaltyIQ schedule](https://www.saltyiq.com/articles/reef-tank-maintenance-schedule) |
| **Status** | Tank-of-the-month clout; showing off a named-lineage collection; social proof on R2R/Instagram. | [R2R Reef of the Month](https://www.reef2reef.com/tags/reef-of-the-month/) |
| **Belonging** | Reef clubs, frag swaps, "we all freely trade frags"; the LFS as a community hub. | [BAR frag swap](https://www.bareefers.org/forum/threads/how-does-a-bar-frag-swap-work.17917/), [reefs.com frag swaps](https://reefs.com/magazine/coral-restoration/) |
| **Risk-reduction** | Livestock dies; DOA/arrive-alive guarantees are table stakes online; the fear of losing a $300 colony. | [Reef Pro Arrive Alive](https://reefprostore.com/blogs/news/arrive-alive-guarantee), [Corals Anonymous DOA](https://coralsanonymous.com/pages/dead-on-arrival-policy-and-shipping-protection-info) |

The named-lineage culture is the single most "reef-specific" lever: corals like "Heart of the Ocean"
acros sell for **$275–$425 a frag purely on provenance** — who named it and who it descends from
([R2R: what is WWC/RRC/ARC](https://www.reef2reef.com/threads/coral-naming-what-is-wwc-rrc-arc-etc.981684/),
[HOTO listing](https://www.reef2reef.com/threads/hoto-heart-of-the-ocean.1160369/)). A reef keeper
*already thinks in collections and lineages*. Our app already classifies every coral sale by type
(`classifyCoralType`). That overlap is the gift: **we can reflect a customer's collection back to
them**, which no generic points engine does.

---

## 1. The data we can actually build on (grounding)

Confirmed in-repo, so every concept below is buildable on real fields, not wishes:

- **Per-line sale ledger** — `inventory_sale_events`: `qty`, `total_cents`, `kind` (`sale`/`refund`),
  `clover_item_name`, `sold_at`, and now **`customer_id`** (`src/lib/clover.ingest.server.ts`
  upserts the Clover customer and stamps it on each line; backfills on re-sync). This is an
  append-only, already-running event stream — earning is a pure function over it.
- **Coral-type classifier** — `classifyCoralType(title)` in `src/lib/coral-type.ts` maps a line-item
  name → `acro` / `monti` / `zoa` / `chalice` / `euphyllia` / `acan` / `brain` / `goni` / `mushroom`
  / `leather` / `duncan` / `clam` / `anemone` / etc. Already used by `getCoralSalesByType`
  (`src/lib/ops.functions.ts`). **This is the engine that turns a sales row into a "collection."**
- **Customer profile** — `customers` table (`src/integrations/supabase/types.ts:309`):
  `first_name`, `last_name`, `email`, `phone`, **`first_seen_at`**, `last_seen_at`,
  **`marketing_consent`** (explicit, never inferred), `notes`.
- **Catalog item facts** — `inventory_items`: `item_type` enum, `retail_price`, photos (and the
  invariant that nothing is `available` without a photo).
- **The hard constraint (from `scope-loyalty-program.md` §1):** sales *and redemptions* happen at
  the **Clover register**; our workspace is the source of truth but has **no real-time POS hook**
  (pull-only, poll/webhook-after-the-fact). So redemption realistically = **cashier looks up balance
  in the workspace, applies a manual discount on the Clover order, we record it.** Every concept
  below is designed to *earn automatically from the ledger* and *redeem through that one manual seam*
  — or to deliver value with **no register transaction at all** (status, early access, anniversary
  emails), which sidesteps the seam entirely.

---

## 2. Program Concept Seeds

Six seeds, each tied to the levers above and to real fields. Effort: **S** ≈ <½ day app code on top
of the v1 ledger, **M** ≈ 1–2 days, **L** ≈ multi-day / multi-lane. "New data" = anything not
already captured that Lovable would need to add (a spec, never dashboard SQL).

---

### Seed A — "The Reef Passport" (coral-collector achievements)
**Lever: Chase + Status + Build.** The flagship reef-specific idea.

**Frame.** A digital collection page per customer that fills in as they buy — a *living trophy case*
of the coral families they own from the store. Reef keepers already self-identify as collectors of
types and lineages; we mirror that identity back at them.

**Mechanic / how it earns.** Run each customer's `inventory_sale_events` line names through
`classifyCoralType()`. Award **badges / "stamps"** for milestones the hobby actually celebrates:
- *Type badges* — "Acro Keeper" (first acro), "SPS Specialist" (5+ distinct acro/monti buys),
  "Zoa Garden" (10+ zoa frags), "Euphyllia Wall," "Chalice Collector."
- *Breadth badge* — "Full Reef" / "Mixed-Reef Master" for owning N distinct coral types (taps the
  "diversity over a gallery of high-end pieces" keeper identity from R2R).
- *Build-tenure badge* — "Founding Reefer" from `first_seen_at` (see Seed C).

**What they get.** Status first (the badge wall itself, shareable), *plus* small concrete unlocks:
hitting a badge drops a **bonus store-credit** `earn` row, or unlocks a type-specific perk ("Acro
Keeper → early ping on the next acro drop," ties to Seed D). The reward is mostly the *recognition* —
which is exactly what the hobby's tank-of-the-month culture shows people will chase
([R2R Reef of the Month](https://www.reef2reef.com/tags/reef-of-the-month/)).

**Uses our data.** Purely `classifyCoralType` over `inventory_sale_events` grouped by `customer_id`.
We already wrote this aggregation shape in `getCoralSalesByType`; this is the same query pivoted by
customer. **Zero new register behavior.**

**Beats generic points / fits POS.** A point balance is a number; a *collection* is identity and
bragging rights — far stickier and totally on-culture. And because most of the value is the badge
wall (digital, in our workspace/portal), **it needs no register redemption at all**; the optional
bonus credit rides the existing manual-discount seam.

**Build:** **M.** Classifier exists; need badge-rule definitions + a collection view.
**New data needed:** none for v1 (badge thresholds live in config). To get *lineage*-level badges
("WWC Acro," named morphs) we'd need a `lineage`/`vendor` tag on items — **not captured today**
(`clover_item_name` is free text); a stretch, not v1.

---

### Seed B — "Arrive-Alive / Reef Reassurance Credit" (DOA replacement)
**Lever: Risk-reduction.** The most *trust-building*, most reef-specific safety-net.

**Frame.** Livestock dies — DOA and "lost it in the first 48h" is the universal reef anxiety, and
arrive-alive guarantees are table stakes for online vendors
([Reef Pro](https://reefprostore.com/blogs/news/arrive-alive-guarantee),
[Essential Reef DOA](https://essentialreef.com/pages/refund-doa-policy)). A local store can turn that
fear into loyalty: **"buy your corals here and you're covered."**

**Mechanic / how it earns.** Not earned by spend — it's a **membership benefit**. A member who buys a
coral and reports it dead within a defined window (e.g. 7–14 days, with a photo, mirroring vendor DOA
windows) gets a **store-credit `adjust` row** for some/all of the price. Tie eligibility to the
original sale row so it's auditable.

**Uses our data.** The DOA claim references the exact `inventory_sale_events` row (we have
`total_cents`, `clover_item_name`, `sold_at`, `customer_id`) → the credit amount and window are
computed from real purchase facts. Admin-resolved, consistent with the existing "human reviews
refunds, no auto-reverse" stance.

**Beats generic points / fits POS.** This is the one reward a reef keeper would *switch stores for*.
It maps cleanly onto our model: the credit is just a positive ledger `adjust` row, redeemed later
through the normal cashier-lookup + manual-discount seam. No real-time POS coupling.

**Build:** **M.** A claim form + admin approval + an `adjust` ledger row. Honors the invariant that
**a human decides** (no auto-credit).
**New data needed:** a tiny `loyalty_claims` table (sale_event_id, photo, status, decided_by) — spec
for Lovable. **Owner policy call:** the DOA window + % covered + whether it's members-only (it
should be — that's the loyalty hook).

---

### Seed C — "Tank Anniversary / Founding Reefer" (tenure perk)
**Lever: Build + Belonging.** Cheap goodwill that respects the multi-year-build identity.

**Frame.** A reef is a years-long project; the store has been part of that build. Celebrate the
relationship's anniversary, not just spend.

**Mechanic / how it earns.** From **`customers.first_seen_at`**, a scheduled pass drops an
**anniversary bonus-credit `earn` row** each year ("Happy 2nd reef-versary — here's $X"), delivered
by email if `marketing_consent`. Optionally tier the gift by how long they've been a customer
("Founding Reefer" badge for the earliest cohort — ties to Seed A's tenure badge).

**Uses our data.** `first_seen_at` + a cron + `marketing_consent` (all present in `customers`). The
email is the delivery; the credit is a ledger row.

**Beats generic points / fits POS.** It manufactures a *reason to come back this month* — a known
retention lever — and it's emotional ("you've kept your reef alive 3 years") rather than
transactional. Redemption is the usual manual seam, but the *trigger* is free and automatic.

**Build:** **S** for the credit + badge; **M** if it sends email (needs a provider + consent gate,
already flagged as rung R6 in `scope-loyalty-program.md`).
**New data needed:** none (date + consent exist). Email channel is the only add.

---

### Seed D — "WYSIWYG Drop — Members' Early Access" (the chase, gated)
**Lever: Chase + Status.** Turns the hobby's strongest pull into a membership benefit.

**Frame.** The most exciting reef purchases are **one-of-one WYSIWYG colonies and limited Collector
Edition frags** — when they drop, they're gone ([Reef Chasers](https://reefchasers.com/collections/wysiwyg-coral-colonies),
[Cornbred](https://cornbredcorals.com/)). Give members **first crack** — a head start or a hold
window on new high-value pieces.

**Mechanic / how it earns.** Status-tier (or any active member) → an **early-access notification** on
new WYSIWYG/limited items, or a 24h "members can reserve" window before public catalog go-live.
"Early access" can be *type-targeted* using Seed A's affinity: only the acro collectors get pinged on
the acro drop — far higher signal than a blast.

**Uses our data.** New WYSIWYG items already flow through the **review → go-live** path (the current
North Star) and carry `item_type`, `retail_price`, and a photo (the no-photo-no-`available`
invariant guarantees the drop has an image to show). Targeting reuses per-customer coral-type
affinity from `classifyCoralType`. The "members-only" gate reuses the public `/catalog` surface with
a member/early window.

**Beats generic points / fits POS.** **No discount at all** — so it completely sidesteps the
redemption seam. The reward is *access and timing*, which for a chaser is more valuable than 5% off.
It also drives margin (full price on the hottest items) rather than eroding it.

**Build:** **M–L.** Needs a notification channel (email/SMS, R6) + a "members-early" state or
timed-visibility on items. **Architecture caution:** anything touching catalog go-live visibility is
a routing/visibility change — **needs sign-off** per CLAUDE.md rule #2.
**New data needed:** an `is_member_early` / early-access-until field on items (spec for Lovable) +
the delivery channel.

---

### Seed E — "Frag-Back Circular Credit" (grow-out / trade-in store credit)
**Lever: Belonging + Build.** Encodes frag-swap culture into a store-credit loop.

**Frame.** Reef keepers prune colonies and trade the cuttings; frag swaps are a core community ritual
and a form of "coral insurance" — the same coral survives across many tanks
([BAR](https://www.bareefers.org/forum/threads/how-does-a-bar-frag-swap-work.17917/),
[reefs.com](https://reefs.com/magazine/coral-restoration/)). Let customers **bring frags back** of
corals they originally bought here, for store credit — closing a circular economy the store can then
re-sell.

**Mechanic / how it earns.** Customer brings in a frag → staff records a **trade-in `adjust` credit**
against their profile. If the frag descends from an item they bought here, we can *verify* against
their history and even reflect it on their Reef Passport ("you fragged back your JF Acro").

**Uses our data.** The trade-in can be matched to the customer's `inventory_sale_events` history
(did they buy this type/name here?). The classifier tags what came back, feeding stocking insight.

**Beats generic points / fits POS.** It's a *reef-native* behavior no coffee shop has, and it
generates resellable inventory. **POS fit:** trade-in credit is just a positive ledger row applied as
a manual discount later — same seam.
**Caveat / honesty:** this leans hardest on **manual staff entry** (someone has to receive and value
the frag) and on the store *wanting* used frags. It's the most operationally heavy seed.

**Build:** **M** (a trade-in entry screen + `adjust` row); **L** if you verify lineage against
purchase history and feed it into inventory.
**New data needed:** a `trade_ins` record (customer, frag description/type, value, staff) — spec for
Lovable. **Owner call:** does the store actually want to take frags back?

---

### Seed F — "Reefer Tiers — Bronze / Silver / Gold (Reef Royalty)" (status by spend)
**Lever: Status.** The conventional backbone — but framed for the hobby and feeding the others.

**Frame.** Recognize the whales — the big-colony buyers — with named status, not just a higher
percent. Status itself is the reward (the hobby runs on tank-of-the-month clout).

**Mechanic / how it earns.** Trailing-12-month spend from `inventory_sale_events` (`SUM(total_cents)
WHERE kind='sale'` per `customer_id`) → tier. Higher tiers get: a better earn rate, **Seed D early
access**, a bigger **Seed B DOA window**, a free coffee/drip-acclimation kit — and a badge.

**Uses our data.** Pure aggregation over the ledger we already ingest — exactly rung R1 in
`scope-loyalty-program.md`. No new capture.

**Beats generic points / fits POS.** Tiers are the *multiplier* that makes A/B/C/D feel exclusive
rather than universal. Tier status needs **no register transaction** to confer (it's recognition +
unlocks); only the earn-rate bump touches the redemption seam.

**Build:** **S–M.** A spend rollup + tier thresholds in `loyalty_config`.
**New data needed:** none.

---

## 3. Recommendation — what to anchor a KISS v1 around

**Anchor on two, both of which run almost entirely off data we already have and largely dodge the
redemption seam:**

1. **Seed A — The Reef Passport (coral-collector achievements).** *This is the differentiator.* It is
   the one idea that is impossible without our specific data (`classifyCoralType` over
   per-customer `inventory_sale_events`) and impossible for a generic Clover/marketplace loyalty app
   to replicate. Most of its value is *recognition*, which is delivered in-app — **no register
   redemption needed**, so it ships value even before the manual-discount workflow is polished. It
   directly taps the chase/collector/status psychology that defines reef keepers. Build: **M**, no
   new schema for v1.

2. **Seed B — Arrive-Alive / Reef Reassurance Credit (DOA).** *This is the loyalty hook* — the
   benefit a reef keeper would change stores for, and it maps cleanly onto the planned credit ledger
   (a human-approved `adjust` row, consistent with the "AI/auto never decides, a human does"
   invariant). Build: **M**, one small `loyalty_claims` table to spec for Lovable.

**Why this pair as v1:** together they cover the two most reef-specific levers (chase/status via the
Passport, risk-reduction via DOA), they sit on the **existing ledger + classifier with essentially no
new capture**, and they minimize exposure to the program's one weak point — the cashier-lookup +
manual-Clover-discount redemption seam (`scope-loyalty-program.md` §2.4, §4). **Seed F (tiers)** is
the natural cheap third add (pure spend rollup, **S–M**) that makes A and B feel exclusive. **Seeds C,
D, E** are strong but each needs an extra dependency (email channel / catalog-visibility sign-off /
manual trade-in ops) and are better as the next phase.

**Sequencing reality (unchanged from the scopes):** none of this earns until a sale is tied to a
customer — `customer_id` capture (`scope-customer-profiles.md`) is the keystone, and loyalty is a
**later phase** than the current coral-inventory North Star. This doc is for the sign-off
conversation, not a build order. Anything implying a new column/table above is a **spec for Lovable's
lane**, never dashboard SQL.

---

## Sources

**Reef-keeper psychology & culture**
- Psychology of reefing (essay): https://www.reef2reef.com/ams/an-essay-the-psychology-of-reefing.710/
- Collector vs. keeper identity: https://www.reef2reef.com/threads/are-you-a-coral-collector-or-keeper.964557/
- WYSIWYG / Collector Edition chase: https://reefchasers.com/collections/wysiwyg-coral-colonies , https://cornbredcorals.com/
- Named lineage & premium pricing (WWC/JF/HOTO): https://www.reef2reef.com/threads/coral-naming-what-is-wwc-rrc-arc-etc.981684/ , https://www.reef2reef.com/threads/hoto-heart-of-the-ocean.1160369/ , https://krakencorals.co.uk/blog/don-t-get-caught-up-in-the-naming-hype
- Tank/Reef of the Month status & social sharing: https://www.reef2reef.com/tags/reef-of-the-month/

**Frag swaps / club / circular-economy culture**
- BAR frag swap mechanics: https://www.bareefers.org/forum/threads/how-does-a-bar-frag-swap-work.17917/
- Frag swaps as coral "insurance" / community: https://reefs.com/magazine/coral-restoration/ , https://forums.saltwaterfish.com/threads/frag-swaps-a-beginners-guide.212878/

**DOA / arrive-alive (risk-reduction)**
- Reef Pro Arrive Alive: https://reefprostore.com/blogs/news/arrive-alive-guarantee
- Corals Anonymous DOA + windows: https://coralsanonymous.com/pages/dead-on-arrival-policy-and-shipping-protection-info
- Essential Reef refund/DOA: https://essentialreef.com/pages/refund-doa-policy

**Weekly cadence / multi-year build**
- BRS weekly water-change routine: https://www.bulkreefsupply.com/content/post/saltwater-aquarium-beginners-guide-episode-8
- SaltyIQ maintenance schedule: https://www.saltyiq.com/articles/reef-tank-maintenance-schedule

**In-repo grounding (data we build on)**
- `src/lib/coral-type.ts` (`classifyCoralType`) · `src/lib/clover.ingest.server.ts` (customer capture + sale ledger)
- `src/lib/ops.functions.ts` (`getCoralSalesByType`, `applyInventorySale`) · `src/integrations/supabase/types.ts` (`customers`, `inventory_items`)
- `.lovable/scope-loyalty-program.md` (ledger spec + POS-redemption constraint) · `.lovable/scope-customer-profiles.md` (customer keystone)
