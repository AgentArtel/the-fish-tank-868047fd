# Handoff → Lovable: `customers` table + sale-event FK (customer capture v1)

**Why:** We're adding customer profiles + purchase history. The Clover sale ingest already records
*what* sold (`inventory_sale_events`) but throws away *who* bought it. This migration adds the
`customers` table and a nullable `customer_id` FK on the sale ledger so the app (Claude's lane) can
start stamping the customer onto each sale. Most POS sales are anonymous walk-ins → the FK stays
null for those; we only enrich orders that carry a Clover customer.

**Lane:** This is a **DB change = Lovable's lane**. Ship it as one versioned migration in
`supabase/migrations/`. The app code that fills the column is Claude's lane and lands after this
migration is live. Applying this migration alone changes nothing at runtime (new nullable column +
empty table) — it's safe to ship ahead of the app code.

Full design + rationale: `.lovable/scope-customer-profiles.md`.

## Migration to apply

```sql
-- Customer capture v1. Customers sourced from Clover orders (and manual later).
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clover_customer_id text UNIQUE,                    -- null for a manually-created customer
  first_name text,
  last_name text,
  email text,                                        -- PII
  phone text,                                        -- PII
  marketing_consent boolean NOT NULL DEFAULT false,  -- explicit only; never inferred from a sale
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

Mirrors the exact RLS helpers (`can_edit_content`, `has_role`) + `touch_updated_at` trigger already
used by `inventory_sale_events` / `clover_item_links`. `ON DELETE SET NULL` = a "forget me" delete
anonymizes past sales without losing the history.

## After it's live (Claude's lane — for reference, no action needed from Lovable)
- `clover.api.ts`: add `customers` to the orders `expand`; surface the order's customer.
- `clover.ingest.server.ts`: upsert `customers` on `clover_customer_id` per order, stamp
  `customer_id` onto each sale event (applied + needs_review paths).
- New `/customers` list + `/customers/$id` detail (purchase history + lifetime spend).

## Open question for the owner (carry into build)
- **PII visibility:** v1 makes email/phone visible to all editors. If you'd rather restrict
  email/phone to admins only (while the customer list/history stays editor-visible), say so and
  we'll split PII into an admin-only table like the `clover_credentials` pattern. Default = editor-visible.
