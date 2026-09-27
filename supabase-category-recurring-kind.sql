-- Which categories are recurring BY NATURE.
--
-- The Calendar detects recurring charges from transaction cadence (gaps
-- between charges). That works well but has a blind spot: habitual everyday
-- spending can look like a bill. A grocery run every ~30 days at a similar
-- amount passes a cadence test, yet nobody wants it on a due-date calendar.
--
-- Category is the signal that separates those cases, but category names are
-- user-editable free text — matching on names like 'Utilities' breaks the
-- moment someone renames it. So the intent is stored explicitly:
--
--   'recurring' — bills live here (Utilities, Insurance, Streaming,
--                 Subscriptions, Activities, Vehicle Payments, Mortgage/Rent,
--                 Transfers & Payments). Cadence evidence is believed more
--                 readily for these.
--   'everyday'  — habitual variable spending (Groceries, Dining, Fuel,
--                 Clothing, Entertainment, Personal Care). Never treated as
--                 a recurring bill, however regular the cadence looks.
--   'neutral'   — everything else, and the default: judged on cadence alone.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS recurring_kind text
    NOT NULL DEFAULT 'neutral'
    CHECK (recurring_kind IN ('recurring', 'everyday', 'neutral'));

-- Seed the built-in categories to match their obvious intent. Only touches
-- rows still at the default, so a user's own choices are never overwritten.
-- Activities and School Expenses are deliberately NOT here: they hold a mix
-- of genuine recurring dues and one-off costs (a tournament fee, a uniform),
-- so they're left at 'neutral' to be judged on transaction history instead.
UPDATE categories SET recurring_kind = 'recurring'
WHERE recurring_kind = 'neutral'
  AND name IN (
    'Utilities', 'Insurance', 'Streaming Services', 'Subscriptions/Memberships',
    'Vehicle Payments', 'Mortgage/Rent', 'Transfers & Payments'
  );

UPDATE categories SET recurring_kind = 'everyday'
WHERE recurring_kind = 'neutral'
  AND name IN (
    'Food & Groceries', 'Dining & Restaurants', 'Fuel/Gas', 'Clothing',
    'Entertainment', 'Personal Care', 'Home Furnishings', 'Other/Unplanned'
  );
