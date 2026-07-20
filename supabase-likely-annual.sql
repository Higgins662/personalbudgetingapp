-- ============================================================
-- Add likely_annual flag to global_payee_patterns
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Add the column (safe to run multiple times)
ALTER TABLE global_payee_patterns
  ADD COLUMN IF NOT EXISTS likely_annual boolean NOT NULL DEFAULT false;

-- Update contribute_payee_pattern to accept and store the annual flag
CREATE OR REPLACE FUNCTION contribute_payee_pattern(
  p_pattern       text,
  p_category_name text,
  p_likely_annual boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO global_payee_patterns (pattern, category_name, hit_count, likely_annual, updated_at)
  VALUES (lower(trim(p_pattern)), p_category_name, 1, p_likely_annual, now())
  ON CONFLICT (pattern) DO UPDATE
    SET hit_count     = global_payee_patterns.hit_count + 1,
        category_name = EXCLUDED.category_name,
        -- Once flagged as annual by any user, keep it annual
        likely_annual = global_payee_patterns.likely_annual OR EXCLUDED.likely_annual,
        updated_at    = now();
END;
$$;
GRANT EXECUTE ON FUNCTION contribute_payee_pattern(text, text, boolean) TO authenticated;

-- Seed known annual subscriptions from common patterns
-- (optional — remove if you prefer organic growth)
INSERT INTO global_payee_patterns (pattern, category_name, likely_annual, hit_count)
VALUES
  ('ring',          'Subscriptions/Memberships', true, 1),
  ('amazon prime',  'Subscriptions/Memberships', true, 1),
  ('costco',        'Subscriptions/Memberships', true, 1),
  ('bark',          'Pet Expenses',              true, 1),
  ('aaa ',          'Insurance',                 true, 1),
  ('microsoft 365', 'Subscriptions/Memberships', true, 1),
  ('apple one',     'Subscriptions/Memberships', true, 1),
  ('adobe',         'Subscriptions/Memberships', true, 1)
ON CONFLICT (pattern) DO UPDATE
  SET likely_annual = true,
      updated_at    = now();
