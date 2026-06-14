# Scope — Customer Loyalty Program (SCOPING / DESIGN ONLY)

> **Status:** RESEARCH / SCOPING ONLY. No schema applied, no SQL run, no features built, no PR.
> Claude Code, 2026-06-14.
> **DB changes are Lovable's lane** — every table/RLS/index below is a **spec**, never dashboard SQL
> (CLAUDE.md "DB changes are Lovable's lane"; WORKFLOW.md Golden Rule #1).
> **Hard dependency:** this program sits **on top of customer identity**. A companion effort
> (`.lovable/scope-customer-profiles.md`, assumed coming) must capture **which customer** made each
> sale. Until a sale can be tied to a customer, none of this earns points. **Sequence customer
> profiles first.**
> **Parked-scope note:** Clover POS sync is listed **parked** in `REALITY_MAP.md:29/37`. This doc is
> *for* the sign-off conversation, not a license to build. Loyalty is a **later phase** vs. the
> current North Star (organizing the coral inventory) — direction, not scope, until the owner
> un-parks it.

---

## 1. Problem, opportunity, and the hard constraint

**Opportunity.** The shop now ingests every paid Clover sale into `inventory_sale_events`
(`src/lib/clover.ingest.server.ts`, `supabase/migrations/20260613201503_*.sql`). Once we also know
*who* bought (customer profiles), we have a clean, already-running event stream to compute loyalty
from — no double-entry, no new capture flow at the register. A coral store has exactly the customer
profile loyalty rewards: enthusiast hobbyists, high emotional attachment, repeat visits, and a
small enough base that the owner often knows regulars by name. Retention and "come back for the new
frags" are real revenue levers.

**The hard constraint (be honest up front): redemption happens at the POS, and our ledger lives in
the workspace.** Earning is easy — we already have the sale events; we just total them per customer.
**Redeeming is the hard part.** When a customer says "use my points," that has to turn into a real
discount **on the open order at the Clover register**, and our points balance lives in Supabase, not
in Clover. There are only three honest ways to bridge that gap:

1. **Manual cashier discount (KISS, recommended for v1).** Cashier looks up the customer's balance
   in the workspace (phone/name), reads "$15 reward available," and applies a **manual discount** on
   the Clover register the normal way (Clover Register supports order- or line-level discounts at
   checkout — see Sources). We then mark the reward redeemed in our ledger. No Clover write needed.
2. **API-write the discount onto the open order.** Clover's REST API *can* POST a discount to an
   order/line item (`POST …/orders/{orderId}/line_items/{lineItemId}/discounts`, or order-level).
   But this requires knowing the **open, in-progress order id at the moment of checkout** and writing
   to it before the cashier tenders — a tight, race-prone, real-time coupling our current **pull-only,
   poll/webhook-after-the-fact** ingest does not have. This is genuinely hard and is **not** v1.
3. **Use Clover's own native Rewards / a Clover-marketplace loyalty app** (Clover Rewards, Marsello,
   My Rewards, bLoyal). These run *inside* Clover, so redemption "just works" at the register — but
   then the loyalty ledger lives in Clover/a third party, **not** in our workspace, which breaks
   "workspace = source of truth" and can't reuse our purchase-history data (coral-type affinity etc.).

**Recommendation:** start with **option 1** — a workspace-run ledger plus manual redemption at the
register. It delivers value with zero real-time POS coupling and keeps the ledger as our source of
truth. Revisit option 2 only if the manual step proves too painful, and only after a real-time order
hook exists. Keep option 3 (native Clover Rewards) on the table as the explicit **alternative** if
the owner decides the workspace doesn't need to own loyalty (see §4).

---

## 2. KISS FOUNDATION (v1)

**Recommended approach: a workspace-run points/credit ledger that *earns automatically* from the
sales we already ingest, and *redeems manually* at the register via cashier lookup.**

