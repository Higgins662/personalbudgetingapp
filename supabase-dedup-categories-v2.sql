-- ============================================================
-- Deduplicate categories (all of them), and guard against recurrence.
--
-- WHY THIS EXISTS
--
-- seedCategories() (src/lib/seed.js) does an unguarded INSERT of the full
-- DEFAULT_CATEGORIES list, so every onboarding run appends another complete
-- set. supabase-dedup-categories.sql was written to clean that up, but it
-- picks the survivor with `sort_order <` — and the "Transfers & Payments"
-- system category is seeded at sort_order 999 for ALL copies. No copy has a
-- strictly lower sort_order than another, so that DELETE spared every T&P
-- duplicate. Ordinary categories (sort_order 0..23) deduped fine; T&P
-- accumulated silently, up to 22 copies for a single user.
--
-- This one supersedes supabase-dedup-categories.sql: same intent, but it
-- picks survivors by what the row actually CARRIES rather than by
-- sort_order, and it adds the unique index that stops the whole class of
-- bug at the source.
--
-- WHY NOT created_at OR sort_order
--
-- Every affected user's oldest T&P row shares an identical created_at
-- (2026-07-05 20:37:14.196609+00) — a backfill timestamp from when the
-- column was added, not real creation order. And the copy carrying the real
-- expense_item is the NEWEST one in both affected accounts. So "keep the
-- oldest" is both meaningless and actively wrong here. sort_order ties at
-- 999, which is what broke the previous script.
--
-- SURVIVOR RULE
--
-- Keep the copy whose items actually carry data — matched transactions and
-- period_items first, then any attached items at all, then lowest id as a
-- deterministic tiebreak. That keeps the row transactions, payee_rules and
-- period_items already reach through their expense_item.
--
-- Verified against production before writing (dry runs):
--   * 90 duplicate category rows across 3 users -> 24 survivors, 66 deleted
--   * 0 transactions and 0 period_items hang off ANY row being deleted
--   * the 21 expense_items on doomed rows are all completely inert:
--     no transactions, no period_items, no payee_rules, zero amounts —
--     empty scaffolding from onboarding running twice
--
-- INERT DUPLICATE ITEMS ARE DELETED, NOT REPOINTED
--
-- One user has 21 duplicated non-system categories where BOTH copies carry
-- their own same-label monthly expense_item. Blindly repointing would leave
-- each survivor holding two identical "Clothing" / "Utilities" lines — a
-- visibly doubled budget. Since the duplicate items are provably inert,
-- the redundant one is deleted instead. An item is only ever deleted when
-- it has no transactions, no period_items and no payee_rules AND the
-- survivor already has one with the same label+frequency; anything else is
-- repointed, so no path here can drop referenced data.
-- ============================================================

BEGIN;

-- ── Rank every duplicate, richest copy first ────────────────────────────
CREATE TEMP TABLE cat_ranked ON COMMIT DROP AS
WITH cat AS (
  SELECT c.id, c.user_id, c.name,
         (SELECT count(*) FROM expense_items e WHERE e.category_id = c.id)
       + (SELECT count(*) FROM income_items  i WHERE i.category_id = c.id) AS items,
         (SELECT count(*) FROM transactions t
            JOIN expense_items e2 ON e2.id = t.matched_expense_id
          WHERE e2.category_id = c.id) AS txs,
         (SELECT count(*) FROM period_items pi
            JOIN expense_items e3 ON e3.id = pi.item_id
          WHERE e3.category_id = c.id) AS period_rows
  FROM categories c
),
dupes AS (
  SELECT * FROM cat
  WHERE (user_id, name) IN (
    SELECT user_id, name FROM cat GROUP BY user_id, name HAVING count(*) > 1
  )
)
SELECT *, row_number() OVER (
           PARTITION BY user_id, name
           ORDER BY (txs + period_rows) DESC, items DESC, id ASC
         ) AS rn
FROM dupes;

CREATE TEMP TABLE cat_keep ON COMMIT DROP AS
  SELECT user_id, name, id AS keep_id FROM cat_ranked WHERE rn = 1;

CREATE TEMP TABLE cat_dupe ON COMMIT DROP AS
  SELECT r.id AS dup_id, k.keep_id
  FROM cat_ranked r
  JOIN cat_keep k ON k.user_id = r.user_id AND k.name = r.name
  WHERE r.rn > 1;

-- ── Drop inert duplicate items the survivor already has an equal of ────
-- Guarded three ways: the item must carry nothing, and the survivor must
-- already hold a same-label/same-frequency line.
DELETE FROM expense_items e
USING cat_dupe d
WHERE e.category_id = d.dup_id
  AND NOT EXISTS (SELECT 1 FROM transactions t  WHERE t.matched_expense_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM period_items pi WHERE pi.item_id          = e.id)
  AND NOT EXISTS (SELECT 1 FROM payee_rules  p  WHERE p.expense_item_id   = e.id)
  AND EXISTS (
    SELECT 1 FROM expense_items keep
    WHERE keep.category_id = d.keep_id
      AND keep.label       = e.label
      AND keep.frequency IS NOT DISTINCT FROM e.frequency
  );

-- ── Repoint whatever legitimately remains ──────────────────────────────
-- Both FKs are ON DELETE SET NULL, so skipping this would silently orphan
-- rows rather than raise an error.
UPDATE expense_items e
SET category_id = d.keep_id
FROM cat_dupe d
WHERE e.category_id = d.dup_id;

UPDATE income_items i
SET category_id = d.keep_id
FROM cat_dupe d
WHERE i.category_id = d.dup_id;

-- ── Keep the surviving T&P row canonical ───────────────────────────────
-- Duplicates may predate is_system/enabled/description settling.
UPDATE categories c
SET is_system   = true,
    enabled     = false,
    sort_order  = 999,
    description = 'Credit card payments, loan payments, inter-account transfers. Excluded from budget totals.'
FROM cat_keep k
WHERE c.id = k.keep_id
  AND k.name = 'Transfers & Payments';

DELETE FROM categories c
USING cat_dupe d
WHERE c.id = d.dup_id;

-- ── Stop the whole class of bug at the source ──────────────────────────
-- With this in place a repeat onboarding can no longer silently append a
-- second set of categories. seedCategories() must upsert on (user_id, name)
-- rather than plain-insert, or it will now raise instead of duplicating.
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_name_unique
  ON categories (user_id, name);

COMMIT;
