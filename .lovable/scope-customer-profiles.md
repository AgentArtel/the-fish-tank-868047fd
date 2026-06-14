# Scope — Customer profiles from Clover sales (capture WHO, not just WHAT)

Date: 2026-06-14 · Author: Claude Code (scoping/design — no app code changed).
Status: **proposal / scoping.** DB parts are Lovable's lane (migration spec below — *not* applied).
Companion docs: `.lovable/handoff-clover-phase1.md`, `.lovable/scope-clover-sync.md`,
`.lovable/design-coral-stock-tracking.md`. Domain rules: `CLAUDE.md`, `WORKFLOW.md`.

> **Parked-layer note.** Clover sync is "Parked — do not expand without sign-off" in
> `REALITY_MAP.md`, and customer-facing is roadmap Phase 4. This doc is **direction, not
> committed scope.** It needs the boss's go before the KISS v1 is built. It is written so v1
> is a tiny, low-risk add-on to the *already-built* sale ingest, with everything else deferred.

---

## 1. Problem & opportunity

Today the Clover sale ingest records **what** sold but never **who** bought it.
`src/lib/clover.ingest.server.ts` turns each Clover line item into an `inventory_sale_events`
row (table: `supabase/migrations/20260613201503_*.sql`), and `cloverListRecentOrders`
(`src/lib/clover.api.ts:130`) only expands `lineItems,payments` — the customer on the order is
silently dropped. So we can report "sold-by-coral-type" (`getCoralSalesByType`,
`src/lib/ops.functions.ts:2316`) but cannot answer "who are our best customers", "what does this
hobbyist buy", or send a single targeted message. **Capturing the customer on each order is the
keystone**: customer profiles, purchase history, loyalty, and marketing all sit downstream of it,
and it costs almost nothing to start capturing now — every day we don't, that history is lost.

---

## 2. What Clover gives us

**Findings (Clover REST API):**

- **Orders carry an optional customer.** Adding `customers` to the order `expand` list returns the
  customer(s) attached to each order — i.e. change the existing
  `expand: "lineItems,payments"` to `expand: "lineItems,payments,customers"` in
  `cloverListRecentOrders` (`src/lib/clover.api.ts:140`). Orders with no customer simply omit it.
  The expanded object is typically a ref (`{ id }`) plus whatever the token's scopes allow; the
  canonical record lives at the customers endpoint.
- **Customers endpoint:** `GET /v3/merchants/{mid}/customers` (and `/customers/{id}`) exposes
  `firstName`, `lastName`, `emailAddresses[]` (each `{ emailAddress, verifiedTime }`),
  `phoneNumbers[]` (`{ phoneNumber }`), and `addresses` — addresses/emails/phones are themselves
  **expandable** (`?expand=addresses,emailAddresses,phoneNumbers`). There is a
  marketing/email-consent concept on the customer, but those fields and even email/phone are
  **permission-gated** at the token level (e.g. `CUSTOMERS_EMAIL_R`). If our existing Clover API
  token lacks the customer-read scopes, the expand returns just an id (or nothing) — so the first
  concrete task is to **confirm the token's scopes** (Settings → Clover token; creds load in
  `loadCloverCreds`, `src/lib/clover.api.ts:14`).
- **Marketing consent is not implied by a sale.** Email/phone being present in Clover does not mean
  the customer agreed to marketing. Treat consent as a separate, explicit flag (see §5).

**The big caveat — most POS sales are anonymous.** A coral/aquarium retail counter rings up a large
share of **walk-ins** with no customer attached (cash, quick card tap, no loyalty ask). Realistic
expectation: **well over half, often 70–90%, of orders will have NO customer.** The design must
treat "no customer" as the *normal* path — anonymous sale events stay exactly as they are today
(customer FK null), and we only enrich the minority that have one. We should surface the
**attach-rate** ("X% of sales had a customer") as its own metric so the boss can decide whether to
push staff to capture customers at the register (which is the real lever on data quality).

