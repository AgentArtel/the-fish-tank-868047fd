# Scope — Two-way Clover POS ↔ Workspace sync (RESEARCH + FEASIBILITY)

> **Status:** RESEARCH / SCOPING ONLY. No schema applied, no SQL run, no features built, no PR.
> Claude Code, 2026-06-13. Branch: isolated worktree (do **not** touch `main`).
> Companion: `.lovable/design-coral-stock-tracking.md` (coral stock + `coral_sale_events` +
> `applyCoralSale` — Clover sales feed *that* ledger; this doc does not re-derive it).
> **DB changes are Lovable's lane** — every table/secret/cron below is a **spec**, never dashboard SQL.
> **Parked-scope note:** `REALITY_MAP.md:29/37` lists Clover sync as **parked — do not expand
> without sign-off**. This is a scoping doc *for* that sign-off; building anything past Phase 1
> is gated on the boss un-parking it.

---

## TL;DR — feasibility verdict

**Two-way sync is feasible but asymmetric, and "workspace = source of truth" is the right call.**

- **Reading from Clover (pull): fully supported and easy.** Items, prices, stock, categories,
  modifiers, orders, line items, payments, refunds are all readable via the v3 REST API, plus
  near-real-time webhooks. Phase 1 (import Clover's catalog + ingest sales) is low-risk.
- **Writing to Clover (push): supported but with sharp edges.** You *can* create/update items,
  prices, categories, modifier groups, and stock counts. The friction is not the API — it's
  **echo-loop prevention** (our push fires a Clover `UPDATE` webhook we must not re-apply) and
  **conflict resolution** (item edited in Clover *and* the workspace).
- **The honest hard part is corals.** Clover's stock model is **discrete decimal counts per item**.
  Frag mode maps cleanly. **Colony mode does not** — a mother colony has no up-front count. There is
  no Clover concept of "infinite / presence-only stock," so colonies must be modeled as
  **stock-untracked items** in Clover (don't push a count; treat each Clover sale as a frag-off
  event into `coral_sale_events`, never a decrement). This is a modeling decision, not a blocker.
- **Recommended MVP is one-way, pull-only (Phase 1).** Full bidirectional (Phase 3) is real work and
  should be gated behind a working Phase 1/2 and an explicit decision on conflict policy.

**Bottom line:** do it in phases. Phase 1 delivers most of the boss's stated first step ("pull in
whatever Clover already has, reflect sales here") with low risk. Push and full bidirectional are
worth doing but carry the loop/conflict risk that must be designed for, not bolted on.

---

## A. What's possible — read/write capability matrix (cited)

All endpoints are under the merchant base `…/v3/merchants/{mId}/…`. Money is in **cents**
(e.g. $20.99 → `2099`). ([items/price][items], [REST basics][rest])

| Domain | Read | Write (create/update/delete) | Endpoint(s) | Notes |
|---|---|---|---|---|
| **Items** | ✅ | ✅ | `GET/POST /items`, `POST/DELETE /items/{id}` | Create needs `name` + `price` (cents). ([items][items]) |
| **Price + priceType** | ✅ | ✅ | on the item object | `priceType` = `FIXED` (default) \| `VARIABLE` \| `PER_UNIT`. ([items][items]) |
| **Item stock (counts)** | ✅ | ✅ | `GET …?expand=itemStock`, `POST /item_stocks/{itemId}` | **`quantity` is the only writable stock field** (decimal, ±). `stockCount` is **deprecated** (rounds). Quantity can *only* be set via `item_stocks`, not on the item. ([stock][stock]) |
| **Categories** | ✅ | ✅ | `/categories`; assoc `POST /category_items` | Item↔category is an association tuple. ([categories/assoc][assoc]) |
| **Modifier groups / modifiers** | ✅ | ✅ | `/modifier_groups`, `/modifier_groups/{id}/modifiers`; assoc `POST /item_modifier_groups` | Item↔modifier-group is an association. ([modifiers][modifiers], [assoc][assoc]) |
| **Item groups / variants (attributes/options)** | ✅ | ✅ | `/item_groups`, attributes/options | For sized variants; likely **out of scope** for corals (we model size as a modifier or just qty). ([items][items]) |
| **Orders** | ✅ | ✅ | `GET /orders`, `GET /orders/{id}?expand=lineItems,payments,refunds,discounts` | Read is all we need for sales. ([orders][orders]) |
| **Line items** | ✅ | ✅ | `GET /orders/{id}/line_items`, `?filter=refunded=true` | Per-line qty, price, refunded flag. ([orders][orders]) |
| **Payments** | ✅ | ✅ | expand `payments` on order | Tells us *paid* vs open order. ([orders][orders]) |
| **Refunds / voids** | ✅ | (n/a for us) | `?expand=refunds` | Void = pre-settlement cancel; refund = post-settlement. Both must reverse a `coral_sale_events` row. ([orders][orders]) |
| **Webhooks** | — | configured on the **app** | Dev Dashboard → App Settings → Webhooks | Events: inventory, orders, payments, merchant, etc. (below). ([webhooks][webhooks]) |

**Conclusion:** every capability the boss asked for is present. Write is real (items, prices, stock,
categories, modifiers). The constraint that shapes the whole design: **stock is a discrete decimal
count per item, set only via `item_stocks`** — fine for frags/dry-goods, awkward for colonies.

### Auth model ([oauth][oauth], [tokens][tokens], [api-token][apitoken])
- **Two modes.** (a) **Merchant API token** — single-merchant, no OAuth dance, READ **and** WRITE
  scoped to that one merchant. (b) **OAuth v2 expiring tokens** (`access_token` + `refresh_token`,
  Unix-timestamp expiry, refresh via `POST /oauth/v2/refresh`) — required for multi-merchant /
  App-Market apps; mandatory for apps created after Oct 2023 going through the app market.
- **Recommendation: single merchant → use a merchant API token.** The Fish Tank is one store, one
  merchant. A long-lived merchant token avoids building OAuth refresh plumbing. If the boss later
  needs the app on Clover's App Market or multi-location, migrate to OAuth v2 (refresh handling is
  the only added work). ([oauth-flows][oauthflows])
