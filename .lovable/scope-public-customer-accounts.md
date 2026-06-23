# Scope — Public customer accounts (Phase 4: login, wishlist, alerts, Reef Credit, bidding)

Date: 2026-06-23 · Author: Claude Code (scoping/design — no app code changed).
Status: **Phase 4 scoping — direction, not committed scope.** Larger lift than the rest of the
website packet (auth + RLS + edge functions). DB/auth/RLS parts are **Lovable's lane** — specced, not
applied. Companion: `scope-public-website.md`, `scope-public-website-data-schemas.md`,
`scope-customer-profiles.md` (internal CRM), `scope-loyalty-program.md` / `scope-store-credit.md`.

> **Key design decision: extend, don't fork.** We already have an **internal `customers`** table
> (CRM sourced from Clover sales — `scope-customer-profiles.md`, migration `20260614212319_*.sql`),
> plus a **Reef Credit** loyalty ledger (`loyalty_ledger` + `loyalty_config`, `20260614232445_*.sql`)
> and a **store-credit ledger** (`20260622181521_*.sql`). A public account should **link to that same
> customer record**, not create a parallel identity — so an in-store regular and their online login
> are one profile, and Reef Credit earned at the register shows up online. This is the whole payoff
> of the existing customer-capture keystone.

---

## 1. Why this is the biggest piece in the packet

Everything else in the website packet is a **sanitized read** of data staff already maintain. Public
accounts are different: they introduce **public auth, customer-writable data, and per-user RLS** — a
genuinely new security surface. The research (`research-public-website-competitors.md` §3) shows the
payoff is real:

- **Wishlist + restock/price-drop alerts are unusually high-value here** because WYSIWYG stock is
  one-of-one — "notify me" is the core retention hook the whole category leans on.
- **Loyalty drives repeat purchase** — WWC Rewards (points) and Top Shelf "Build Your Reef"
  (credit-membership) are the reference models. **We already have the Reef Credit ledger** to surface.
- **Bidding requires an identity** with a saved payment method + address before the auction (Whatnot
  pattern) — so accounts are a prerequisite for the Phase-4 auction goal.

---

## 2. Identity model — link auth users to the existing `customers` row

```
auth.users (Supabase Auth)
   └── customer_accounts            -- NEW bridge table (public profile + link)
         ├── customer_id  FK → customers.id   -- link to the EXISTING internal record
         └── (matched on verified email/phone, or created fresh if no match)
```

```sql
-- Lovable's lane — migration spec, NOT applied.
CREATE TABLE public.customer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id  uuid REFERENCES public.customers(id) ON DELETE SET NULL, -- link to internal CRM record
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- On signup, an edge fn matches the verified email/phone to an existing customers row
-- (reusing the dedupe/fuzzy-match approach noted in scope-customer-profiles.md rung 3); if none,
-- it creates a customers row (clover_customer_id NULL) so online + in-store unify into one profile.
```

**Auth:** Supabase Auth (email magic-link / OTP, optionally social). **Email/phone verification is
mandatory** before linking to a `customers` row — never match on an unverified address (account-
takeover / PII-leak risk). This reuses the same Supabase Auth already powering staff login, but
public accounts get the `authenticated` role with **customer-scoped RLS only** — they are NOT staff
and must never touch `requireEditor`/admin surfaces.

---

## 3. Customer-owned tables (per-user RLS: owner-only)

