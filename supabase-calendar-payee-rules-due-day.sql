-- SUPERSEDED by supabase-recurring-due-days.sql, which moves these due days
-- to their own table and drops this column. Storing them on payee_rules was
-- a mistake: that table drives import auto-matching, and the Calendar's
-- grouping key is aggressive enough that writing it there let a short
-- pattern hijack unrelated transactions. Kept only so the migration history
-- reads in order — do not apply to a fresh database.
--
-- Due dates for recurring monthly expenses belong on the recurring
-- transaction PATTERN, not the parent budget category — a monthly
-- expense_item like "Utilities" often aggregates several unrelated bills
-- (electric, water, internet), each with its own due date. payee_rules
-- already represents "this normalized transaction pattern maps to this
-- budget item," the right granularity for a due date.
--
-- (Annual expense_items and income_items keep their own due_day/due_month
-- columns added in supabase-calendar-due-dates.sql — each is already
-- one-to-one with a specific recurring payee, so no aggregation problem there.)

ALTER TABLE payee_rules
  ADD COLUMN IF NOT EXISTS due_day int CHECK (due_day IS NULL OR (due_day BETWEEN 1 AND 31));