Why this and not a punch card or native Clover Rewards:
- **Points/store-credit fits the buying pattern.** Coral buyers are mid-frequency, variable basket
  size (a $20 frag vs. a $300 colony). Punch cards ("buy 10, get 1") reward *visits* and suit
  high-frequency, fixed-price purchases (coffee). For variable-value specialty retail, **points per
  dollar / store credit** rewards the behavior that actually matters — spend (see Sources: DataCandy,
  CardSource). A punch/visit model is the cheaper fallback if the owner wants the absolute simplest
  thing (§4).
- **Earn is free.** We already have `inventory_sale_events`. Points are a pure function of that
  stream once a customer is attached — no new register workflow, no extra cashier step on the
  *earning* side.
- **Workspace stays source of truth.** The ledger is ours, queryable, and can later drive
  affinity offers (reuse `src/lib/coral-type.ts`), tiers, win-back — none of which a Clover-native
  program would expose to us.

### 2.1 How points are computed (from the ledger we already ingest)

- **Earn rule:** `points = floor(total_cents / 100) * POINTS_PER_DOLLAR` for each
  `inventory_sale_events` row where `kind='sale'`, `status='applied'`, and the sale resolves to a
  customer. Default `POINTS_PER_DOLLAR = 1` (1 point per $1; rate is config, see Open Questions).
- **Value mapping:** keep it concrete for the cashier — e.g. **100 points = $5 store credit**
  (a 5% effective return, a common, sustainable specialty-retail rate). Or skip points entirely and
  accrue **store-credit cents directly** (see "credit-only" variant below) — even simpler to explain
  at the counter.
- **Refunds/voids:** a `kind='refund'`/`'void'` row (already flagged `needs_review` by the ingest)
  must **claw back** the points it originally granted. Mirror the existing "no auto-reverse, human
  reviews" stance from `handoff-clover-phase1.md` — points adjustment happens when an admin resolves
  the refund in review, not automatically.