- **Base URLs:** Production `https://api.clover.com` (US) / token mint `https://www.clover.com`;
  **Sandbox** `https://apisandbox.dev.clover.com` / `https://sandbox.dev.clover.com`. ([oauth][oauth], [stock][stock])
- **What the boss must provide:** **merchant ID**; an **API token** (or, for OAuth, **App ID +
  App Secret**); and the **webhook signing secret** (shown when the app's webhook is configured).
  Merchant ID is in Clover dashboard → Account & Setup → Merchant column. ([oauth][oauth], [webhooks][webhooks])

### Webhooks ([webhooks][webhooks])
- Configured per **app** (Dev Dashboard → App Settings → Webhooks), not per merchant. **Verification
  handshake:** you enter a callback URL, Clover POSTs a `verificationCode`, you echo it back to
  verify ownership.
- **Event types** are merchant-level: **inventory** (item create/update/delete), **orders**,
  **payments**, plus merchant/app-install events. Each event type needs the matching **read
  permission** granted by the merchant.
- **Signature:** `Clover-Signature: t=<unixTime>,v1=<hmac>`. Verify by computing HMAC over
  `"{t}.{rawBody}"` with the webhook secret and comparing `v1`. (Same scheme Clover documents for
  hosted-checkout webhooks.) ([webhooks][webhooks])
- **Payload is thin** (merchant id, object type, object id, event type) — webhooks tell you *what
  changed*, you then **GET the object** to get current state. Plan for a **reconcile poll backstop**
  (webhooks can be missed/delayed; community reports gaps).

### Rate limits / pagination / idempotency ([ratelimits][ratelimits], [pagination][pagination])
- **Rate limit: 16 req/s per token, 50 req/s per app** (more restrictive wins). On **429**: pause 1s,
  then exponential backoff. A bulk initial import of a large catalog must be throttled.
- **Pagination:** `limit` default 100, **hard max 1000**; `offset` for paging. Cannot paginate
  *nested* fields. Use `filter=` (e.g. `modifiedTime >= …`) + `expand=` to pull incrementally.
- **Idempotency:** Clover does **not** give us a generic idempotency-key on writes — we own
  dedup. On **ingest**, the `coral_sale_events UNIQUE (clover_order_id, clover_line_item_id)` key
  (already in the coral design) makes webhook-replay/poll-overlap safe. On **push**, we must guard
  with our own mapping + a "last pushed hash/version" (see echo-loop, §B).
- **Sandbox:** full test merchant + test API tokens in `apisandbox.dev.clover.com` — we can build
  and test Phase 1/2 with zero production risk before the boss wires the real merchant. ([apitoken][apitoken])

---

## B. Recommended architecture (workspace = source of truth)

Reuse this app's **existing machine-ingest shape** — **no Supabase edge functions exist** in this
project; cron hits a public `/api/public/hooks/*` TanStack route guarded by a **Vault** secret
(`src/routes/api/public/hooks/refresh-scrape-sources.ts` is the template). Clover follows the same.

### B.1 Link / mapping table — `clover_item_links` (Lovable migration; specced in coral design §B.2)
One row maps a Clover `items.id` ↔ our `inventory_items.id` (`UNIQUE(clover_item_id)`). Many of our
items won't be in Clover and vice-versa, so it's a table, not a column. Add to that spec two fields
the **push/echo** path needs:

```
last_pushed_hash   text        -- hash of the workspace fields we last wrote to Clover
last_pushed_at     timestamptz
clover_modified_time bigint     -- Clover's modifiedTime we last ingested (for conflict/echo checks)
sync_state         text        -- 'in_sync' | 'workspace_dirty' | 'clover_dirty' | 'conflict'
```

### B.2 PUSH path (workspace change → Clover write)
- **Where it's triggered:** in the **server functions that already mutate inventory** (e.g.
  `catalogCoralItem`, the pricing-approval mutation, the "Mark available" / qty edits on
  `inventory.$id.tsx`). After a successful DB write, enqueue a Clover push (don't block the user's
  mutation on a Clover round-trip — fire-and-reconcile, or a tiny `clover_outbox` queue table
  drained by the poll).
