-- ============================================================
-- Transaction Reassignment
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Atomically reassigns a transaction to a new budget item.
-- If the transaction was already applied, reverses the old
-- actual and adds to the new item's actual in the same period.
-- If unmatched/unapplied, just updates matched_expense_id.

CREATE OR REPLACE FUNCTION reassign_transaction(
  p_user_id            uuid,
  p_tx_id              uuid,
  p_new_expense_item_id uuid  -- pass NULL to unmatch
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx              RECORD;
  v_period_id       uuid;
  v_month_start     date;
  v_old_item_id     uuid;
  v_reversed        boolean := false;
  v_applied_new     boolean := false;
BEGIN
  IF auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Load the transaction
  SELECT * INTO v_tx
  FROM transactions
  WHERE id = p_tx_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  v_old_item_id := v_tx.matched_expense_id;

  -- If already applied, reverse the old actual and apply to new
  IF v_tx.applied AND v_old_item_id IS NOT NULL THEN
    -- Find which period this transaction belongs to
    v_month_start := date_trunc('month', v_tx.date)::date;

    SELECT id INTO v_period_id
    FROM budget_periods
    WHERE user_id = p_user_id
      AND period_type = 'monthly'
      AND period_start = v_month_start;

    IF v_period_id IS NOT NULL THEN
      -- Reverse from old item
      UPDATE period_items
      SET actual = GREATEST(0, actual - ABS(v_tx.amount))
      WHERE period_id = v_period_id
        AND item_id   = v_old_item_id
        AND user_id   = p_user_id;

      v_reversed := true;

      -- Apply to new item (if not unmatching)
      IF p_new_expense_item_id IS NOT NULL THEN
        UPDATE period_items
        SET actual = actual + ABS(v_tx.amount)
        WHERE period_id = v_period_id
          AND item_id   = p_new_expense_item_id
          AND user_id   = p_user_id;

        v_applied_new := true;
      END IF;
    END IF;
  END IF;

  -- Update the transaction itself
  UPDATE transactions
  SET matched_expense_id = p_new_expense_item_id,
      -- If unmatching, mark as unapplied so user can re-apply later
      applied = CASE
        WHEN p_new_expense_item_id IS NULL THEN false
        ELSE applied
      END
  WHERE id = p_tx_id AND user_id = p_user_id;

  RETURN json_build_object(
    'reversed',     v_reversed,
    'applied_new',  v_applied_new,
    'period_id',    v_period_id,
    'old_item_id',  v_old_item_id,
    'new_item_id',  p_new_expense_item_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reassign_transaction(uuid, uuid, uuid) TO authenticated;
