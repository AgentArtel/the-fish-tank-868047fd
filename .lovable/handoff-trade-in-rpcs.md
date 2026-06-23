# Handoff → Lovable: Trade-in intake RPCs (wizard 11)

> Floor staff take in a customer's fish/coral (no PO, no vendor), give store credit, and the stock
> lands as **draft inventory** pending admin review/pricing. App-side wizard is built (route
> `/inventory/trade-in` + customer picker + form); it calls the two RPCs below. **Floor staff can't
> write `inventory_items` or `customers` directly** (both INSERT policies are `can_edit_content` =
> admin/dev only), so the writes must go through `SECURITY DEFINER` RPCs — same narrow-write model as
> `record_inventory_loss` / `grant_store_credit`.

## 1. `search_customers_for_staff(_q text)` `[DB=Lovable]`
`SECURITY DEFINER`, self-checks `is_floor_staff_or_above(auth.uid())`. Granted to `authenticated`.

Floor staff need to look up a returning customer at the counter, but the `customers` SELECT policy is
editor-only. This is a **narrow read** that returns only what the picker needs — no spend, no notes, no
PII beyond contact basics:

- Returns rows: `id, first_name, last_name, email, phone` (cap ~50, ordered by `last_seen_at desc nulls last`).
- `_q` (nullable): case-insensitive match on `first_name`/`last_name`/`email`/`phone` (same `ilike` as
  `customers_with_spend`). Null/empty `_q` → most-recent customers.

## 2. `record_trade_in(...)` `[DB=Lovable]` — the atomic intake
`SECURITY DEFINER`, self-checks `is_floor_staff_or_above(auth.uid())`. Granted to `authenticated`.
**One transaction**: resolve/create the customer → insert N draft inventory rows → grant store credit →
write activity logs. If anything fails, the whole thing rolls back (no orphan stock, no double credit).

**Signature (suggested):**
```sql
record_trade_in(
  _customer_id   uuid,    -- nullable; if null, create from _new_customer
  _new_customer  jsonb,   -- nullable; { first_name, last_name, email, phone }
  _location_id   uuid,    -- destination (a quarantine/holding location); nullable allowed
  _lines         jsonb,   -- array (see below), min 1
  _note          text     -- optional overall note
) returns jsonb
```

**`_lines[]` element:** `{ name, item_type, scientific_name, qty, condition, credit_cents }`
- `name` (text, required, non-empty)
- `item_type` (text) — one of `fish · coral · invert · dry_good · live_rock · equipment · other`
- `scientific_name` (text, nullable)
- `qty` (int, > 0)
- `condition` (text, nullable) — health/condition note
- `credit_cents` (int, ≥ 0) — store credit given for **this line** (total, not per-unit)

**Behavior:**
1. **Customer:** if `_customer_id` given, use it. Else require `_new_customer` to have at least a name
   or a contact field, `INSERT INTO customers (... , created_by = auth.uid())`, use the new id.
2. **Validate** `_lines` non-empty; per line: name non-empty, `qty > 0`, `credit_cents >= 0`,
   `item_type` in the allowed set. Reject otherwise (clear message — the app surfaces it as a toast).
3. **Per line, INSERT a draft `inventory_items` row:**
   - `item_name`, `scientific_name`, `item_type`
   - `quantity_received = qty`, `quantity_available = qty`, `quantity_lost = 0`
   - `pricing_status = 'not_priced'` (admin prices later — baseline 3× still applies in review)
   - `availability_status = 'incoming'` (draft; not customer-visible). *If you'd rather route trade-ins
     straight to `quarantine`, that's fine too — your call on the health-quarantine vs review-pipeline
     framing; `incoming` keeps them in the same review path Coral Discovery uses.*
   - `live_sale_status = 'not_eligible'`
   - `location_id = _location_id`
   - `wholesale_cost = (credit_cents / 100.0) / qty` — **cost basis = the credit we paid**, per unit
   - `retail_price = null`, `needs_photo = true` (photo added in review; no counter photo needed)
   - `received_by = auth.uid()`, `created_by = auth.uid()`
   - `attrs = jsonb_build_object('trade_in', jsonb_build_object('customer_id', <cust>, 'condition',
     <condition>, 'credit_cents', credit_cents))`
   - collect the new id.
4. **Grant store credit once for the total:** `total = sum(credit_cents)`. Either call
   `grant_store_credit(<cust>, total, 'trade_in', _note, <related_ref>)` internally, or inline the same
   `store_credit_ledger` insert (`kind='grant'`, `source='trade_in'`, `created_by=auth.uid()`). Skip if
   `total = 0`. Use the **first new item id** (or a generated group uuid) as `related_ref` for the audit
   trail.
5. **Activity log:** one `inventory_activity_logs` row per item. **Heads-up:** this likely needs a new
   `inventory_activity_action` enum value — `'trade_in'` (or reuse `'intake'` if you prefer; the
   mortality work already added `'loss'`). Tell me which you pick so the UI label matches.
6. **Return** `jsonb`: `{ customer_id, item_ids: [...], credit_cents: total, balance_cents }`
   (`balance_cents` = the customer's new store-credit balance, so the app can confirm it in the toast).

## App side (already built, waiting on these)
- `src/lib/trade-in.functions.ts` → `searchTradeInCustomers` (calls #1) + `recordTradeIn` (calls #2),
  both `requireFloorStaff`, RPCs cast `(supabase as any).rpc(...)` until the next type regen.
- `src/routes/_app/inventory.trade-in.tsx` → the wizard (customer picker + multi-line capture + total).
- Entry points mirror Coral Discovery (sidebar nav + Quick-Add intent).

## Reply with
Confirm both RPCs are in (+ the activity-action enum value you chose: `trade_in` vs `intake`), and I'll
flip the wizard from "waiting on RPC" to live + ask you to integration-test (create from new + existing
customer, multi-line, credit lands, items appear as drafts in pricing review, anonymous rejected).

---

## ✅ Done & verified (2026-06-23)
Both RPCs shipped (`trade_in` enum added; `intake` kept free for vendor-receive). App-side merged in
#75. All 6 integration checks passed against the live RPCs. **Feature is live.**

### Cleanup for Lovable (DB lane)
Integration-test data was left in the **live DB** so pricing review could be eyeballed — please clear it
once you're done looking:
- customer `7a3dbe2d…` (the test trade-in customer)
- the 4 draft `inventory_items` from those test runs (find via `attrs.trade_in` / `received_by` =
  the test session, or the `7a3dbe2d…` customer link)

Nothing else outstanding on trade-in.