- **What it writes:** for a linked item → `POST /items/{id}` (name/price/priceType), `POST
  /item_stocks/{id}` (frag qty), category/modifier associations. For a *new* available item with no
  link → `POST /items`, capture the returned id into `clover_item_links` (write our id into the
  Clover item **SKU** so future matching is deterministic).
- **Respect the invariants:** push happens **after** the existing gates (admin pricing approval,
  photo-on-file, `requireEditor`/admin role). Clover is downstream of "go-live," never a bypass.
  AI-draft items (`incoming`/`not_for_sale`) are **never** pushed.

### B.3 PULL / ingest path (Clover → workspace)
- **New route `src/routes/api/public/hooks/clover-webhook.ts`** (mirrors `refresh-scrape-sources.ts`):
  verify `Clover-Signature` HMAC against the Vault webhook secret → for each event, **GET the object**
  → apply:
  - **order/payment event** → for each paid line item: resolve `clover_item_links` →
    `applyCoralSale({ source:'clover', clover_order_id, clover_line_item_id, … })` (idempotent via
    the UNIQUE key). Unlinked lines (fish/dry-goods/unknown) → skip or drop into a small
    `clover_unmatched_lines` review queue — **never guess** (AI-draft / human-decides invariant in
    spirit).
  - **refund/void** → reverse the matching `coral_sale_events` row (insert a negative/`voided`
    sibling keyed to the same line; for frag mode, re-credit `quantity_available`).
  - **inventory event** (item edited in Clover) → in Phase 3 only: compare `modifiedTime` vs
    `last_pushed_at` to decide echo vs real external edit (below).