**Concrete ingest change (the keystone, one small diff):**
1. `cloverListRecentOrders` — add `customers` to `expand`; map `o.customers?.elements?.[0]` to a
   `customerRef { id, firstName?, lastName?, email?, phone? }` on the returned `CloverOrder`.
2. `ingestCloverSales` (`src/lib/clover.ingest.server.ts`) — per order, upsert the customer into a
   new `customers` table (keyed on `clover_customer_id`) and stamp the resulting
   `customer_id` onto every `inventory_sale_events` row for that order. Anonymous orders → null,
   unchanged. This is idempotent-friendly: the upsert is by `clover_customer_id`, and sale-event
   rows are already deduped by `(clover_order_id, clover_line_item_id)`.

---

## 3. KISS FOUNDATION (v1) — the simplest valuable version

**Goal:** start *capturing and storing* the customer on every Clover order, and give the team a
plain Customer list + Customer detail (purchase history + lifetime spend). Nothing fancy — no
merging, no segmentation, no marketing. Just stop losing the data and make it viewable.

### 3a. Data model (Lovable's lane — migration spec, not applied)

A new `customers` table; sale events gain a **nullable** FK to it (anonymous stays null).

```sql
-- Phase: customer capture v1. Customers sourced from Clover orders (and manual later).
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clover_customer_id text UNIQUE,            -- null for a manually-created customer
  first_name text,
  last_name text,
  email text,                                -- PII — see RLS + §5
  phone text,                                -- PII
  marketing_consent boolean NOT NULL DEFAULT false,  -- never inferred from a sale; explicit
  notes text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_sale_events
  ADD COLUMN IF NOT EXISTS customer_id uuid
    REFERENCES public.customers(id) ON DELETE SET NULL;   -- null = anonymous / walk-in

CREATE INDEX inventory_sale_events_customer_idx
  ON public.inventory_sale_events (customer_id, sold_at DESC);

-- Grants + RLS mirror inventory_sale_events exactly (migration 20260613201503_*.sql):
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors can view customers"   ON public.customers FOR SELECT
  TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors can insert customers" ON public.customers FOR INSERT
  TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors can update customers" ON public.customers FOR UPDATE
  TO authenticated USING (public.can_edit_content(auth.uid()))
  WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Admins can delete customers"  ON public.customers FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
```

This reuses the exact RLS helpers (`can_edit_content`, `has_role`, `is_active_user`) and the
`touch_updated_at` trigger already used by `clover_item_links` / `inventory_sale_events`. The
`ON DELETE SET NULL` on the FK means deleting a customer (GDPR/"forget me") leaves their sale
history intact but anonymized — exactly what we want.

> **PII hardening option for v1.5 (flag to boss):** if email/phone visibility should be admin-only
> while the list/history stays editor-visible, split PII into a separate `customer_pii` table (or a
> column-masking SECURITY DEFINER view) with admin-only SELECT, like the
> `clover_credentials` admin-only pattern (`20260614013906_*.sql`). v1 keeps it simple
> (editor-visible) unless the boss wants the stricter split — see §5.

### 3b. Ingest capture (Claude's lane — app)

- `src/lib/clover.api.ts` — `cloverListRecentOrders`: add `customers` to `expand`; extend
  `CloverOrder` with `customer: { cloverId, firstName?, lastName?, email?, phone? } | null`.
- `src/lib/clover.ingest.server.ts` — before the line-item loop, for each order **with** a customer:
  `upsert` into `customers` on `clover_customer_id` (fill name/email/phone if newly present; bump
  `last_seen_at`), keep a `Map<orderId, customerId>`; then pass `customer_id` into the
  `applyInventorySale` insert and the `needs_review` insert. Add an optional `customerId` to
  `applyInventorySale` (`src/lib/ops.functions.ts:2209`) so the column is written on both the
  applied and review paths. Anonymous orders skip all of this (FK null) — zero behavior change for
  the 70–90% walk-in path.
