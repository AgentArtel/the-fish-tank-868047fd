# The Reef Club — tailored loyalty program (synthesis + v1 scope)

> **Status:** SCOPING. Synthesizes `research-loyalty-psychology.md`, `research-loyalty-landscape.md`,
> `research-reef-loyalty-fit.md`, and the earlier `scope-loyalty-program.md` (backend mechanics).
> No code/schema applied yet. Claude Code, 2026-06-14.

## 0. The one-line thesis
**Don't sell points. Sell membership in a club, a collection to complete, status that's recognized,
and access nobody else gets.** Points/credit are the quiet backend that powers it — never the pitch.

All three research lenses converged on the same conclusion: a reef store should compete on
**status, access, belonging, and trust — not discounts.** Generic "5% back" points are what *every*
coral vendor already runs (Vivid, BRS, Top Shelf, Blue Reef…); they're table stakes, not a reason to
choose you. The store's real moats are **local presence, scarce live inventory, and the owner already
knowing regulars by name** — things online vendors can't copy. The program should *systematize* that.

---

## 1. Program identity: **The Reef Club**
A free club a customer *joins* (the enrollment moment matters — it's the "I'm part of this" hook).
Five pillars, each tied to a proven emotional driver:

| Pillar | Emotional driver | What the member gets |
|---|---|---|
| **Reefer Tiers** (status) | Status / identity / recognition | A named status that staff *see and acknowledge*; better perks as you climb. Status beats cashback emotionally (airline-elite research). |
| **Reef Passport** (collection) | The chase + the build | Collectible badges earned from what you've actually bought ("Acro Addict", "Zoa Garden", "Euphyllia Master"), with a perk on completing a set. **No one else has this.** |
| **Arrive-Alive** (trust) | Risk reduction | The DOA guarantee turned into a *named member perk* — human-approved replacement credit. The "I'll switch stores for this" hook. |
| **First Look** (access) | Scarcity / belonging | Members-only early access to WYSIWYG coral drops. Highest-impact, lowest-cost lever for a store with naturally scarce inventory — and the reward is *getting the good coral first*, not a discount. |
| **Reef Credit** (backbone) | Reciprocity / fairness | A quiet store-credit currency earned on every purchase (a % of spend), boosted by tier. The fair, tangible backbone — present, never the headline. Optional annual "reef dividend" ritual (REI-style). |

**Why this beats generic points:** points are abstract and delayed; *recognition, a collection, and
first dibs on rare coral* are immediate, identity-based, and specific to this hobby. We lead with
Passport + status + access; Reef Credit is the silent fairness layer underneath.

---

## 2. The honest hard part — redemption at the register
Earning is trivial and automatic (a function of the Clover sales we already ingest). **Redeeming is
the seam:** the member's balance lives in our workspace, but the discount has to be applied on the
*open order at the Clover register*, and we have **no real-time POS hook**.

**v1 redemption = manual, and that's fine to start:** the cashier opens the member in the workspace,
sees their balance + tier + perks, and applies a manual discount in Clover; we record a `redeem` row.
Crucially, **three of the five pillars (Passport, Tiers-recognition, First Look) deliver their value
*without* any register redemption at all** — which is exactly why we anchor v1 on them.

---

## 3. KISS v1 — the smallest build that feels valuable + exciting
Anchored on infra we already shipped (`customers`, `inventory_sale_events` with `customer_id`,
`classifyCoralType`). Build order within v1:

1. **Reef Credit ledger (backbone)** — earn rule: every synced Clover sale writes an `earn` ledger
   row (e.g. 5% of `total_cents` as credit) tied to the `inventory_sale_events` row (idempotent).
   Balance = sum of the member's ledger. *Needs a Lovable migration (§4).*
2. **Reefer Tiers (status)** — derived from rolling-12-month spend (we already have the ledger).
   ~3–4 named tiers; top tier ~5% of members. Higher tier = higher earn % + perks. Thresholds = owner's call.
3. **Reef Passport (collection)** — **derived entirely from existing data**, zero new capture: run
   `classifyCoralType` over each member's coral sales → badge per type at thresholds (e.g. 1 / 5 / 15
   of a type), plus "set complete" achievements. Pure app + UI; the differentiator, and it dodges the
   redemption seam completely.
4. **Arrive-Alive DOA credit** — an editor approves a replacement after the human decides (domain
   rule), writing a `doa` credit row linked to the original sale. Maps cleanly to the same ledger.
