-- PRIVACY FIX (part 2 of 2): retire the raw shared-pattern table.
--
-- Run ONLY after the client that uses suggest_categories() is deployed —
-- older clients read global_payee_patterns directly, and this cuts that off.
--
-- global_payee_patterns held raw bank descriptions (account numbers, ACH and
-- Venmo reference ids, names) readable by every signed-in user. Its useful
-- content was rebuilt as merchant keys in global_pattern_votes by
-- supabase-shared-merchant-keys.sql, so the raw rows are deleted, not kept.

-- Stop all direct reads first, so nothing can see the rows even before the
-- table is gone.
DROP POLICY IF EXISTS "read global patterns" ON global_payee_patterns;
REVOKE ALL ON global_payee_patterns FROM PUBLIC, anon, authenticated;

-- Superseded writer (disabled in part 1).
DROP FUNCTION IF EXISTS public.contribute_payee_pattern(text, text);

DROP TABLE IF EXISTS global_payee_patterns;
