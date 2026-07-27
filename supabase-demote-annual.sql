-- ============================================================
-- Demote an annual expense_item back to monthly
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================
-- Atomically:
--   1. Finds (or creates) the monthly category-level expense_item
--      for the annual item's category
--   2. Reassigns every transaction on the annual item to it
--   3. Adds each applied transaction's amount back into the correct
--      month's period_item actual
--   4. Repoints payee_rules from the annual item to the monthly item
--      (so learned matches keep working)
--   5. Deletes the annual item and its yearly period_items

CREATE OR REPLACE FUNCTION demote_annual_item(
  p_user_id uuid,
  p_item_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item            RECORD;
  v_monthly_item_id uuid;
  v_tx              RECORD;
  v_month_period    uuid;
  v_moved           int := 0;
BEGIN
  IF auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_item
  FROM expense_items
  WHERE id = p_item_id AND user_id = p_user_id AND frequency = 'annual';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Annual item not found';
  END IF;

  -- Find the monthly category-level item for this category
  SELECT id INTO v_monthly_item_id
  FROM expense_items
  WHERE user_id = p_user_id
    AND category_id = v_item.category_id
    AND frequency = 'monthly'
  ORDER BY sort_order
  LIMIT 1;

  -- Create one if the category has no monthly item
  IF v_monthly_item_id IS NULL THEN
    INSERT INTO expense_items (user_id, label, category_id, note, frequency, enabled, sort_order)
    SELECT p_user_id, c.name, c.id, '', 'monthly', true, 999
    FROM categories c
    WHERE c.id = v_item.category_id
    RETURNING id INTO v_monthly_item_id;
  END IF;

  IF v_monthly_item_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve monthly item for category';
  END IF;

  -- Move every transaction from the annual item to the monthly item
  FOR v_tx IN
    SELECT * FROM transactions
    WHERE user_id = p_user_id AND matched_expense_id = p_item_id
  LOOP
    UPDATE transactions
    SET matched_expense_id = v_monthly_item_id
    WHERE id = v_tx.id;

    -- Fold applied amounts back into that month's actuals
    IF v_tx.applied THEN
      SELECT id INTO v_month_period
      FROM budget_periods
      WHERE user_id = p_user_id
        AND period_type = 'monthly'
        AND period_start = date_trunc('month', v_tx.date)::date;

      IF v_month_period IS NOT NULL THEN
        INSERT INTO period_items (period_id, user_id, item_id, item_type, budgeted, actual)
        VALUES (v_month_period, p_user_id, v_monthly_item_id, 'expense', 0, 0)
        ON CONFLICT (period_id, item_id) DO NOTHING;

        UPDATE period_items
        SET actual = actual + ABS(v_tx.amount)
        WHERE period_id = v_month_period
          AND item_id   = v_monthly_item_id
          AND user_id   = p_user_id;
      END IF;
    END IF;

    v_moved := v_moved + 1;
  END LOOP;

  -- Keep learned payee rules working by repointing them
  UPDATE payee_rules
  SET expense_item_id = v_monthly_item_id
  WHERE user_id = p_user_id AND expense_item_id = p_item_id;

  -- Remove the annual item and its yearly period rows
  DELETE FROM period_items  WHERE item_id = p_item_id AND user_id = p_user_id;
  DELETE FROM expense_items WHERE id = p_item_id AND user_id = p_user_id;

  RETURN json_build_object(
    'transactions_moved', v_moved,
    'monthly_item_id',    v_monthly_item_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION demote_annual_item(uuid, uuid) TO authenticated;
