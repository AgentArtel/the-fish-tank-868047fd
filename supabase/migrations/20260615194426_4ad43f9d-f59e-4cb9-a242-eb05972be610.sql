
-- 1. Sign/kind CHECK on loyalty_ledger
ALTER TABLE public.loyalty_ledger
  ADD CONSTRAINT loyalty_ledger_sign_kind_chk CHECK (
    (kind IN ('redeem','expire') AND amount_cents <= 0) OR
    (kind IN ('earn','bonus','doa') AND amount_cents >= 0) OR
    (kind = 'adjust')
  );

-- 2. Tighten INSERT RLS by kind
DROP POLICY IF EXISTS "Editors insert loyalty_ledger" ON public.loyalty_ledger;

CREATE POLICY "Editors insert loyalty_ledger earn"
  ON public.loyalty_ledger FOR INSERT TO authenticated
  WITH CHECK (kind = 'earn' AND public.can_edit_content(auth.uid()));

CREATE POLICY "Admins insert loyalty_ledger any"
  ON public.loyalty_ledger FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Atomic redemption RPC
CREATE OR REPLACE FUNCTION public.loyalty_redeem(
  _customer_id uuid,
  _amount_cents integer,
  _channel text DEFAULT 'in_store',
  _reason text DEFAULT NULL
) RETURNS public.loyalty_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance integer;
  v_row public.loyalty_ledger;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Only admins can redeem Reef Credit' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Redemption amount must be a positive integer (cents)';
  END IF;

  -- Lock the customer row to serialize concurrent redemptions
  PERFORM 1 FROM public.customers WHERE id = _customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer % not found', _customer_id;
  END IF;

  -- Re-check balance in-transaction
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_balance
  FROM public.loyalty_ledger
  WHERE customer_id = _customer_id;

  IF v_balance < _amount_cents THEN
    RAISE EXCEPTION 'Insufficient Reef Credit: balance % < requested %', v_balance, _amount_cents
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.loyalty_ledger (customer_id, kind, amount_cents, channel, reason, created_by)
  VALUES (_customer_id, 'redeem', -_amount_cents, _channel, _reason, v_uid)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.loyalty_redeem(uuid, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.loyalty_redeem(uuid, integer, text, text) TO authenticated, service_role;

-- 4. Aggregation RPC: balance + rolling-12mo spend
CREATE OR REPLACE FUNCTION public.customer_loyalty_summary(_customer_id uuid)
RETURNS TABLE (balance_cents bigint, annual_spend_cents bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((
      SELECT SUM(amount_cents)::bigint
      FROM public.loyalty_ledger
      WHERE customer_id = _customer_id
    ), 0) AS balance_cents,
    COALESCE((
      SELECT SUM(total_cents)::bigint
      FROM public.inventory_sale_events
      WHERE customer_id = _customer_id
        AND kind = 'sale'
        AND sold_at >= now() - interval '12 months'
    ), 0) AS annual_spend_cents;
$$;

REVOKE ALL ON FUNCTION public.customer_loyalty_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_loyalty_summary(uuid) TO authenticated, service_role;

-- 5. Reporting index for completed sales
CREATE INDEX IF NOT EXISTS inventory_sale_events_sold_at_sale_idx
  ON public.inventory_sale_events (sold_at DESC)
  WHERE kind = 'sale';

-- 6. Schedule Clover sales poll
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clover-poll') THEN
    PERFORM cron.unschedule('clover-poll');
  END IF;
END $$;

SELECT cron.schedule(
  'clover-poll',
  '*/10 * * * *', -- every 10 minutes
  $cron$
  SELECT net.http_post(
    url     := 'https://the-fish-tank.lovable.app/api/public/hooks/clover-poll',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SCRAPE_CRON_SECRET')
               ),
    body    := '{}'::jsonb
  );
  $cron$
);
