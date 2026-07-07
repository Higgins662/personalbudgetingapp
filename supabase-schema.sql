-- ============================================================
-- Budget App — Complete Database Schema (v1.0)
-- 
-- This is the canonical schema reflecting the full database
-- state after all patches have been applied. Run this on a
-- fresh Supabase project to get a fully working database.
--
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ── Tables ───────────────────────────────────────────────────────────────────

-- Categories (17 user-editable + 1 system)
CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#4a4a4a',
  description text DEFAULT '',
  enabled     boolean DEFAULT true,
  is_system   boolean NOT NULL DEFAULT false,
  sort_order  int  DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Income items — template rows (label, bank account, enabled state)
-- budgeted/actual live in period_items, not here
CREATE TABLE IF NOT EXISTS income_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users NOT NULL,
  label           text NOT NULL DEFAULT '',
  note            text DEFAULT '',
  bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  enabled         boolean DEFAULT true,
  sort_order      int  DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- Expense items — template rows (monthly + annual)
-- budgeted/actual live in period_items, not here
CREATE TABLE IF NOT EXISTS expense_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users NOT NULL,
  label           text NOT NULL DEFAULT '',
  note            text DEFAULT '',
  frequency       text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'annual')),
  category_id     uuid REFERENCES categories(id) ON DELETE SET NULL,
  bank_account_id uuid REFERENCES bank_accounts(id) ON DELETE SET NULL,
  enabled         boolean DEFAULT true,
  sort_order      int  DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- Bank accounts (column mapping memory per bank)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  name        text NOT NULL,
  col_date    text DEFAULT '',
  col_desc    text DEFAULT '',
  col_amount  text DEFAULT '',
  amount_sign text DEFAULT 'negative' CHECK (amount_sign IN ('negative', 'positive')),
  created_at  timestamptz DEFAULT now()
);

-- Raw imported transactions
CREATE TABLE IF NOT EXISTS transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES auth.users NOT NULL,
  bank_account_id    uuid REFERENCES bank_accounts(id) ON DELETE CASCADE,
  date               date,
  description        text DEFAULT '',
  amount             numeric(12,2) DEFAULT 0,
  matched_expense_id uuid REFERENCES expense_items(id) ON DELETE SET NULL,
  matched_score      numeric(4,3),
  matched_source     text, -- 'rule' | 'fuzzy' | 'global' | 'manual'
  ignored            boolean DEFAULT false,
  applied            boolean DEFAULT false,
  created_at         timestamptz DEFAULT now()
);

-- Personal payee rules (learned from manual assignments)
CREATE TABLE IF NOT EXISTS payee_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users NOT NULL,
  pattern         text NOT NULL,
  expense_item_id uuid REFERENCES expense_items(id) ON DELETE CASCADE,
  hit_count       int DEFAULT 1,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, pattern)
);

-- Global anonymized payee patterns (no user_id — fully anonymized)
CREATE TABLE IF NOT EXISTS global_payee_patterns (
  pattern       text PRIMARY KEY,
  category_name text NOT NULL,
  hit_count     int  DEFAULT 1,
  updated_at    timestamptz DEFAULT now()
);

-- Savings goals
CREATE TABLE IF NOT EXISTS savings_goals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  name        text NOT NULL DEFAULT '',
  type        text NOT NULL DEFAULT 'Short-Term' CHECK (type IN ('Short-Term', 'Long-Term')),
  target      numeric(12,2) DEFAULT 0,
  saved       numeric(12,2) DEFAULT 0,
  monthly     numeric(12,2) DEFAULT 0,
  target_date date,
  sort_order  int  DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Budget periods (one per user per calendar month/year)
CREATE TABLE IF NOT EXISTS budget_periods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users NOT NULL,
  period_type  text NOT NULL CHECK (period_type IN ('monthly', 'yearly')),
  period_start date NOT NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (user_id, period_type, period_start)
);

