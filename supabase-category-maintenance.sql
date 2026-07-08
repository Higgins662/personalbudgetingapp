-- ============================================================
-- Category Maintenance
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── Rename existing categories for all users ─────────────────────────────────

UPDATE categories SET
  name        = 'Mortgage/Rent',
  description = 'Mortgage, rent, HOA fees'
WHERE name = 'Housing' AND is_system = false;

UPDATE categories SET
  name        = 'Fuel/Gas',
  description = 'Gas, fuel, tolls, parking'
WHERE name = 'Transport' AND is_system = false;

UPDATE categories SET
  name        = 'Health/Medical',
  description = 'Doctor, prescriptions, gym, dental'
WHERE name = 'Health' AND is_system = false;

UPDATE categories SET
  name        = 'Other/Unplanned',
  description = 'Unplanned or miscellaneous expenses'
WHERE name = 'Other' AND is_system = false;

-- ── Add 4 new categories for all existing users ───────────────────────────────
-- Uses NOT EXISTS guard so it's safe to run multiple times

INSERT INTO categories (user_id, name, color, description, enabled, is_system, sort_order)
SELECT u.id, 'Clothing', '#c06090', 'Clothing, shoes, accessories', true, false, 17
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.name = 'Clothing'
);

INSERT INTO categories (user_id, name, color, description, enabled, is_system, sort_order)
SELECT u.id, 'Home Furnishings', '#8b6914', 'Furniture, decor, appliances', true, false, 18
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.name = 'Home Furnishings'
);

INSERT INTO categories (user_id, name, color, description, enabled, is_system, sort_order)
SELECT u.id, 'Vehicle Payments', '#2a5a8a', 'Car loan, lease payments', true, false, 19
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.name = 'Vehicle Payments'
);

INSERT INTO categories (user_id, name, color, description, enabled, is_system, sort_order)
SELECT u.id, 'Vehicle Maintenance', '#5a7a2a', 'Repairs, tires, oil changes, car wash', true, false, 20
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.name = 'Vehicle Maintenance'
);
