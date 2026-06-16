
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
