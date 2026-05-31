-- ============================================================
-- Budget App — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#4a4a4a',
  description text DEFAULT '',
  enabled     boolean DEFAULT true,
  sort_order  int  DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Income items
CREATE TABLE IF NOT EXISTS income_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  label       text NOT NULL DEFAULT '',
  budgeted    numeric(12,2) DEFAULT 0,
  actual      numeric(12,2) DEFAULT 0,
  note        text DEFAULT '',
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  sort_order  int  DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Expense items (monthly + annual, distinguished by frequency column)
CREATE TABLE IF NOT EXISTS expense_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  label       text NOT NULL DEFAULT '',
  budgeted    numeric(12,2) DEFAULT 0,
  actual      numeric(12,2) DEFAULT 0,
  note        text DEFAULT '',
  frequency   text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'annual')),
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  sort_order  int  DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Bank accounts (one row per bank/card the user has imported from)
CREATE TABLE IF NOT EXISTS bank_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  name        text NOT NULL,
  institution text DEFAULT '',
  -- Saved column mapping so user doesn't re-map each import
  col_date    text DEFAULT '',
  col_desc    text DEFAULT '',
  col_amount  text DEFAULT '',
  amount_sign text DEFAULT 'negative' CHECK (amount_sign IN ('negative', 'positive')),
  created_at  timestamptz DEFAULT now()
);

-- Raw imported transactions
CREATE TABLE IF NOT EXISTS transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users NOT NULL,
  bank_account_id     uuid REFERENCES bank_accounts(id) ON DELETE CASCADE,
  date                date,
  description         text DEFAULT '',
  amount              numeric(12,2) DEFAULT 0,
  -- Reconcile state
  matched_expense_id  uuid REFERENCES expense_items(id) ON DELETE SET NULL,
  matched_score       numeric(4,3),
  ignored             boolean DEFAULT false,
  applied             boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

-- Payee rules (learned from manual reconcile assignments — Phase 2)
CREATE TABLE IF NOT EXISTS payee_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users NOT NULL,
  pattern         text NOT NULL,
  expense_item_id uuid REFERENCES expense_items(id) ON DELETE CASCADE,
  hit_count       int DEFAULT 1,
  created_at      timestamptz DEFAULT now()
);

-- ============================================================
-- Row Level Security — each user sees only their own data
-- ============================================================

ALTER TABLE categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE income_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payee_rules   ENABLE ROW LEVEL SECURITY;

-- Helper: current user matches row owner
CREATE POLICY "own data" ON categories    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own data" ON income_items  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own data" ON expense_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own data" ON bank_accounts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own data" ON transactions  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own data" ON payee_rules   FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Indexes for common queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_income_user    ON income_items  (user_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_expense_user   ON expense_items (user_id, frequency, sort_order);
CREATE INDEX IF NOT EXISTS idx_tx_user_date   ON transactions  (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tx_bank        ON transactions  (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories   (user_id, sort_order);