- **The customer link is the whole dependency.** A sale earns **only** if it carries a
  `customer_id`. The customer-profiles effort decides *how* the register sale gets tied to a customer
  (Clover order's customer object via the orders expand, phone lookup, or a post-hoc match). Loyalty
  consumes that link; it does not invent it.

> **Credit-only variant (even more KISS):** drop "points" entirely. Each qualifying sale accrues
> **store-credit cents** at a flat rate (e.g. 5% of `total_cents`). The cashier sees "$X credit
> available," applies it as a discount, done. No point-to-dollar conversion to explain. Strongly
> consider this for v1 — it's the least to teach a cashier and a customer. The table below supports
> either by storing both a `points_delta` and a `credit_cents_delta`.

### 2.2 Ledger table design (Lovable migration spec — NOT applied)

A single append-only ledger of deltas (earn / redeem / adjust). Balance = `SUM(...)`. This mirrors
the existing event-ledger pattern (`inventory_sale_events`) and reuses the **same RLS helpers**
already in the codebase (`public.can_edit_content(auth.uid())`, `public.has_role(auth.uid(),'admin')`
— see `migrations/20260613201503_*.sql` and `migrations/20260614013906_*.sql`).

```sql
-- Depends on a customers table from the customer-profiles effort:
--   public.customers (id uuid pk, ...).  Loyalty references it; does not define it.

CREATE TABLE public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  -- What moved the balance:
  entry_type text NOT NULL CHECK (entry_type IN ('earn','redeem','adjust','expire')),
  points_delta integer NOT NULL DEFAULT 0,          -- + earn / - redeem (use this OR credit_cents)
  credit_cents_delta integer NOT NULL DEFAULT 0,    -- for the credit-only model
  -- Provenance (earn rows tie back to the sale we ingested):
  sale_event_id uuid REFERENCES public.inventory_sale_events(id) ON DELETE SET NULL,
  reason text,                                      -- "1pt/$ on order", "redeemed at register", etc.
  created_by uuid,                                  -- null = system/cron earn; set = admin manual adjust
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One earn row per sale event → idempotent re-runs of the earn pass:
  UNIQUE (sale_event_id, entry_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_ledger TO authenticated;
GRANT ALL ON public.loyalty_ledger TO service_role;
ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;

-- RLS mirrors inventory_sale_events exactly:
CREATE POLICY "Editors can view loyalty ledger"   ON public.loyalty_ledger
  FOR SELECT TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors can insert loyalty ledger" ON public.loyalty_ledger
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Admins can update loyalty ledger"  ON public.loyalty_ledger
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins can delete loyalty ledger"  ON public.loyalty_ledger
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX loyalty_ledger_customer_idx ON public.loyalty_ledger (customer_id, created_at DESC);
CREATE INDEX loyalty_ledger_sale_event_idx ON public.loyalty_ledger (sale_event_id);

-- Config (single row, admin-only) — point rate / redemption value live in DB, not hardcoded:
CREATE TABLE public.loyalty_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled boolean NOT NULL DEFAULT false,
  points_per_dollar numeric(6,2) NOT NULL DEFAULT 1,
  cents_per_point integer NOT NULL DEFAULT 5,        -- 100 pts = $5  → 5 cents/pt
  min_redeem_points integer NOT NULL DEFAULT 100,    -- can't redeem dribbles
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
-- RLS: admin-only select/insert/update (mirror clover_credentials in migration 20260614013906_*).
INSERT INTO public.loyalty_config (id) VALUES (true) ON CONFLICT DO NOTHING;
```

**Why a ledger, not a `balance` column:** append-only gives an auditable trail (earn → redeem →
adjust → claw-back), survives re-running the earn pass idempotently (`UNIQUE(sale_event_id,
entry_type)`), and matches how the rest of this codebase models history. Balance is a cheap
`SUM()` (optionally a `loyalty_balances` view per customer).

### 2.3 The earn path (Claude's lane — app code, when built)

- **Earn pass** runs *after* sales ingest. Reuse the existing pull pattern: the same
  `clover-poll` backstop / sync that already populates `inventory_sale_events` triggers an
  `accrueLoyaltyPoints(db)` pass that, for each new `applied` sale with a resolved `customer_id` and
  no existing earn row, inserts one `entry_type='earn'` ledger row. Idempotent via the unique key.
- **Server fns** follow the existing auth conventions in `src/lib/ops.functions.ts`:
  `requireEditor` for cashier-facing reads/redeem, **admin check for config + manual adjust**. All
  mutating fns check `is_active` + role (CLAUDE.md invariant).
- **Redeem fn** (`redeemLoyalty`, editor): given a customer + an amount, insert a negative `redeem`
  row, guarded by `min_redeem_points` and current balance. It records that a reward was used; the
  actual discount is applied **by the cashier on the Clover register** (option 1 above).

### 2.4 Simplest workable redemption at the register (realistic)

1. Customer at checkout gives name/phone. Cashier opens a **"Loyalty lookup"** screen in the
   workspace (mobile-friendly; the shop already deep-links staff via QR per REALITY_MAP).
2. Screen shows **"Balance: $15 store credit available."** Cashier taps **"Redeem $15."** → a
   `redeem` ledger row is written.
3. Cashier applies a **$15 manual discount on the Clover order** the normal Clover Register way and
   tenders. Done. No Clover API write, no real-time order coupling.

This is honest about the seam: **we don't push the discount into Clover; the cashier does, and we
record it.** It's one extra lookup-and-tap per redemption — acceptable for a small team, and the
only thing that's truly workable today.

### 2.5 Lovable migration needs (summary, separated per the lanes)

| Item | Lane | Notes |
|---|---|---|
| `loyalty_ledger` table + RLS + indexes | **Lovable** | RLS reuses `can_edit_content` / `has_role` already in the DB. FK to `customers` (from profiles effort). |
| `loyalty_config` table + RLS + seed row | **Lovable** | Admin-only, mirrors `clover_credentials` shape (`migration 20260614013906`). |
| `loyalty_balances` view (optional) | **Lovable** | `SUM` per customer for cheap reads. |
| Earn pass + redeem/adjust server fns + lookup UI | **Claude** | Reuse ingest trigger point + `requireEditor`/`isAdmin` from `ops.functions.ts`. |
| Point rate / redemption economics | **Owner** | Sign-off on §5 numbers before go-live. |

---

## 3. Possibilities scale (v1 → advanced)

Each rung is additive on the v1 ledger. **Effort S/M/L**, value, dependencies.

| Rung | What | Effort | Value | Depends on |
|---|---|---|---|---|
| **R1. Tiers / VIP** | Bronze/Silver/Gold by trailing-12-mo spend (derive from ledger/sale events); higher earn rate or perks per tier. | **S–M** | High — recognizes whales, the few big-colony buyers. | v1 ledger only. |
| **R2. Birthday / anniversary perk** | Bonus credit on signup-anniversary or birthday (a scheduled `earn` row). | **S** | Med — cheap goodwill, drives a visit. | Customer profile has the date; a cron pass. |
| **R3. Affinity offers ("you love acros")** | Target promos by purchase history. **Reuse `src/lib/coral-type.ts` `classifyCoralType()`** over each customer's bought line-item names to compute a per-customer coral-type affinity, then offer matching bonus points / a coupon. | **M** | High — this is the "better than anything before" lever; the classifier already exists. | v1 + sale events carry item names (they do: `clover_item_name`). |
| **R4. Win-back lapsed customers** | Flag customers with no `applied` sale in N days; auto-queue a "we miss you, here's $X" offer. | **M** | High — retention is the owner's stated goal. | v1 ledger + a "last seen" query + a delivery channel (R6). |
| **R5. Referrals** | Existing customer refers a friend → both earn after the friend's first sale. | **M** | Med — viral, but needs attribution at the register (cashier enters referrer). | v1 + customer profiles + a small referral table. |
| **R6. SMS / email integration** | Send balance nudges, birthday/win-back/affinity offers. "You're 40 pts from $5." Push notifications drive return visits (see Sources: stamp-card adoption data). | **M–L** | High multiplier on R2–R4 (offers are worthless undelivered). | A provider (Twilio/Resend/etc.) + consent capture + an outbox. |
| **R7. Customer-facing portal** | Customers self-check balance/history (extend the existing public `/catalog` surface, which is already an unauthenticated sanitized view). | **M–L** | Med — convenience, reduces cashier lookups. | v1 + a customer-auth or magic-link model (new). |
| **R8. Real-time POS discount write** | Auto-apply the reward to the **open Clover order** via API (`POST …/orders/{id}/discounts`) instead of manual cashier discount. | **L** | Med — removes the one manual step, but high complexity. | A **real-time order hook** (not today's after-the-fact poll) + open-order id at checkout. **Hard; revisit only if §2.4 hurts.** |
| **R9. Deeper Clover Rewards integration** | Mirror balances into Clover's native Rewards so redemption is native at the register. | **L** | Med | Accepting a second source of truth; reconciliation. Tension with "workspace = source of truth." |

---

## 4. Honest risks & alternatives

- **The redemption seam is the program's one weak point.** v1 leans on a cashier doing a lookup +
  a manual discount. If staff won't reliably do that, the ledger drifts from reality. **Mitigation:**
  make the lookup screen one tap, train on it, and accept that some redemptions get logged late. If
  it still fails, the honest pivot is **R8 (API order-write)** or **option 3 (native Clover
  Rewards)** — both heavier, both with their own costs.
- **Alternative A — Native Clover Rewards / marketplace app (bLoyal, Marsello, My Rewards).**
  Redemption "just works" at the register and there's no cashier lookup. **Cost:** the loyalty
  ledger lives in Clover/a third party (breaks "workspace = source of truth"), a monthly fee, and we
  **lose the purchase-history affinity play (R3)** that makes our version "better than before."
  Recommend this *only* if the owner decides the workspace doesn't need to own loyalty.
- **Alternative B — Punch / visit card (the simplest possible start).** "Buy N, get 1 free" or
  "10 visits = reward." Even simpler to explain than store credit and needs **no customer-profile
  spend math** — just a visit counter. **Cost:** rewards visits, not spend, so it under-rewards the
  big-colony buyers and over-rewards frequent small buyers; and it still needs *some* customer
  identity to track punches. **A reasonable v0** if customer profiles slip and the owner wants
  *something* live now; it can be migrated into the points ledger later (a punch = a fixed earn).
- **Dependency risk:** **none of this earns a point until a sale can be tied to a customer.** If the
  customer-profiles effort stalls, loyalty stalls. Don't build the ledger ahead of a working
  customer link — you'd have an empty table.
- **Economics risk:** generous point rates erode margin (baseline pricing is already 3× wholesale
  per CLAUDE.md). Pick a sustainable rate (~3–5% effective) and **make it admin-config, not
  hardcoded** (done — `loyalty_config`).
- **Domain-invariant alignment:** loyalty redemption is a **discount to a price** — pricing is
  **admin-controlled** in this product. Keep **rate/economics admin-only**; cashiers can *apply* a
  redemption within configured limits but cannot *change the rate*. Manual `adjust` rows are
  admin-only. This keeps the spirit of "pricing approval is admin-only."

---

## 5. Open questions for the owner

1. **Model:** points (100 pts = $X) or **store-credit-cents directly** (simpler to explain), or
   **punch/visit** as a v0? Recommendation: store-credit-cents.
2. **Earn rate & redemption value:** what effective return — 3%? 5%? (e.g. 1 pt/$1, 100 pts = $5 →
   5%.) What's the **minimum redeemable** balance?
3. **Enrollment:** how does a customer join — cashier captures phone at checkout? QR self-signup?
   opt-in required? (This is really a **customer-profiles** question; loyalty inherits it.)
4. **Redemption mechanics he'll accept:** is the **cashier-lookup + manual Clover discount** (§2.4)
   acceptable, or does he expect it auto-applied at the register (R8 — much harder)?
5. **Refund/claw-back policy:** auto-revoke points on a refund, or only when an admin resolves the
   refund review? (Recommend: on admin review, consistent with existing refund handling.)
6. **Tiers from day one or later?** (R1 is cheap but adds rules to teach.)
7. **Delivery channel:** does he want SMS/email nudges (R6)? That unlocks win-back/birthday/affinity
   but needs a provider + customer consent.
8. **Build vs. buy:** is owning loyalty in the workspace worth the cashier-lookup friction, or would
   he rather a **native Clover Rewards** app handle it (Alternative A)? This single answer decides
   whether we build §2 at all.

---

## Sources

- Clover native Rewards / points-per-dollar: https://www.loyaltypass.co/blog/industries/clover-loyalty-program ,
  https://help.marsello.com/en/articles/12837399-how-are-loyalty-points-awarded-in-clover-pos ,
  https://www.gomyrewards.com/clover-pos-rewards-program , https://bloyal.com/2023/01/best-clover-loyalty-program/
- Clover discounts via REST API + applying loyalty/discounts at the register:
  https://docs.clover.com/dev/docs/orders-faqs , https://community.clover.com/questions/2033/how-to-apply-discount-via-rest-api.html ,
  https://bypassmobile.zendesk.com/hc/en-us/articles/14095292302228-Using-Loyalty-Stored-Value-on-the-Register
- Loyalty model choice (points vs punch vs store credit) for small/specialty retail:
  https://datacandy.com/resources/dpoints-vs.-punch-cards-which-loyalty-model-works-best ,
  https://www.cardsource.com/news/loyalty-programs-reward-cards-know-your-options ,
  https://bonusqr.com/article/loyalty-card-ideas-for-small-business-that-actually-work
</content>
</invoke>
