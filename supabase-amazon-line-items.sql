-- ============================================================
-- Amazon order line-item enrichment + transaction splitting
--
-- A single bank-statement transaction (e.g. "AMAZON.COM*AB12CD34 $87.42")
-- gets enriched with the itemized order pulled from the user's Amazon
-- order-confirmation email, then optionally split across categories.
--
-- amazon_orders / amazon_order_items: raw parsed order data, kept for
--   provenance/debugging and to avoid re-parsing on re-sync.
-- transaction_splits: the actual category allocation once the user (or
--   an auto-categorize pass) has assigned each line item to a category.
--   When a transaction has split rows, they are authoritative for actual
--   spend by category — matched_expense_id on the parent transaction is
--   left in place for display/back-compat but ignored by aggregation.
-- ============================================================

-- Parsed Amazon order, reconciled to a transactions row by amount + date
-- proximity (see reconcileAmazonOrder.js). transaction_id is nullable
-- because an order can be parsed before its statement line is imported.
CREATE TABLE IF NOT EXISTS amazon_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users NOT NULL,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  order_id       text,              -- Amazon's own order number, e.g. 112-1234567-1234567
  order_date     date,
  order_total    numeric(12,2),
  gmail_message_id text NOT NULL,   -- source email, for dedup on re-sync
  template       text,              -- which parser template matched
  confidence     numeric(4,3),      -- parser confidence heuristic, 0-1
  reconciled_at  timestamptz,       -- null until matched to a transaction
  created_at     timestamptz DEFAULT now(),
  UNIQUE (user_id, gmail_message_id)
);

-- Individual line items within an order.
CREATE TABLE IF NOT EXISTS amazon_order_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amazon_order_id     uuid REFERENCES amazon_orders(id) ON DELETE CASCADE NOT NULL,
  user_id             uuid REFERENCES auth.users NOT NULL,
  name                text NOT NULL,
  asin                text,
  quantity            int NOT NULL DEFAULT 1,
  unit_price          numeric(12,2) NOT NULL DEFAULT 0,
  line_total          numeric(12,2) NOT NULL DEFAULT 0,
  suggested_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now()
);

-- Category allocation for a (possibly split) transaction. A transaction
-- with N rows here has its amount divided across N categories; aggregation
-- code should sum split amounts per category instead of using the parent
-- transaction's matched_expense_id whenever split rows exist for it.
CREATE TABLE IF NOT EXISTS transaction_splits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users NOT NULL,
  transaction_id  uuid REFERENCES transactions(id) ON DELETE CASCADE NOT NULL,
  category_id     uuid REFERENCES categories(id) ON DELETE SET NULL,
  expense_item_id uuid REFERENCES expense_items(id) ON DELETE SET NULL,
  amount          numeric(12,2) NOT NULL,
  source          text NOT NULL DEFAULT 'amazon_email', -- 'amazon_email' | 'manual'
  amazon_order_item_id uuid REFERENCES amazon_order_items(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_amazon_orders_user   ON amazon_orders (user_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_amazon_orders_tx     ON amazon_orders (transaction_id);
CREATE INDEX IF NOT EXISTS idx_amazon_orders_unreconciled
  ON amazon_orders (user_id) WHERE transaction_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_amazon_items_order   ON amazon_order_items (amazon_order_id);
CREATE INDEX IF NOT EXISTS idx_splits_tx            ON transaction_splits (transaction_id);
CREATE INDEX IF NOT EXISTS idx_splits_category      ON transaction_splits (user_id, category_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE amazon_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE amazon_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_splits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  FOR _t IN VALUES ('amazon_orders'),('amazon_order_items'),('transaction_splits') LOOP
    EXECUTE format(
      'CREATE POLICY "select own" ON %I FOR SELECT USING (auth.uid() = user_id)', _t);
    EXECUTE format(
      'CREATE POLICY "insert own" ON %I FOR INSERT WITH CHECK (auth.uid() = user_id)', _t);
    EXECUTE format(
      'CREATE POLICY "update own" ON %I FOR UPDATE USING (auth.uid() = user_id)', _t);
    EXECUTE format(
      'CREATE POLICY "delete own" ON %I FOR DELETE USING (auth.uid() = user_id)', _t);
  END LOOP;
END $$;

-- ── Constraint: split amounts must sum to the parent transaction amount ────────
-- Enforced in application code at write time (see applySplits in
-- useAmazonOrders.js) rather than a DB trigger, matching this schema's
-- existing convention of app-level validation over DB constraints
-- (see e.g. matched_score / matched_source on transactions).