- Extend `CloverIngestResult` with `customersSeen` / `customersUpserted` so the "Sync sales now"
  toast can show the **attach-rate**.

### 3c. UI (Claude's lane — reuse existing patterns)

Two routes, modeled on `src/routes/_app/inventory.index.tsx` (list) and
`inventory.$id.tsx` (detail), using `PageHeader`, TanStack Query, `OpsBadge`, `fmtMoney`:

- **`/customers` (list)** — `getCustomers` server fn (`requireEditor`): name, email/phone (or
  "Walk-in / no contact"), **lifetime spend**, order count, last-seen. Debounced search by
  name/email/phone; sort by spend or recency. Empty state explains most sales are anonymous.
- **`/customers/$id` (detail)** — `getCustomer` server fn (`requireEditor`): header (name, contact,
  marketing-consent badge, lifetime spend, first/last seen) + a **purchase-history timeline** over
  `inventory_sale_events` (reuse the `getCoralSalesByType` query shape:
  `select qty,total_cents,sold_at,item:inventory_item_id(item_name,item_type)`, filtered by
  `customer_id`). Lifetime spend = `SUM(total_cents) WHERE kind='sale'`. Editor can edit
  name/notes/marketing-consent; deleting is admin-only.
- **Nav:** one "Customers" entry (Users icon) in `src/routes/_app.tsx`. No routing/hierarchy change
  beyond adding the route — within engineering-rule #2.
- **Cache invalidation:** every mutation `onSuccess` invalidates `["customers"]` /
  `["customer", id]` (engineering rule #5).

### 3d. Domain-invariant compliance

- AI is not involved; nothing here approves pricing, marks review, or creates `inventory_items`.
- All new server fns gate on `requireEditor` (active + role); delete is admin-only via RLS.
- **DB change is Lovable's lane** — the `customers` table + FK + RLS ship as one reviewed migration
  in `supabase/migrations/` (never dashboard SQL), per WORKFLOW Golden Rule #1.

---

## 4. Possibilities scale (KISS v1 → advanced)

Each rung builds on the captured `customer_id`. Effort: **S** ≈ <½ day, **M** ≈ 1–2 days,
**L** ≈ 3+ days / multi-lane.

| # | Rung | Effort | Business value |
|---|---|---|---|
| 0 | **v1 capture + Customer list/detail** (this doc) | M | Stop losing the data; see who buys + lifetime spend. The keystone. |
| 1 | **Attach-rate metric + "ask for customer" nudge** on the sync result / dashboard | S | Quantifies data quality; gives the boss a lever to push register capture. |
| 2 | **Manual customer create + attach** to a sale (for in-person regulars not in Clover) + link a sale event to an existing customer | S | Captures loyal walk-ins Clover never recorded; backfills the best relationships. |
| 3 | **Dedupe / merge customers** (same person, two Clover records or a Clover + manual one). Fuzzy match on email/phone/name — reuse the `pg_trgm` + token-overlap matcher already used by `findInventoryDuplicates` / reconciliation. Merge re-points `inventory_sale_events.customer_id`. | M | One true profile per person → trustworthy history & spend. |
| 4 | **"Top customers" leaderboard** (lifetime + trailing-90-day spend) on `/customers` and a dashboard card | S | Instantly see who to take care of; reuses the spend aggregate. |
| 5 | **RFM segmentation** (Recency / Frequency / Monetary scoring → segments: Champions, Loyal, At-risk, Lost) computed over the ledger | M | Turns raw history into actionable groups for outreach. |
| 6 | **Customer Lifetime Value** (avg order value × frequency × tenure; simple historical CLV first, predictive later) | M | Prioritize acquisition/retention spend by who's actually worth it. |
| 7 | **Favorite categories / coral-types per customer** — reuse the coral-type classifier (`classifyCoralType`, as in `getCoralSalesByType`) to roll a customer's purchases into "buys mostly SPS / zoas / dry goods" | M | Personalization: targeted "new SPS just dropped" to the SPS buyers; informs stocking. |
| 8 | **Churn / win-back signals** — flag customers whose recency exceeds their normal cadence (e.g. a monthly buyer silent 90+ days) | M | Proactive win-back before they're gone for good. |
| 9 | **Loyalty program** — points/tiers off lifetime spend or visit count; surfaced at register-adjacent staff view | L | Repeat-purchase incentive; differentiates from big-box. |
| 10 | **Marketing linkage** — feed segments (5), favorites (7), and churn flags (8) into the existing Marketing module (campaigns/content already exist per REALITY_MAP) for targeted email/SMS, **gated on `marketing_consent`** | L | Closes the loop: real stock + real customers → targeted, consented campaigns. The "better than anything before" payoff — but only as good as the consent + data underneath it. |

The vision is rungs 5–10 stacked (RFM-driven, type-aware, consented marketing with loyalty and
win-back), but **none of it is worth building until rung 0 is quietly accumulating clean data.**
Capture first; analyze later.

---

## 5. Privacy / consent notes (PII)

- **PII stored:** `email`, `phone`, name, address (if we later capture it). Minimize — store only
  what we'll use; do not pull address in v1.
- **Who can see it:** v1 = editors (matches `inventory_sale_events` RLS). If the boss wants
  email/phone restricted to admins, take the v1.5 PII-split option in §3a (separate admin-only
  table/view, mirroring the `clover_credentials` admin-only pattern). Recommend at least making
  **bulk export** of email/phone admin-only.
- **Marketing consent is explicit, never inferred.** A purchase ≠ consent. `marketing_consent`
  defaults `false`; rung 10 must filter on it. Capturing Clover's marketing/consent flag (if the
  token scope allows) can pre-populate it, but treat as opt-in source-of-record per local law.