5. **Member view** — surface tier, balance, badges, and history on the existing `/customers/$id`
   page (a "Reef Club" card), plus admin actions to **add credit / record redemption** so the cashier
   workflow works on day one.

**First Look (early access)** is v1.5 — it's mostly an operational/comms play (tag a drop "members
first for 24h"); scope once the club has members. **Frag-Back** is a later rung (ops-heavy).

---

## 4. Data model — Lovable's lane (migration spec, ready on approval)
Badges and tiers are **derived** (no storage). Only the credit currency needs tables:

```sql
-- Single-row config (mirrors clover_connection / clover_credentials pattern)
CREATE TABLE public.loyalty_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  earn_percent numeric NOT NULL DEFAULT 5,          -- % of sale total earned as credit
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,          -- [{name, min_annual_cents, earn_multiplier, perks[]}]
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);

-- Credit ledger: balance = SUM(amount_cents) per customer. Never edited; only appended.
CREATE TABLE public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('earn','redeem','doa','bonus','adjust','expire')),
  amount_cents integer NOT NULL,                     -- + earns, − redemptions
  reason text,
  sale_event_id uuid REFERENCES public.inventory_sale_events(id) ON DELETE SET NULL,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_event_id, kind)                       -- idempotent earn per sale line
);
-- + RLS mirroring inventory_sale_events (editor select/insert; admin update/delete),
--   grants, and an index on (customer_id, created_at DESC).

-- Optional: explicit "joined the club" moment
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS reef_club_enrolled_at timestamptz;
```

Reuses the exact RLS helpers + single-row-config pattern already in the codebase.

## 5. App work — Claude's lane (after migration)
- **Earn on sync:** in `clover.ingest.server.ts`, after a sale event is written for a member, append
  an `earn` ledger row (idempotent via `UNIQUE(sale_event_id,'earn')`); backfill earns for existing
  member sales on the wide manual sync.
- **Derive tier + badges:** `loyalty.functions.ts` — compute tier from rolling spend; compute Passport
  badges via `classifyCoralType` over the member's sales. Pure read + compute.
- **UI:** a Reef Club card on `/customers/$id` (tier, balance, badges, progress to next), admin
  **Add credit / Record redemption / Approve DOA** actions, and a club-wide overview.
- Keep `getCloverOverview`/reports cache-keys invalidated on credit changes.

---

## 6. Possibilities scale (v1 → advanced)
S ≈ <½ day · M ≈ 1–2 days · L ≈ multi-day / needs sign-off.

| Rung | What | Effort | Why |
|---|---|---|---|
| **First Look early access** | Tag a drop "members get 24h first dibs"; notify members | S–M | Highest-impact low-cost lever; pure access, no redemption seam. |
| Annual reef dividend / birthday frag | Yearly credit drop or a free frag on tank-anniversary (`first_seen_at`) | S | REI/Sephora return-ritual; cheap, memorable. |
| Passport perks & "prestige" | Reward set-completion (free frag, badge flair); seasonal limited badges | M | Deepens the chase; identity flair. |
| Customer-facing portal / pass | Members see their own tier/badges/balance (link or wallet pass) | M–L | Turns recognition into something they show off; social proof. |
| SMS/email re-engagement | Win-back lapsed members; "your acro tier is close" nudges | M | Needs `marketing_consent` (already captured) + a provider. |
| Frag-Back circular credit | Trade grown-out frags for store credit | M–L | Strong community hook; ops-heavy (grading/intake). |
| Referrals | Member refers a friend → both get credit | M | Belonging + acquisition. |
| Real POS redemption | Write the discount to the open Clover order via API | L | Removes the manual seam; needs a real-time hook — deferred. |
| Named-lineage badges ("WWC Acro") | Badge by coral *lineage*, not just type | L | Needs lineage/vendor tagging we don't capture yet. |

---

## 7. Open questions for the owner (these set the economics)
1. **Earn rate & currency:** start at ~5% back as Reef Credit (store credit in $)? Or a different %?
2. **Tier names & thresholds:** how many tiers, what annual-spend cutoffs, and what perk per tier
   (earn multiplier, DOA window, free water testing, First Look window)? Names should feel reef-y.
3. **DOA terms:** what qualifies, what window, proof required (photo?), credit vs. replacement?
4. **Redemption rules:** min balance to redeem, max % of a sale, any exclusions?
5. **Enrollment:** auto-enroll anyone who gives info, or an explicit "join the Reef Club" opt-in?
6. **Credit expiry:** none (best for trust) or a long window? (Research: avoid expiry pressure.)
