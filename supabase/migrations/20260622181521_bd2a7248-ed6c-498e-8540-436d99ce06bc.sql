
-- ============================================================
-- Store Credit Ledger (real owed money — separate from loyalty)
-- ============================================================

CREATE TABLE public.store_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('grant','redeem','adjust','refund_reversal')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  source text NOT NULL CHECK (source IN ('trade_in','return','refund','manual','goodwill')),
  related_ref text,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX store_credit_ledger_customer_idx
  ON public.store_credit_ledger(customer_id, created_at DESC);

GRANT SELECT ON public.store_credit_ledger TO authenticated;
GRANT ALL ON public.store_credit_ledger TO service_role;

ALTER TABLE public.store_credit_ledger ENABLE ROW LEVEL SECURITY;

-- Floor-staff+ can read; all mutations must go through SECURITY DEFINER RPCs.
CREATE POLICY "Floor staff or above can read store credit"
  ON public.store_credit_ledger
  FOR SELECT
  TO authenticated
  USING (public.is_floor_staff_or_above(auth.uid()));

CREATE POLICY "Block direct inserts to store credit ledger"
  ON public.store_credit_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "Block direct updates to store credit ledger"
  ON public.store_credit_ledger
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Block direct deletes to store credit ledger"
  ON public.store_credit_ledger
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================
-- RPC: store_credit_summary
-- ============================================================
CREATE OR REPLACE FUNCTION public.store_credit_summary(_customer_id uuid)
RETURNS TABLE(balance_cents bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT SUM(
      CASE
        WHEN kind IN ('grant','refund_reversal') THEN amount_cents
        WHEN kind = 'redeem' THEN -amount_cents
        WHEN kind = 'adjust' THEN amount_cents  -- adjust uses signed semantics via separate positive/negative rows; see adjust_store_credit
        ELSE 0
      END
    )::bigint
    FROM public.store_credit_ledger
    WHERE customer_id = _customer_id
  ), 0) AS balance_cents;
$$;

-- ============================================================
-- RPC: grant_store_credit (floor-staff-or-above)
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_store_credit(
  _customer_id uuid,
  _amount_cents integer,
  _source text,
  _reason text DEFAULT NULL,
  _related_ref text DEFAULT NULL
)
RETURNS public.store_credit_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.store_credit_ledger;
BEGIN
  IF v_uid IS NULL OR NOT public.is_floor_staff_or_above(v_uid) THEN
    RAISE EXCEPTION 'Forbidden: floor-staff role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Grant amount must be a positive integer (cents)';
  END IF;
  IF _source IS NULL OR _source NOT IN ('trade_in','return','refund','manual','goodwill') THEN
    RAISE EXCEPTION 'Invalid source: %', _source;
  END IF;

  PERFORM 1 FROM public.customers WHERE id = _customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer % not found', _customer_id;
  END IF;

  INSERT INTO public.store_credit_ledger
    (customer_id, kind, amount_cents, source, related_ref, reason, created_by)
  VALUES
    (_customer_id, 'grant', _amount_cents, _source, _related_ref, _reason, v_uid)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ============================================================
-- RPC: redeem_store_credit (floor-staff-or-above, atomic)
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_store_credit(
  _customer_id uuid,
  _amount_cents integer,
  _reason text DEFAULT NULL,
  _related_ref text DEFAULT NULL
)
RETURNS public.store_credit_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_row public.store_credit_ledger;
BEGIN
  IF v_uid IS NULL OR NOT public.is_floor_staff_or_above(v_uid) THEN
    RAISE EXCEPTION 'Forbidden: floor-staff role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Redemption amount must be a positive integer (cents)';
  END IF;

  PERFORM 1 FROM public.customers WHERE id = _customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer % not found', _customer_id;
  END IF;

  SELECT balance_cents INTO v_balance
  FROM public.store_credit_summary(_customer_id);

  IF v_balance < _amount_cents THEN
    RAISE EXCEPTION 'Insufficient store credit: balance % < requested %', v_balance, _amount_cents
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.store_credit_ledger
    (customer_id, kind, amount_cents, source, related_ref, reason, created_by)
  VALUES
    (_customer_id, 'redeem', _amount_cents, 'manual', _related_ref, _reason, v_uid)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ============================================================
-- RPC: adjust_store_credit (admin/dev-only)
-- _amount_cents may be negative for write-down; positive for correction up.
-- Stored as a positive amount_cents with a synthetic redeem when negative.
-- ============================================================
CREATE OR REPLACE FUNCTION public.adjust_store_credit(
  _customer_id uuid,
  _amount_cents integer,
  _reason text,
  _related_ref text DEFAULT NULL
)
RETURNS public.store_credit_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance bigint;
  v_row public.store_credit_ledger;
  v_kind text;
  v_abs integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_dev(v_uid) THEN
    RAISE EXCEPTION 'Forbidden: admin or dev role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents = 0 THEN
    RAISE EXCEPTION 'Adjustment amount must be a non-zero integer (cents)';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'Adjustment reason is required';
  END IF;

  PERFORM 1 FROM public.customers WHERE id = _customer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer % not found', _customer_id;
  END IF;

  v_abs := ABS(_amount_cents);

  IF _amount_cents > 0 THEN
    v_kind := 'adjust';  -- positive adjust (correction up)
  ELSE
    -- Negative adjust: re-check balance to prevent driving below zero.
    SELECT balance_cents INTO v_balance FROM public.store_credit_summary(_customer_id);
    IF v_balance < v_abs THEN
      RAISE EXCEPTION 'Adjustment would overdraw: balance % < write-down %', v_balance, v_abs
        USING ERRCODE = 'check_violation';
    END IF;
    v_kind := 'redeem';  -- write-down recorded as redeem with adjust source
  END IF;

  INSERT INTO public.store_credit_ledger
    (customer_id, kind, amount_cents, source, related_ref, reason, created_by)
  VALUES
    (_customer_id, v_kind, v_abs, 'manual', _related_ref, _reason, v_uid)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Note: store_credit_summary above treats `adjust` rows as positive contributions.
-- Negative adjustments are stored as `redeem` rows (subtracted), so the summary remains correct.

GRANT EXECUTE ON FUNCTION public.store_credit_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_store_credit(uuid, integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_store_credit(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_store_credit(uuid, integer, text, text) TO authenticated;