-- Period items — budgeted/actual per item per period
CREATE TABLE IF NOT EXISTS period_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id      uuid REFERENCES budget_periods(id) ON DELETE CASCADE NOT NULL,
  user_id        uuid REFERENCES auth.users NOT NULL,
  item_id        uuid NOT NULL,
  item_type      text NOT NULL CHECK (item_type IN ('income', 'expense')),
  budgeted       numeric(12,2) DEFAULT 0,
  actual         numeric(12,2) DEFAULT 0,
  flagged        boolean DEFAULT false,
  flag_variance  numeric(12,2),
  created_at     timestamptz DEFAULT now(),
  UNIQUE (period_id, item_id)
);


-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_categories_user     ON categories     (user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_income_user          ON income_items   (user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_expense_user         ON expense_items  (user_id, frequency, sort_order);
CREATE INDEX IF NOT EXISTS idx_bank_user            ON bank_accounts  (user_id);
CREATE INDEX IF NOT EXISTS idx_tx_user_date         ON transactions   (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_bank              ON transactions   (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_tx_matched           ON transactions   (matched_expense_id);
CREATE INDEX IF NOT EXISTS idx_payee_rules_user     ON payee_rules    (user_id, pattern);
CREATE INDEX IF NOT EXISTS idx_goals_user           ON savings_goals  (user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_periods_user_type    ON budget_periods (user_id, period_type, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_period_items_period  ON period_items   (period_id);
CREATE INDEX IF NOT EXISTS idx_period_items_item    ON period_items   (item_id);


-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payee_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_items   ENABLE ROW LEVEL SECURITY;

-- global_payee_patterns: readable by all authenticated, writable only via RPC
ALTER TABLE global_payee_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read global patterns" ON global_payee_patterns FOR SELECT TO authenticated USING (true);

-- Per-user policies
DO $$ BEGIN
  FOR _t IN VALUES ('categories'),('income_items'),('expense_items'),('bank_accounts'),
                   ('transactions'),('payee_rules'),('savings_goals'),
                   ('budget_periods'),('period_items') LOOP
    EXECUTE format(
      'CREATE POLICY "select own" ON %I FOR SELECT USING (auth.uid() = user_id)',
      _t.column1
    );
    EXECUTE format(
      'CREATE POLICY "insert own" ON %I FOR INSERT WITH CHECK (auth.uid() = user_id)',
      _t.column1
    );
    EXECUTE format(
      'CREATE POLICY "update own" ON %I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      _t.column1
    );
    EXECUTE format(
      'CREATE POLICY "delete own" ON %I FOR DELETE USING (auth.uid() = user_id)',
      _t.column1
    );
  END LOOP;
END $$;


-- ── Grants ────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.income_items          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_items         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payee_rules           TO authenticated;
GRANT SELECT                         ON public.global_payee_patterns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.savings_goals         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_periods        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_items          TO authenticated;


-- ── RPC Functions ─────────────────────────────────────────────────────────────

-- Contribute anonymized payee pattern to the global pool
CREATE OR REPLACE FUNCTION contribute_payee_pattern(p_pattern text, p_category_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO global_payee_patterns (pattern, category_name, hit_count, updated_at)
  VALUES (lower(trim(p_pattern)), p_category_name, 1, now())
  ON CONFLICT (pattern) DO UPDATE
    SET hit_count  = global_payee_patterns.hit_count + 1,
        updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION contribute_payee_pattern(text, text) TO authenticated;


-- Get or create a budget period, rolling forward with over/under flagging
CREATE OR REPLACE FUNCTION get_or_create_period(
  p_user_id      uuid,
  p_period_type  text,
  p_period_start date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id      uuid;
  v_prev_period_id uuid;
  v_item           RECORD;
  v_variance_pct   numeric;
BEGIN
  IF auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT id INTO v_period_id
  FROM budget_periods
  WHERE user_id = p_user_id AND period_type = p_period_type AND period_start = p_period_start;

  IF v_period_id IS NOT NULL THEN RETURN v_period_id; END IF;

  SELECT id INTO v_prev_period_id
  FROM budget_periods
  WHERE user_id = p_user_id AND period_type = p_period_type AND period_start < p_period_start
  ORDER BY period_start DESC LIMIT 1;

  INSERT INTO budget_periods (user_id, period_type, period_start)
  VALUES (p_user_id, p_period_type, p_period_start)
  RETURNING id INTO v_period_id;

  IF v_prev_period_id IS NOT NULL THEN
    FOR v_item IN
      SELECT item_id, item_type, budgeted, actual FROM period_items WHERE period_id = v_prev_period_id
    LOOP
      v_variance_pct := NULL;
      IF v_item.budgeted > 0 THEN
        v_variance_pct := ROUND(((v_item.actual - v_item.budgeted) / v_item.budgeted) * 100, 1);
      END IF;
      INSERT INTO period_items (period_id, user_id, item_id, item_type, budgeted, actual, flagged, flag_variance)
      VALUES (v_period_id, p_user_id, v_item.item_id, v_item.item_type, v_item.budgeted, 0,
              (v_variance_pct IS NOT NULL AND v_variance_pct > 15), v_variance_pct);
    END LOOP;
  ELSE
    INSERT INTO period_items (period_id, user_id, item_id, item_type, budgeted, actual)
    SELECT v_period_id, p_user_id, id, 'income', 0, 0 FROM income_items WHERE user_id = p_user_id;
    IF p_period_type = 'monthly' THEN
      INSERT INTO period_items (period_id, user_id, item_id, item_type, budgeted, actual)
      SELECT v_period_id, p_user_id, id, 'expense', 0, 0 FROM expense_items WHERE user_id = p_user_id AND frequency = 'monthly';
    ELSE
      INSERT INTO period_items (period_id, user_id, item_id, item_type, budgeted, actual)
      SELECT v_period_id, p_user_id, id, 'expense', 0, 0 FROM expense_items WHERE user_id = p_user_id AND frequency = 'annual';
    END IF;
  END IF;

  RETURN v_period_id;
END;
$$;
GRANT EXECUTE ON FUNCTION get_or_create_period(uuid, text, date) TO authenticated;


-- Ensure a period_items row exists for a newly-added item mid-period
CREATE OR REPLACE FUNCTION ensure_period_item(
  p_user_id   uuid,
  p_item_id   uuid,
  p_item_type text,
  p_frequency text DEFAULT 'monthly'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_type text;
  v_period_id   uuid;
BEGIN
  IF auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_period_type := CASE WHEN p_frequency = 'annual' THEN 'yearly' ELSE 'monthly' END;
  SELECT id INTO v_period_id
  FROM budget_periods
  WHERE user_id = p_user_id AND period_type = v_period_type
  ORDER BY period_start DESC LIMIT 1;
  IF v_period_id IS NOT NULL THEN
    INSERT INTO period_items (period_id, user_id, item_id, item_type, budgeted, actual)
    VALUES (v_period_id, p_user_id, p_item_id, p_item_type, 0, 0)
    ON CONFLICT (period_id, item_id) DO NOTHING;
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION ensure_period_item(uuid, uuid, text, text) TO authenticated;


-- Apply matched transactions to current period's actuals
CREATE OR REPLACE FUNCTION apply_transactions_to_budget(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense_updates int := 0;
  v_income_updates  int := 0;
  v_tx_applied      int := 0;
  v_unmatched       int := 0;
  v_unmatched_total numeric := 0;
  v_month_period_id uuid;
BEGIN
  IF auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  v_month_period_id := get_or_create_period(p_user_id, 'monthly', date_trunc('month', now())::date);

  WITH sums AS (
    SELECT matched_expense_id AS item_id, SUM(ABS(amount)) AS total
    FROM transactions
    WHERE user_id = p_user_id AND applied = false AND ignored = false
      AND amount < 0 AND matched_expense_id IS NOT NULL
    GROUP BY matched_expense_id
  )
  UPDATE period_items pi SET actual = COALESCE(pi.actual, 0) + s.total
  FROM sums s
  WHERE pi.item_id = s.item_id AND pi.item_type = 'expense'
    AND pi.period_id = v_month_period_id AND pi.user_id = p_user_id;
  GET DIAGNOSTICS v_expense_updates = ROW_COUNT;

  WITH sums AS (
    SELECT matched_expense_id AS item_id, SUM(amount) AS total
    FROM transactions
    WHERE user_id = p_user_id AND applied = false AND ignored = false
      AND amount > 0 AND matched_expense_id IS NOT NULL
    GROUP BY matched_expense_id
  )
  UPDATE period_items pi SET actual = COALESCE(pi.actual, 0) + s.total
  FROM sums s
  WHERE pi.item_id = s.item_id AND pi.item_type = 'income'
    AND pi.period_id = v_month_period_id AND pi.user_id = p_user_id;
  GET DIAGNOSTICS v_income_updates = ROW_COUNT;

  UPDATE transactions SET applied = true
  WHERE user_id = p_user_id AND applied = false AND ignored = false
    AND matched_expense_id IS NOT NULL;
  GET DIAGNOSTICS v_tx_applied = ROW_COUNT;

  SELECT COUNT(*), COALESCE(SUM(ABS(amount)), 0)
  INTO v_unmatched, v_unmatched_total
  FROM transactions
  WHERE user_id = p_user_id AND applied = false AND ignored = false
    AND matched_expense_id IS NULL;

  RETURN json_build_object(
    'expense_items_updated', v_expense_updates,
    'income_items_updated',  v_income_updates,
    'transactions_applied',  v_tx_applied,
    'unmatched_count',       v_unmatched,
    'unmatched_total',       v_unmatched_total,
    'period_id',             v_month_period_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION apply_transactions_to_budget(uuid) TO authenticated;


-- Clear current month's import (delete transactions, reset actuals)
CREATE OR REPLACE FUNCTION clear_month_import(
  p_user_id     uuid,
  p_month_start date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start date;
  v_month_end   date;
  v_period_id   uuid;
  v_tx_deleted  int := 0;
  v_items_reset int := 0;
BEGIN
  IF auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  v_month_start := COALESCE(p_month_start, date_trunc('month', now())::date);
  v_month_end   := (v_month_start + INTERVAL '1 month - 1 day')::date;

  DELETE FROM transactions
  WHERE user_id = p_user_id AND date >= v_month_start AND date <= v_month_end;
  GET DIAGNOSTICS v_tx_deleted = ROW_COUNT;

  SELECT id INTO v_period_id
  FROM budget_periods
  WHERE user_id = p_user_id AND period_type = 'monthly' AND period_start = v_month_start;

  IF v_period_id IS NOT NULL THEN
    UPDATE period_items SET actual = 0
    WHERE period_id = v_period_id AND user_id = p_user_id;
    GET DIAGNOSTICS v_items_reset = ROW_COUNT;
  END IF;

  RETURN json_build_object(
    'transactions_deleted', v_tx_deleted,
    'period_items_reset',   v_items_reset,
    'month',                to_char(v_month_start, 'Month YYYY')
  );
END;
$$;
GRANT EXECUTE ON FUNCTION clear_month_import(uuid, date) TO authenticated;


-- Soft reset: wipe all budget data, keep bank accounts + auth
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
BEGIN
  IF auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM transactions  WHERE user_id = p_user_id; GET DIAGNOSTICS v_tx_deleted = ROW_COUNT;
  DELETE FROM period_items  WHERE user_id = p_user_id; GET DIAGNOSTICS v_items_deleted = ROW_COUNT;
  DELETE FROM budget_periods WHERE user_id = p_user_id; GET DIAGNOSTICS v_periods_deleted = ROW_COUNT;
  DELETE FROM income_items  WHERE user_id = p_user_id;
  DELETE FROM expense_items WHERE user_id = p_user_id;
  DELETE FROM savings_goals WHERE user_id = p_user_id; GET DIAGNOSTICS v_goals_deleted = ROW_COUNT;
  DELETE FROM payee_rules   WHERE user_id = p_user_id; GET DIAGNOSTICS v_rules_deleted = ROW_COUNT;
  DELETE FROM categories    WHERE user_id = p_user_id AND is_system = false; GET DIAGNOSTICS v_cats_deleted = ROW_COUNT;
  RETURN json_build_object(
    'transactions_deleted', v_tx_deleted,
    'period_items_deleted', v_items_deleted,
    'periods_deleted',      v_periods_deleted,
    'goals_deleted',        v_goals_deleted,
    'rules_deleted',        v_rules_deleted,
    'categories_deleted',   v_cats_deleted,
    'bank_accounts_kept',   true
  );
END;
$$;
GRANT EXECUTE ON FUNCTION soft_reset_budget(uuid) TO authenticated;


-- Delete user account: all data + auth record
CREATE OR REPLACE FUNCTION delete_user_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  DELETE FROM transactions   WHERE user_id = p_user_id;
  DELETE FROM payee_rules    WHERE user_id = p_user_id;
  DELETE FROM bank_accounts  WHERE user_id = p_user_id;
  DELETE FROM period_items   WHERE user_id = p_user_id;
  DELETE FROM budget_periods WHERE user_id = p_user_id;
  DELETE FROM expense_items  WHERE user_id = p_user_id;
  DELETE FROM income_items   WHERE user_id = p_user_id;
  DELETE FROM savings_goals  WHERE user_id = p_user_id;
  DELETE FROM categories     WHERE user_id = p_user_id;
  DELETE FROM auth.users     WHERE id = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_user_account(uuid) TO authenticated;


-- ── Export Views (RLS via underlying tables) ──────────────────────────────────

CREATE OR REPLACE VIEW export_transactions AS
SELECT t.date, t.description, t.amount,
       ba.name AS bank_account,
       ei.label AS matched_budget_item,
       c.name AS category,
       t.applied, t.ignored, t.created_at
FROM transactions t
LEFT JOIN bank_accounts ba ON ba.id = t.bank_account_id
LEFT JOIN expense_items  ei ON ei.id = t.matched_expense_id
LEFT JOIN categories      c  ON c.id  = ei.category_id
WHERE t.user_id = auth.uid()
ORDER BY t.date DESC;

CREATE OR REPLACE VIEW export_budget AS
SELECT 'income' AS type, ii.label, NULL AS category, NULL AS frequency,
       pi.budgeted, pi.actual, ii.note, ii.enabled, ii.created_at
FROM income_items ii
LEFT JOIN budget_periods bp ON bp.user_id = ii.user_id AND bp.period_type = 'monthly'
  AND bp.period_start = date_trunc('month', now())::date
LEFT JOIN period_items pi ON pi.item_id = ii.id AND pi.period_id = bp.id
WHERE ii.user_id = auth.uid()
UNION ALL
SELECT 'expense' AS type, ei.label, c.name AS category, ei.frequency,
       pi.budgeted, pi.actual, ei.note, ei.enabled, ei.created_at
FROM expense_items ei
LEFT JOIN categories c ON c.id = ei.category_id
LEFT JOIN budget_periods bp ON bp.user_id = ei.user_id
  AND bp.period_type = CASE WHEN ei.frequency = 'annual' THEN 'yearly' ELSE 'monthly' END
  AND bp.period_start = CASE WHEN ei.frequency = 'annual'
    THEN date_trunc('year', now())::date
    ELSE date_trunc('month', now())::date END
LEFT JOIN period_items pi ON pi.item_id = ei.id AND pi.period_id = bp.id
WHERE ei.user_id = auth.uid()
ORDER BY type, label;

CREATE OR REPLACE VIEW export_goals AS
SELECT name, type, target, saved, monthly, target_date, created_at
FROM savings_goals WHERE user_id = auth.uid() ORDER BY sort_order;

CREATE OR REPLACE VIEW export_categories AS
SELECT name, color, description, enabled, is_system, sort_order
FROM categories WHERE user_id = auth.uid() ORDER BY sort_order;

GRANT SELECT ON export_transactions TO authenticated;
GRANT SELECT ON export_budget       TO authenticated;
GRANT SELECT ON export_goals        TO authenticated;
GRANT SELECT ON export_categories   TO authenticated;


-- ── Seed system category for new users ───────────────────────────────────────
-- Note: The app seeds the 17 standard categories + this system category
-- via JavaScript (seed.js) during onboarding. This block is a reference
-- only — in production, categories are created per-user by the app, not
-- by a global seed here.
--
-- System category definition:
--   name:       'Transfers & Payments'
--   color:      '#888888'
--   enabled:    false
--   is_system:  true
--   sort_order: 999
