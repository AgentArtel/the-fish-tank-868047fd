# Handoff → Lovable: `customers_with_spend` aggregation RPC

Audit finding **C1** (scalability): `listCustomers` (`src/lib/customers.functions.ts`) loads **up to 50,000**
`inventory_sale_events` rows into the Worker and sums lifetime spend / order counts in JS on every
`/customers` load. It's correct today but **silently truncates** (and goes wrong) once the store passes
50k lifetime sale lines, and it's heavy on the Worker.

**App side is already done:** `listCustomers` now calls the RPC below and **falls back** to the old
bounded JS aggregation if the RPC isn't there yet — so shipping this migration is non-breaking and
auto-upgrades the page the moment it lands.

## Migration to add (DB lane)
```sql
CREATE OR REPLACE FUNCTION public.customers_with_spend(_q text DEFAULT NULL, _limit int DEFAULT 1000)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  marketing_consent boolean,
  last_seen_at timestamptz,
  spend_cents bigint,
  order_count bigint,
  last_purchase_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.first_name, c.last_name, c.email, c.phone, c.marketing_consent, c.last_seen_at,
    COALESCE(s.spend_cents, 0)  AS spend_cents,
    COALESCE(s.order_count, 0)  AS order_count,
    s.last_purchase_at
  FROM public.customers c
  LEFT JOIN LATERAL (
    SELECT
      SUM(e.total_cents)::bigint            AS spend_cents,
      COUNT(DISTINCT e.clover_order_id)     AS order_count,
      MAX(e.sold_at)                        AS last_purchase_at
    FROM public.inventory_sale_events e
    WHERE e.customer_id = c.id AND e.kind = 'sale'
  ) s ON true
  WHERE _q IS NULL OR (
    c.first_name ILIKE '%'||_q||'%' OR c.last_name ILIKE '%'||_q||'%'
    OR c.email ILIKE '%'||_q||'%'   OR c.phone ILIKE '%'||_q||'%'
  )
  ORDER BY COALESCE(s.spend_cents, 0) DESC
  LIMIT _limit;
$$;

REVOKE ALL ON FUNCTION public.customers_with_spend(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customers_with_spend(text, int) TO authenticated, service_role;
```

## Notes
- The per-customer aggregate is backed by the existing `inventory_sale_events (customer_id, sold_at DESC)`
  index, so the LATERAL subquery stays cheap.
- Semantics match the current JS exactly: `kind='sale'` only; `order_count` counts distinct
  `clover_order_id` (manual sales have none → not counted as orders), same as today.
- `SECURITY DEFINER` is fine — the app only calls it behind `requireEditor`, and it returns the same
  customer fields editors already read.
- Reply when applied and Claude will confirm the `/customers` list is reading from the RPC.