```sql
-- Wishlist (one-of-one inventory makes this high-value)
CREATE TABLE public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, inventory_item_id)
);

-- Stock / price-drop alerts (the category's core retention hook)
CREATE TABLE public.stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.customer_accounts(id) ON DELETE CASCADE,
  inventory_item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE, -- or a saved search
  saved_search jsonb,           -- optional: {type, category, price_max, ...} for "new SPS" alerts
  channel text NOT NULL DEFAULT 'email',  -- email | sms (sms gated on consent)
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**RLS pattern (owner-only):** every policy is `USING (account_id IN (SELECT id FROM customer_accounts
WHERE auth_user_id = auth.uid()))`. No editor/admin override needed for reads; staff visibility into a
customer's wishlist (if ever wanted) goes through the internal CRM, not these public policies.

**Alert delivery is an edge function** (external I/O — Rule 7): on inventory change (item back to
`available`, or `retail_price` drop), an edge fn matches `stock_alerts` and sends email/SMS. The public
site only **writes the alert row and reads its own**; it never sends mail itself. Wire the trigger to
the same place inventory availability flips (respecting the photo-on-file gate).

---

## 4. Reef Credit & store credit — surface, don't reinvent

The ledgers already exist. Public account shows **balances only**, computed server-side:

```ts
type PublicAccountSummary = {
  display_name: string;
  reef_credit_balance: number;     // SUM(loyalty_ledger.amount_cents) for this customer_id
  store_credit_balance: number;    // SUM(store_credit_ledger ...) for this customer_id
  member_since: string;            // customers.first_seen_at
  reef_club_enrolled: boolean;     // customers.reef_club_enrolled_at IS NOT NULL
  order_history: PublicOrderLine[];// from inventory_sale_events WHERE customer_id = me
};
```

- **Reads are owner-scoped via the `customer_accounts.customer_id` link**, exposed through a
  read-only edge fn or a SECURITY DEFINER view filtered by `auth.uid()` — never a raw join the anon
  role can widen. **No PII or other customers' rows ever reachable.**
- **Earning/spending stays server-authoritative.** Per the domain invariants, customers can *view*
  balances but **cannot mutate ledgers**; earn/redeem happens through the existing staff/POS-gated
  paths (and, for online orders later, an edge fn). Public write access to `loyalty_ledger` /
  `store_credit_ledger` is **forbidden**.
- **Online order history** reuses `inventory_sale_events` (already has nullable `customer_id`).

---

## 5. Bidding identity (Phase 4+ auctions)

Accounts are the prerequisite for Model B auctions (`research-...-competitors.md` §5,
`scope-public-website-data-schemas.md` §3.8). Requirements before a bid:

- Verified account + **saved payment method + shipping address** (Whatnot pattern — no time to enter
  mid-auction).
- A public **`bidder_handle`** (not real name) for transparent bid history (anti-shill).
- Bids write to `public_bids` via a **real-time edge function** that enforces increment, reserve,
  proxy/max, and **anti-snipe soft-close** — never client-trusted, never an app server fn.
- **Non-payment → disqualification** flag on the account (Cherry's 2-day-pay-or-ban rule).

Full auction mechanics belong in a future `scope-live-auctions.md`; this doc only establishes that the
**account is the identity anchor** for it.

---

## 6. Privacy / security posture (PII — strict)

- **Public accounts are `authenticated` with customer-scoped RLS only.** They must be structurally
  unable to reach any staff/editor/admin table, the internal CRM list, vendor data, costs, or other
  customers' rows. Audit every new policy for IDOR before go-live (WORKFLOW review gate).
- **Verification before linking** — never bind an account to a `customers` row on an unverified
  email/phone (prevents claiming someone else's purchase history + Reef Credit).
- **Marketing/SMS consent stays explicit** (reuse `customers.marketing_consent`); SMS alerts gated on
  it. A purchase or an account ≠ consent.
- **Right to be forgotten:** deleting an account `ON DELETE SET NULL`s the `customers` link
  (preserving anonymized sales integrity, matching `scope-customer-profiles.md`); provide a
  self-serve "delete my account" + an admin "forget customer" action.
- **No PII in logs or public projections.** Same posture as the AI-keys/`last_error` care.

---

## 7. Phased build (KISS → advanced)

| # | Rung | Effort | Notes |
|---|---|---|---|
| 0 | **Auth + `customer_accounts` bridge + email-verify → link to `customers`** | M | The keystone; nothing else works without identity. |
| 1 | **Wishlist** (save one-of-one items) | S | Owner-RLS table + UI; high perceived value. |
| 2 | **Account summary: Reef Credit + store credit + order history (read-only)** | M | Surfaces existing ledgers; big "why log in" payoff. |
| 3 | **Stock / price-drop alerts** (item + saved-search) via edge fn | M | The category's core retention hook. |
| 4 | **Saved payment + address** (for future checkout/bidding) | M | Prereq for auctions; payment provider TBD. |
| 5 | **Bidding identity + transparent bid history** | L | Gated by the auction build (`scope-live-auctions.md`). |
| 6 | **Membership/subscription tier** (Top Shelf "Build Your Reef" model, rollover credits) | L | Recurring revenue; layers on Reef Credit. |

Recommend shipping **0→2** as the first public-accounts slice (login + wishlist + balances/history),
then alerts (3), and deferring payment/bidding (4–6) until the auction roadmap is greenlit.

---

## 8. Open questions for the owner

1. **Un-park sign-off.** Public accounts are Phase 4 / parked. Confirm we even scope a *build* (vs.
   leave at this doc) — and that the first slice is 0→2 (login + wishlist + balances).
2. **Auth methods:** email magic-link/OTP only, or add social (Google/Apple) and SMS OTP?
3. **Identity matching:** auto-link a new signup to an existing `customers` row on verified
   email/phone match, or always require a manual "claim your in-store history" step? (Recommend
   auto-link on *verified* match only.)
4. **Reef Credit online:** show balance only (recommended v1), or also allow online redemption later
   (needs checkout + the loyalty-redeem edge fn)?
5. **Payments provider** for saved payment / future checkout / bidding (Stripe? Clover-linked?) —
   decision needed before rungs 4–6.
6. **Membership tiers:** interested in a credit-subscription (Top Shelf model) as a Phase-4 revenue
   play, or points-only (WWC model) to start?
</content>
