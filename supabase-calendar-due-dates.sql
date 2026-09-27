-- Add due-date fields for the Calendar feature.
-- Monthly items (income, and expense_items with frequency='monthly') get a
-- plain day-of-month. Annual expense_items also get a month, since a bare
-- day-of-month is ambiguous for something that recurs once a year.

ALTER TABLE income_items
  ADD COLUMN IF NOT EXISTS due_day int CHECK (due_day IS NULL OR (due_day BETWEEN 1 AND 31));

ALTER TABLE expense_items
  ADD COLUMN IF NOT EXISTS due_day int CHECK (due_day IS NULL OR (due_day BETWEEN 1 AND 31));

ALTER TABLE expense_items
  ADD COLUMN IF NOT EXISTS due_month int CHECK (due_month IS NULL OR (due_month BETWEEN 1 AND 12));
