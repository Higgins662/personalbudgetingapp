-- ============================================================
-- Update soft_reset_budget to also clear bank accounts
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

CREATE OR REPLACE FUNCTION soft_reset_budget(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_deleted      int := 0;
  v_periods_deleted int := 0;
  v_items_deleted   int := 0;
  v_goals_deleted   int := 0;
  v_rules_deleted   int := 0;
  v_cats_deleted    int := 0;
  v_banks_deleted   int := 0;
BEGIN
  IF auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM transactions   WHERE user_id = p_user_id; GET DIAGNOSTICS v_tx_deleted = ROW_COUNT;
  DELETE FROM period_items   WHERE user_id = p_user_id; GET DIAGNOSTICS v_items_deleted = ROW_COUNT;
  DELETE FROM budget_periods WHERE user_id = p_user_id; GET DIAGNOSTICS v_periods_deleted = ROW_COUNT;
  DELETE FROM income_items   WHERE user_id = p_user_id;
  DELETE FROM expense_items  WHERE user_id = p_user_id;
  DELETE FROM savings_goals  WHERE user_id = p_user_id; GET DIAGNOSTICS v_goals_deleted = ROW_COUNT;
  DELETE FROM payee_rules    WHERE user_id = p_user_id; GET DIAGNOSTICS v_rules_deleted = ROW_COUNT;
  DELETE FROM categories     WHERE user_id = p_user_id AND is_system = false; GET DIAGNOSTICS v_cats_deleted = ROW_COUNT;
  DELETE FROM bank_accounts  WHERE user_id = p_user_id; GET DIAGNOSTICS v_banks_deleted = ROW_COUNT;
  RETURN json_build_object(
    'transactions_deleted',  v_tx_deleted,
    'period_items_deleted',  v_items_deleted,
    'periods_deleted',       v_periods_deleted,
    'goals_deleted',         v_goals_deleted,
    'rules_deleted',         v_rules_deleted,
    'categories_deleted',    v_cats_deleted,
    'bank_accounts_deleted', v_banks_deleted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION soft_reset_budget(uuid) TO authenticated;
