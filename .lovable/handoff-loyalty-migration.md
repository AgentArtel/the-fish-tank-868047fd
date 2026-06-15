# Handoff → Lovable: Reef Club loyalty tables (loyalty_config + loyalty_ledger)

**Why:** We're building "The Reef Club" loyalty program. v1 is the **Reef Credit + Tiers backbone**:
customers earn store credit (Reef Credit) on Clover purchases, hold a status tier, and redeem credit
**at the store's live coral auctions** (and in-store). Earn/balance/redemption all live in an
append-only ledger. Full design: `.lovable/scope-loyalty-program-v2.md`.

**Lane:** DB change = **Lovable's lane** — one versioned migration in `supabase/migrations/`. Safe to
ship ahead of the app code (new empty tables + a nullable column; changes nothing at runtime). The
app code that writes/reads these is Claude's lane and lands after.

## Migration to apply

```sql
-- Reef Club — single-row config (mirrors clover_connection / clover_credentials pattern)
CREATE TABLE public.loyalty_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  earn_percent numeric NOT NULL DEFAULT 5,            -- % of sale total earned as Reef Credit
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,           -- [{name,min_annual_cents,earn_multiplier,perks[]}]
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reef Credit ledger: balance = SUM(amount_cents) per customer. Append-only.
CREATE TABLE public.loyalty_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('earn','redeem','doa','bonus','adjust','expire')),
  amount_cents integer NOT NULL,                      -- + earns, − redemptions
  channel text,                                       -- 'live_sale' | 'in_store' | 'online' | null
  reason text,
  sale_event_id uuid REFERENCES public.inventory_sale_events(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sale_event_id, kind)                        -- idempotent earn per sale line
);

CREATE INDEX loyalty_ledger_customer_idx
  ON public.loyalty_ledger (customer_id, created_at DESC);

-- Explicit "joined the club" moment (optional but nice for the enrollment hook)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS reef_club_enrolled_at timestamptz;

-- Grants + RLS mirror inventory_sale_events (editors read/insert; admins update/delete)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_ledger TO authenticated;
GRANT ALL ON public.loyalty_ledger TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.loyalty_config TO authenticated;
GRANT ALL ON public.loyalty_config TO service_role;

ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors view loyalty_ledger"   ON public.loyalty_ledger FOR SELECT
  TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "Editors insert loyalty_ledger" ON public.loyalty_ledger FOR INSERT
  TO authenticated WITH CHECK (public.can_edit_content(auth.uid()));
CREATE POLICY "Admins update loyalty_ledger"  ON public.loyalty_ledger FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete loyalty_ledger"  ON public.loyalty_ledger FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Editors view loyalty_config"   ON public.loyalty_config FOR SELECT
  TO authenticated USING (public.can_edit_content(auth.uid()));
CREATE POLICY "Admins insert loyalty_config"  ON public.loyalty_config FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update loyalty_config"  ON public.loyalty_config FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed the single config row (disabled until we flip it on)
INSERT INTO public.loyalty_config (id, enabled) VALUES (true, false);
```

Reuses the exact RLS helpers (`can_edit_content`, `has_role`) and the single-row-config pattern
already used by `clover_connection` / `clover_credentials`. Badges and tiers are **derived in app
code** (no storage) — only the credit currency needs tables.

## After it's live (Claude's lane — for reference)
- Earn: write an `earn` ledger row per member sale during Clover sync (idempotent via the unique
  constraint); backfill on the wide manual sync.
- Derive tier (rolling-12-mo spend) + Reef Passport badges (`classifyCoralType` over the member's sales).
- Reef Club card on `/customers/$id`: tier, balance, badges; admin **Add credit / Record redemption
  (channel: live_sale / in_store) / Approve DOA** actions.

## Owner still finalizing (doesn't block the migration)
Tier names/thresholds/perks and exact earn % live in `loyalty_config` and are editable anytime — the
migration just seeds defaults (5%, empty tiers, disabled).
