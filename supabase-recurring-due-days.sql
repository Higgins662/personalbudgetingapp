-- Due days for detected recurring charges.
--
-- These were originally stored on payee_rules, which was a mistake:
-- payee_rules drives auto-matching for future imports via findPersonalRule,
-- whose containment test (nd.includes(np)) means a SHORT pattern matches any
-- transaction containing it. The Calendar's grouping key is deliberately
-- aggressive — it strips reference numbers, so "ACME CORP PAYROLL
-- 123456 WEEK0000000" becomes "ACME CORP PAYROLL" — so writing those
-- keys into payee_rules would silently hijack unrelated transactions and
-- assign them with matched_source 'rule' at full confidence.
--
-- Merely viewing the Calendar must not change how imports are matched, so
-- due days live in their own table, keyed by the same pattern string but
-- read by nothing except the Calendar.

CREATE TABLE IF NOT EXISTS recurring_due_days (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE so account deletion (delete_user_account) can remove the login.
  user_id    uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  pattern    text NOT NULL,
  due_day    int CHECK (due_day IS NULL OR (due_day BETWEEN 1 AND 31)),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, pattern)
);

CREATE INDEX IF NOT EXISTS idx_recurring_due_days_user
  ON recurring_due_days (user_id);

ALTER TABLE recurring_due_days ENABLE ROW LEVEL SECURITY;

-- Four separate policies, matching the convention in supabase-schema.sql.
DROP POLICY IF EXISTS "select own" ON recurring_due_days;
DROP POLICY IF EXISTS "insert own" ON recurring_due_days;
DROP POLICY IF EXISTS "update own" ON recurring_due_days;
DROP POLICY IF EXISTS "delete own" ON recurring_due_days;
CREATE POLICY "select own" ON recurring_due_days FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "insert own" ON recurring_due_days FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own" ON recurring_due_days FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own" ON recurring_due_days FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_due_days TO authenticated;

-- Carry over anything the earlier payee_rules-based version stored.
INSERT INTO recurring_due_days (user_id, pattern, due_day)
SELECT user_id, pattern, due_day
FROM payee_rules
WHERE due_day IS NOT NULL
ON CONFLICT (user_id, pattern) DO NOTHING;

ALTER TABLE payee_rules DROP COLUMN IF EXISTS due_day;