- **Reconcile poll backstop — `src/routes/api/public/hooks/clover-poll.ts`** driven by **pg_cron +
  pg_net** (the exact precedent at migration `20260612235149`): pull last 24–48h of orders
  (`?filter=modifiedTime>=…&expand=lineItems,payments,refunds`) and replay through the same
  idempotent `applyCoralSale`. Catches missed/late webhooks. Safe to overlap with webhooks.

### B.4 Echo-loop prevention (the core two-way risk)
Our push writes to Clover → Clover fires an `inventory UPDATE` webhook → we must **not** re-ingest
it as an external edit. Strategy (defense in depth):

1. **Hash + window:** on push, store `last_pushed_hash` + `last_pushed_at`. When an inventory webhook
   arrives, GET the item; if its content-hash == `last_pushed_hash` **or** it arrived within ~N
   seconds of our push, treat as **our own echo → ignore**.
2. **modifiedTime compare:** if Clover's `modifiedTime` ≤ our `last_pushed_at`, it's the echo.
3. **Phase 1/2 don't ingest inventory edits at all** (only sales), so the loop literally cannot
   occur until Phase 3 — which is *why* bidirectional is phased last.

### B.5 Conflict resolution (Phase 3)
"Workspace wins" is the boss's stated policy. Concretely:
- **Default = workspace-authoritative:** when both sides changed, **re-push the workspace value**
  and flag `sync_state='conflict'` for an admin to see (don't silently clobber a real in-store
  price change without a trail).
- **Exception worth surfacing:** **stock decrements from sales** are authored *by Clover*
  (the register rang the sale). Those must flow Clover→workspace (via `coral_sale_events`), even
  under "workspace wins" — sales are facts, not edits. Keep "workspace wins" for **catalog/pricing**,
  and "Clover wins" for **realized sales**. (This split is the single most important design subtlety.)

### B.6 How Clover sales feed `applyCoralSale` / `coral_sale_events`
Already designed in `.lovable/design-coral-stock-tracking.md` §B.3–B.4. Clover line item →
`coral_sale_events` row → frag mode decrements `quantity_available`/bumps `quantity_sold`
(auto `sold_out` at 0); colony mode just accumulates (no decrement). The UNIQUE
`(clover_order_id, clover_line_item_id)` makes webhook+poll idempotent. **No change needed there** —
this doc just confirms the Clover side feeds it.

---

## C. Data mapping (workspace ↔ Clover)

| Workspace (`inventory_items`) | Clover | Direction | Notes |
|---|---|---|---|
| `id` | `items.sku` (we write it) | push | Deterministic mapping key. |
| `item_name` | `items.name` | both | |
| `retail_price` (dollars) | `items.price` (cents) | both | ×100 / ÷100. Pushed **only after admin pricing approval**. |
| `attrs.price_mode` | `items.priceType` | push | `per_head`→`PER_UNIT`; `fixed`→`FIXED`. (`VARIABLE` unused.) |
| `quantity_available` (frag) | `item_stocks.quantity` | both | Frag mode only. Sales decrement comes back via orders, not the stock webhook. |
| **colony** stock | *(untracked — push no `item_stocks`)* | push | **Colony has no count.** Mark the Clover item as not-stock-tracked; each sale = a frag-off event, never a decrement. |
| dry-goods qty | `item_stocks.quantity` | both | Cleanest mapping — discrete real counts. |
| `item_type` / category | `categories` + `category_items` | push | livestock / coral / dry-good → Clover categories. |
| `attrs.frag_size` etc. | modifier group ("Frag size") | push (optional) | Or leave as qty; modifiers add complexity, defer. |
| order `lineItem` (sale) | → `coral_sale_events` | pull | Per coral design §B.4. |