- **Right to be forgotten:** deleting a `customers` row uses `ON DELETE SET NULL`, anonymizing past
  sale events while preserving aggregate sales integrity. Provide an admin "forget customer" action.
- **No PII in logs / public surfaces.** The public `/catalog` and any sanitized projections must
  never join to `customers`. Server fns must not log email/phone (same posture as the AI-keys
  `last_error` care in devlog Sprint 9).
- **Token scopes = a privacy control too.** Only request the Clover customer-read scopes we actually
  use; if we don't need email yet, don't grant `CUSTOMERS_EMAIL_R`.

---

## 6. Open questions for the business owner

1. **Are we capturing customers at the register at all today?** What rough % of Clover orders have a
   customer attached? (Sets whether this is worth it now or needs a register-capture push first.)
2. **Does our current Clover API token have customer-read scopes** (incl. `CUSTOMERS_EMAIL_R` /
   phone)? If not, are you willing to re-issue a token with them?
3. **Email/phone visibility:** editor-visible (simplest) or admin-only (the §3a PII split)?
4. **Marketing consent:** do you want to capture/honor Clover's consent flag, collect consent
   separately, or hold off on any marketing use until that's sorted?
5. **Manual customers:** do you want to record regular walk-ins who aren't in Clover (rung 2), or
   keep v1 strictly Clover-sourced?
6. **Priority after capture:** which rung first — Top customers (4), favorites/personalization (7),
   or straight to loyalty (9)? This sets the build order above rung 0.
7. **Un-park sign-off:** Clover sync is parked in `REALITY_MAP.md`. Confirm you want to extend it
   for customer capture now (vs. keep it parked until the coral inventory focus is done).

---

### Sources (Clover API research)
- [Use expandable fields for API responses](https://docs.clover.com/dev/docs/expanding-fields)
- [Manage orders data](https://docs.clover.com/dev/docs/working-with-orders)
- [How to get Customer details from Orders API (community)](https://community.clover.com/questions/39127/how-to-get-customer-details-from-orders-api.html)
- [Get a single customer (API reference)](https://docs.clover.com/dev/reference/customersgetcustomer)
- [Customer API permissions (scopes)](https://docs.clover.com/dev/docs/customers-api-eu-permissions)
