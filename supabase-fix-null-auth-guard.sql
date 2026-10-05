-- SECURITY FIX: SECURITY DEFINER functions were callable by signed-out users.
--
-- Every user-scoped function guarded itself with
--     IF auth.uid() <> p_user_id THEN RAISE EXCEPTION 'Unauthorized'; END IF;
-- For a signed-out caller auth.uid() is NULL, and NULL <> x is NULL — not
-- TRUE — so the IF never fired and the function ran with owner privileges,
-- bypassing RLS. Anyone holding the public publishable key and a user's id
-- could call delete_user_account, soft_reset_budget, clear_month_import, etc.
-- against that user.
--
-- Two layers of fix:
--   1. IS DISTINCT FROM treats NULL as a real value, so a NULL caller no
--      longer matches any user id and the guard raises.
--   2. EXECUTE is revoked from PUBLIC and anon, so signed-out requests are
--      refused before the function body runs at all. Every app call to
--      these functions happens from a signed-in page.
--
-- The functions are rewritten from their own live definitions, changing only
-- the guard, so nothing else in their bodies can drift from what's deployed.

DO $$
DECLARE
  fn       record;
  old_def  text;
  new_def  text;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'apply_transactions_to_budget', 'clear_month_import',
        'delete_user_account', 'demote_annual_item', 'ensure_period_item',
        'get_or_create_period', 'reassign_income_transaction',
        'reassign_transaction', 'soft_reset_budget'
      )
  LOOP
    old_def := pg_get_functiondef(fn.oid);
    new_def := regexp_replace(old_def,
                 'auth\.uid\(\)\s*<>\s*p_user_id',
                 'auth.uid() IS DISTINCT FROM p_user_id', 'g');

    -- Idempotent: already-fixed functions are skipped, but a function that
    -- has neither form of the guard is a surprise worth stopping for.
    IF new_def = old_def THEN
      IF old_def !~ 'auth\.uid\(\) IS DISTINCT FROM p_user_id' THEN
        RAISE EXCEPTION 'No auth guard found in %', fn.proname;
      END IF;
      CONTINUE;
    END IF;

    EXECUTE new_def;
  END LOOP;
END $$;

-- Functions are executable by PUBLIC by default, which includes anon.
REVOKE EXECUTE ON FUNCTION
  public.apply_transactions_to_budget(uuid),
  public.clear_month_import(uuid, date),
  public.delete_user_account(uuid),
  public.demote_annual_item(uuid, uuid),
  public.ensure_period_item(uuid, uuid, text, text),
  public.get_or_create_period(uuid, text, date),
  public.reassign_income_transaction(uuid, uuid, uuid),
  public.reassign_transaction(uuid, uuid, uuid),
  public.soft_reset_budget(uuid),
  public.contribute_payee_pattern(text, text),
  public.contribute_payee_pattern(text, text, boolean)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.apply_transactions_to_budget(uuid),
  public.clear_month_import(uuid, date),
  public.delete_user_account(uuid),
  public.demote_annual_item(uuid, uuid),
  public.ensure_period_item(uuid, uuid, text, text),
  public.get_or_create_period(uuid, text, date),
  public.reassign_income_transaction(uuid, uuid, uuid),
  public.reassign_transaction(uuid, uuid, uuid),
  public.soft_reset_budget(uuid),
  public.contribute_payee_pattern(text, text),
  public.contribute_payee_pattern(text, text, boolean)
TO authenticated;