**Frag vs colony vs dry-good is the crux:** frags and dry-goods are discrete counts (clean two-way);
**colonies are presence-only and must be stock-untracked in Clover** (Clover offers no infinite-stock
type — you simply don't push an `item_stocks` quantity, and you treat sales as ledger events).

---

## D. Phasing (realistic MVP)

### Phase 1 — Pull-only: import Clover catalog + ingest sales (THE MVP)
Delivers the boss's stated first step with **low risk and no echo/conflict problem** (we never write
to Clover, so no loop).
- **Read** Clover items → create/match `inventory_items` (with `clover_item_links`); unmatched →
  review queue. **Ingest sales** via `clover-webhook.ts` + daily `clover-poll.ts` → `applyCoralSale`.
- No push, no conflict logic. Workspace edits stay workspace-only for now.
- **Ships the "reflect Clover here" value immediately.**

### Phase 2 — Push: workspace → Clover for pricing/inventory (one-way write)
- After a workspace mutation passes the existing gates, push name/price/priceType/stock/category to
  Clover for **linked** items; create Clover items for newly-available unlinked items (write SKU).
- Still **don't ingest inventory edits from Clover** (only sales) → echo loop can't fire yet.
- Adds `last_pushed_hash`/`_at` plumbing + the outbox/queue.

### Phase 3 — Full bidirectional + conflict handling
- Ingest **inventory webhooks** (item edited directly in Clover) → echo-loop guards (§B.4) +
  conflict policy (§B.5: workspace wins for catalog/pricing, Clover wins for realized sales).
- This is the real-cost phase: it needs the conflict UI, the echo guards battle-tested, and an
  honest decision on what happens when staff edit a price on the Clover register.

**Recommended MVP = Phase 1.** It's most of the boss's "first step," carries the least risk, and
validates the mapping table + sales ledger before any write-back complexity.

---

## E. Lane split + effort / risk

| Phase | Claude (app code) | Lovable (DB/secrets/cron) | Boss | Effort | Risk |
|---|---|---|---|---|---|
| **1** | Clover API client (read); `clover-webhook.ts` + `clover-poll.ts`; map/import UI; `/settings/clover` page (un-stub `_app.tsx:113`); unmatched-line review | `clover_item_links` + (opt) `clover_unmatched_lines` + `clover_connection` settings migrations + RLS/GRANTs; Vault: merchant token + webhook secret; daily-poll pg_cron | Merchant ID, **API token**, webhook signing secret; confirm un-park | **M** | **Low** — read-only into Clover. |
| **2** | Push writes in existing mutation server-fns; outbox drain; SKU write-back | add `last_pushed_hash/_at/sync_state` to link table; outbox table if used | decide: push corals into Clover catalog vs map-after | **M–L** | **Med** — partial-failure/retry; respect pricing+photo gates. |
| **3** | Ingest inventory webhooks; echo guards; conflict surfacing UI | conflict columns/indexes | **policy call:** workspace-wins vs register edits; multi-location? | **L** | **High** — loops, conflicts, refund reversal correctness. |

Notes: `coral_sale_events` + `applyCoralSale` (needed in Phase 1 for ingest) are already specced in
`design-coral-stock-tracking.md` Phase 1 — sequence that first.

---

## F. Open questions + risks for the boss (honest)

1. **Does Clover already have all the store's items set up?** If yes → **import-first** (Phase 1 pulls
   them, we match to our corals by SKU/name). If the catalog is sparse/messy in Clover → push-first
   may be cleaner, but that's Phase 2. *This single answer reorders the work.*
2. **Single merchant / single location?** If yes, a **merchant API token** (no OAuth refresh) is far
   simpler. Multi-location or App-Market distribution forces OAuth v2 + refresh plumbing (more work).
3. **Colony stock semantics** — confirm: colonies are **not stock-tracked in Clover** (presence-only;
   each register sale = a frag-off ledger event, never a count decrement). Clover has no infinite-stock
   type, so this is the only sane model. Sign-off needed.
4. **Items edited directly on the Clover register** (a price changed at the counter). Under
   "workspace wins," do we **overwrite** that back from the workspace, or **accept** it and pull it
   in? Recommendation: workspace wins for catalog/pricing **but flag conflicts for admin review** —
   don't silently clobber a real in-store change. This is the crux of Phase 3.
