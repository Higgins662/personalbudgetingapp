-- ============================================================
-- Fix apply_transactions_to_budget: route each transaction to
-- the period its DATE belongs to, not the current calendar month
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================
-- Fixes:
--   1. September transactions applied in October now land in
--      September's period (per-transaction date_trunc routing)
--   2. Transactions matched to ANNUAL items now apply to the
--      yearly period (previously the amount silently vanished)
--   3. Missing period_items are created on the fly instead of
--      the update silently matching nothing
--   4. Income deposits (matched_source='income') get marked
--      applied so they stop counting as "unmatched"
--   5. unmatched_count now only counts expense debits

CREATE OR REPLACE FUNCTION apply_transactions_to_budget(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx              RECORD;
  v_period_id       uuid;
  v_ptype           text;
  v_pstart          date;
  v_expense_updates int := 0;
  v_tx_applied      int := 0;
  v_income_applied  int := 0;
  v_unmatched       int := 0;
  v_unmatched_total numeric := 0;
BEGIN
  IF auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Expense debits: apply each to the period its own date falls in.
  -- Monthly items → that month's period; annual items → that year's period.
  FOR v_tx IN
    SELECT t.id, t.amount, t.date, t.matched_expense_id, ei.frequency
    FROM transactions t
    JOIN expense_items ei ON ei.id = t.matched_expense_id
    WHERE t.user_id = p_user_id
      AND t.applied = false
      AND t.ignored = false
      AND t.amount  < 0
      AND t.matched_expense_id IS NOT NULL
    ORDER BY t.date
  LOOP
    IF v_tx.frequency = 'annual' THEN
      v_ptype  := 'yearly';
      v_pstart := date_trunc('year', v_tx.date)::date;
    ELSE
      v_ptype  := 'monthly';
      v_pstart := date_trunc('month', v_tx.date)::date;
    END IF;

    v_period_id := get_or_create_period(p_user_id, v_ptype, v_pstart);

    -- Make sure the row exists (older periods may pre-date this item)
    INSERT INTO period_items (period_id, user_id, item_id, item_type, budgeted, actual)
    VALUES (v_period_id, p_user_id, v_tx.matched_expense_id, 'expense', 0, 0)
    ON CONFLICT (period_id, item_id) DO NOTHING;

    UPDATE period_items
    SET actual = COALESCE(actual, 0) + ABS(v_tx.amount)
    WHERE period_id = v_period_id
      AND item_id   = v_tx.matched_expense_id
      AND user_id   = p_user_id;
    v_expense_updates := v_expense_updates + 1;

    UPDATE transactions SET applied = true WHERE id = v_tx.id;
    v_tx_applied := v_tx_applied + 1;
  END LOOP;

  -- Income deposits identified during import are informational —
  -- mark them applied so they stop showing as pending/unmatched
  UPDATE transactions SET applied = true
  WHERE user_id = p_user_id
    AND applied = false
    AND ignored = false
    AND amount  > 0
    AND matched_source = 'income';
  GET DIAGNOSTICS v_income_applied = ROW_COUNT;

  -- Unmatched = expense debits with no budget item assigned
  SELECT COUNT(*), COALESCE(SUM(ABS(amount)), 0)
  INTO v_unmatched, v_unmatched_total
  FROM transactions
  WHERE user_id = p_user_id
    AND applied = false
    AND ignored = false
    AND amount  < 0
    AND matched_expense_id IS NULL;

  RETURN json_build_object(
    'expense_items_updated', v_expense_updates,
    'income_items_updated',  v_income_applied,
    'transactions_applied',  v_tx_applied,
    'unmatched_count',       v_unmatched,
    'unmatched_total',       v_unmatched_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_transactions_to_budget(uuid) TO authenticated;
