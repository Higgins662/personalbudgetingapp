-- ============================================================
-- User preferences + real payee-pattern sharing opt-out
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================
-- Replaces the placeholder "contact privacy@..." text in Settings
-- with a real toggle. Enforced INSIDE contribute_payee_pattern()
-- so it's honored no matter which code path calls the RPC
-- (the hook, or seed.js's direct onboarding calls).

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id               uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_payee_patterns  boolean NOT NULL DEFAULT true,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select own preferences" ON user_preferences;
CREATE POLICY "select own preferences" ON user_preferences
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert own preferences" ON user_preferences;
CREATE POLICY "insert own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update own preferences" ON user_preferences;
CREATE POLICY "update own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;

-- Enforce the opt-out inside the RPC itself
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
DECLARE
  v_shares_patterns boolean;
BEGIN
  -- Default to true (opted in) if the user has never visited Settings
  SELECT COALESCE(share_payee_patterns, true) INTO v_shares_patterns
  FROM user_preferences
  WHERE user_id = auth.uid();

  IF v_shares_patterns IS FALSE THEN
    RETURN; -- opted out — silently no-op
  END IF;

  INSERT INTO global_payee_patterns (pattern, category_name, hit_count, likely_annual, updated_at)
  VALUES (lower(trim(p_pattern)), p_category_name, 1, p_likely_annual, now())
  ON CONFLICT (pattern) DO UPDATE
    SET hit_count     = global_payee_patterns.hit_count + 1,
        category_name = EXCLUDED.category_name,
        likely_annual = global_payee_patterns.likely_annual OR EXCLUDED.likely_annual,
        updated_at    = now();
END;
$$;
GRANT EXECUTE ON FUNCTION contribute_payee_pattern(text, text, boolean) TO authenticated;