5. **Refunds/voids** must reverse a sale in our ledger (re-credit frag stock). Confirm we want
   automatic reversal vs a review step.
6. **Non-coral sales** — Clover also rings fish + dry goods. Phase 1 ingests **only** lines whose
   Clover item is in `clover_item_links`; everything else is ignored or queued. Confirm that's the
   intended scope (vs. tracking all inventory types through Clover eventually).
7. **Pricing-approval invariant vs Clover push.** Pushing a price to Clover is "going live." Confirm
   push fires **only after** admin approval (it must — CLAUDE.md invariant), and that a price changed
   on the Clover register does **not** count as approval.
8. **Webhook reliability** — Clover webhooks can be missed; the daily reconcile poll is mandatory,
   not optional. Confirm a public, HTTPS, signature-verified endpoint is acceptable (it reuses the
   existing `/api/public/hooks/*` pattern).

---

## Sources (Clover official docs + cited community/guides)

- Items / price / priceType: https://docs.clover.com/dev/docs/managing-items-item-groups , https://docs.clover.com/dev/docs/making-rest-api-calls
- Item stock (`item_stocks`, `quantity`, deprecated `stockCount`): https://docs.clover.com/dev/docs/querying-inventory , https://docs.clover.com/dev/docs/working-with-inventory
- Categories / associations (`category_items`, `item_modifier_groups`): https://docs.clover.com/dev/docs/managing-categories , https://docs.clover.com/dev/docs/using-object-associations
- Modifier groups / modifiers: https://docs.clover.com/dev/docs/managing-modifier-groups-modifiers
- Orders / line items / refunds / expand: https://docs.clover.com/dev/docs/orders-faqs , https://docs.clover.com/dev/docs/working-with-transaction-data-rest , https://docs.clover.com/dev/docs/payments-and-refunds-faqs
- Auth — OAuth v2 / tokens / merchant API token / base URLs: https://docs.clover.com/dev/docs/use-oauth , https://docs.clover.com/dev/docs/oauth-flows-in-clover , https://docs.clover.com/dev/docs/using-api-tokens , https://docs.clover.com/dev/docs/generate-a-test-api-token , https://docs.clover.com/dev/docs/refresh-access-tokens
- Webhooks / signature / verification handshake: https://docs.clover.com/dev/docs/webhooks , https://docs.clover.com/dev/docs/ecomm-hosted-checkout-webhook
- Rate limits (16/s token, 50/s app; 429 backoff): https://docs.clover.com/dev/docs/api-usage-rate-limits , https://medium.com/clover-platform-blog/conquering-api-rate-limiting-dcac5552714d
- Pagination (limit 100 / max 1000, offset): https://docs.clover.com/dev/docs/paginating-elements

[items]: https://docs.clover.com/dev/docs/managing-items-item-groups
[rest]: https://docs.clover.com/dev/docs/making-rest-api-calls
[stock]: https://docs.clover.com/dev/docs/querying-inventory
[assoc]: https://docs.clover.com/dev/docs/using-object-associations
[modifiers]: https://docs.clover.com/dev/docs/managing-modifier-groups-modifiers
[categories]: https://docs.clover.com/dev/docs/managing-categories
[orders]: https://docs.clover.com/dev/docs/orders-faqs
[oauth]: https://docs.clover.com/dev/docs/use-oauth
[oauthflows]: https://docs.clover.com/dev/docs/oauth-flows-in-clover
[tokens]: https://docs.clover.com/dev/docs/using-api-tokens
[apitoken]: https://docs.clover.com/dev/docs/generate-a-test-api-token
[webhooks]: https://docs.clover.com/dev/docs/webhooks
[ratelimits]: https://docs.clover.com/dev/docs/api-usage-rate-limits
[pagination]: https://docs.clover.com/dev/docs/paginating-elements
