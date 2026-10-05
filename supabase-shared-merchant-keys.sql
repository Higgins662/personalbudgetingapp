-- PRIVACY FIX (part 1 of 2): share merchant keys, not bank descriptions.
--
-- global_payee_patterns stored raw transaction descriptions and every
-- signed-in user downloaded the whole table. Those descriptions carried
-- account numbers, ACH/Venmo reference ids, payroll ids and personal names.
-- Votes were hit counts, so one account could outvote everyone.
--
-- This migration is additive: the old table stays readable until the new
-- client ships, and supabase-shared-merchant-keys-cutover.sql then cuts off
-- direct reads and deletes the raw rows.
--
-- Design:
--   merchant_key()        reduces a description to its merchant words only
--                         (PURCHASE AUTHORIZED ON 0522 ACMETIRE12345 SPRINGFIELD IL
--                         S0000... -> ACMETIRE). Measured on real data it gives
--                         MORE correct suggestions than the raw descriptions
--                         did: personal details never helped matching.
--   is_personal_payment() P2P, own-account transfers, checks, deposits, ATM
--                         and payroll are never shared: they're the most
--                         personal rows and their category means nothing to
--                         anyone else.
--   global_pattern_votes  one vote per (merchant, user). A key is only served
--                         once MIN_CONTRIBUTORS distinct users agree on it,
--                         which keeps out what no text rule can catch (a
--                         stranger's name is unique to one user) and means a
--                         single account can't outvote everyone.
--   suggest_categories()  matching happens here, so clients never see the
--                         table — they send descriptions, get categories back.

CREATE OR REPLACE FUNCTION public.merchant_key(raw text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  s      text := upper(coalesce(raw, ''));
  toks   text[];
  out    text[] := '{}';
  t      text;
  i      int := 1;
  n      int;
  states text[] := ARRAY['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI',
    'ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT',
    'NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD',
    'TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
  boiler text[] := ARRAY['PURCHASE','POS','DEBIT','CARD','CHECKCARD','RECURRING',
    'PAYMENT','AUTHORIZED','ON','ACH','ONLINE','PYMT'];
  -- Prefixes whose '*' introduces the merchant (SQ *BALLET) rather than an
  -- order code after it (AMAZON MKTPL*AJJ).
  procs  text[] := ARRAY['SQ','TST','SP','PP','DD','PY','CPI','TLF','CAT','AMZ','PAYPAL'];
BEGIN
  -- Mirror normalizePattern() in src/lib/fuzzyMatch.js, so a raw description
  -- and its normalized form produce the same key.
  s := regexp_replace(s, '\m\d{4}[-/]\d{2}[-/]\d{2}\M', ' ', 'g');
  s := regexp_replace(s, '\m\d{2}[-/]\d{2}[-/]\d{4}\M', ' ', 'g');
  s := regexp_replace(s, '\m\d{2}[-/]\d{2}\M', ' ', 'g');
  s := regexp_replace(s, '\m(DEBIT CARD|RECURRING PYMT|RECURRING PAYMENT|POS PURCHASE|POS DEBIT|ONLINE PMT)\M', ' ', 'g');
  toks := string_to_array(btrim(regexp_replace(s, '\s+', ' ', 'g')), ' ');
  n := coalesce(array_length(toks, 1), 0);

  -- Leading bank boilerplate, and a date-shaped token after it.
  WHILE i <= n AND (toks[i] = ANY(boiler)
                    OR toks[i] ~ '^\d{1,4}$'
                    OR toks[i] ~ '^\d{1,2}/\d{1,2}(/\d{2,4})?$') LOOP
    i := i + 1;
  END LOOP;

  -- Merchant words: stop at the first number, reference, mask or state code
  -- (what follows is city/state, card digits and reference ids).
  WHILE i <= n AND coalesce(array_length(out, 1), 0) < 3 LOOP
    t := toks[i];
    EXIT WHEN t ~ '^[\d\-/.]+$' OR t ~ '#' OR t ~ 'X{3,}' OR t = ANY(states);
    t := regexp_replace(t, '\d+', '', 'g');            -- ACMETIRE12345 -> ACMETIRE
    IF t ~ '\*[A-Z]{1,6}$' AND split_part(t, '*', 1) <> ''
       AND split_part(t, '*', 1) <> ALL(procs) THEN
      t := regexp_replace(t, '\*[A-Z]{1,6}$', '');      -- MKTPL*AJJ -> MKTPL
    END IF;
    IF length(regexp_replace(t, '[^A-Z]', '', 'g')) >= 2 THEN
      out := out || t;
    END IF;
    i := i + 1;
  END LOOP;

  RETURN nullif(array_to_string(out, ' '), '');
END $$;

CREATE OR REPLACE FUNCTION public.is_personal_payment(raw text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT coalesce(raw, '') ~* '(venmo|zelle|cash app|apple cash|square cash|person-to-person|transfer|xfer|way2save|deposit|withdrawal|payroll|\mcheck\M|\matm\M)'
$$;

CREATE TABLE IF NOT EXISTS global_pattern_votes (
  merchant_key  text NOT NULL,
  user_id       uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  category_name text NOT NULL,
  likely_annual boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_key, user_id)
);
CREATE INDEX IF NOT EXISTS idx_pattern_votes_user ON global_pattern_votes (user_id);

-- Read and written only through the SECURITY DEFINER functions below.
ALTER TABLE global_pattern_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON global_pattern_votes FROM PUBLIC, anon, authenticated;

-- The two-argument overload has no remaining callers and no auth checks, and
-- still writes raw descriptions into the old table. Disabled rather than
-- dropped here; supabase-shared-merchant-keys-cutover.sql drops it.
REVOKE EXECUTE ON FUNCTION public.contribute_payee_pattern(text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.contribute_payee_pattern(
  p_pattern text, p_category_name text, p_likely_annual boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_key text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Opted out in Settings: share nothing.
  IF EXISTS (SELECT 1 FROM user_preferences
             WHERE user_id = v_uid AND share_payee_patterns IS FALSE) THEN
    RETURN;
  END IF;

  IF is_personal_payment(p_pattern) THEN RETURN; END IF;

  v_key := merchant_key(p_pattern);
  IF v_key IS NULL OR length(v_key) < 4 THEN RETURN; END IF;

  -- Only a category the caller actually has. Stops arbitrary text from
  -- reaching the "Others categorize this as ..." line other users see.
  IF NOT EXISTS (SELECT 1 FROM categories
                 WHERE user_id = v_uid AND name = p_category_name
                   AND NOT is_system) THEN
    RETURN;
  END IF;

  INSERT INTO global_pattern_votes (merchant_key, user_id, category_name, likely_annual)
  VALUES (v_key, v_uid, p_category_name, coalesce(p_likely_annual, false))
  ON CONFLICT (merchant_key, user_id) DO UPDATE SET
    category_name = EXCLUDED.category_name,
    likely_annual = global_pattern_votes.likely_annual OR EXCLUDED.likely_annual,
    updated_at    = now();
END $$;

CREATE OR REPLACE FUNCTION public.suggest_categories(p_descriptions text[])
RETURNS TABLE (description text, category_name text, likely_annual boolean, contributors int)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  -- Distinct users who must agree before a merchant key is shared at all.
  min_contributors constant int := 2;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  WITH input AS (
    SELECT DISTINCT d FROM unnest(p_descriptions[1:5000]) AS d WHERE d IS NOT NULL
  ), keyed AS (
    SELECT d, merchant_key(d) AS k FROM input WHERE NOT is_personal_payment(d)
  ), shared_keys AS (
    SELECT v.merchant_key, count(*)::int AS voters
    FROM global_pattern_votes v
    GROUP BY v.merchant_key
    HAVING count(*) >= min_contributors
  ), best_category AS (
    SELECT DISTINCT ON (v.merchant_key)
           v.merchant_key, v.category_name,
           count(*) FILTER (WHERE v.likely_annual) * 2 > count(*) AS annual
    FROM global_pattern_votes v
    JOIN shared_keys s USING (merchant_key)
    GROUP BY v.merchant_key, v.category_name
    ORDER BY v.merchant_key, count(*) DESC, v.category_name
  )
  -- A stored key matches the description's key exactly or as a word prefix
  -- (ACME matches ACME TIRE); the longest, most specific key wins.
  SELECT DISTINCT ON (kd.d) kd.d, b.category_name, b.annual, s.voters
  FROM keyed kd
  JOIN shared_keys s
    ON kd.k = s.merchant_key OR left(kd.k, length(s.merchant_key) + 1) = s.merchant_key || ' '
  JOIN best_category b ON b.merchant_key = s.merchant_key
  ORDER BY kd.d, length(s.merchant_key) DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.merchant_key(text), public.is_personal_payment(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION
  public.contribute_payee_pattern(text, text, boolean),
  public.suggest_categories(text[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.contribute_payee_pattern(text, text, boolean),
  public.suggest_categories(text[])
TO authenticated;

-- Backfill from payee_rules, which records who matched what. Respects the
-- Settings opt-out, and skips system categories (Transfers & Payments) as
-- the client always has.
INSERT INTO global_pattern_votes (merchant_key, user_id, category_name, likely_annual)
SELECT DISTINCT ON (k, pr.user_id) k, pr.user_id, c.name, ei.frequency = 'annual'
FROM payee_rules pr
CROSS JOIN LATERAL (SELECT public.merchant_key(pr.pattern) AS k) mk
JOIN expense_items ei ON ei.id = pr.expense_item_id
JOIN categories c     ON c.id  = ei.category_id
WHERE NOT c.is_system
  AND NOT public.is_personal_payment(pr.pattern)
  AND length(k) >= 4
  AND NOT EXISTS (SELECT 1 FROM user_preferences up
                  WHERE up.user_id = pr.user_id AND up.share_payee_patterns IS FALSE)
ORDER BY k, pr.user_id, pr.hit_count DESC
ON CONFLICT (merchant_key, user_id) DO NOTHING;
