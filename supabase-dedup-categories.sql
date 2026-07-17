-- ============================================================
-- Remove duplicate categories (same user_id + name)
-- Keep the row with the lowest sort_order (earliest seeded)
-- Run in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- First update any expense_items pointing to duplicate category IDs
-- to point to the canonical (lowest sort_order) one instead
WITH canonical AS (
  SELECT DISTINCT ON (user_id, name)
    id, user_id, name, sort_order
  FROM categories
  ORDER BY user_id, name, sort_order ASC
),
duplicates AS (
  SELECT c.id AS dup_id, canon.id AS canon_id
  FROM categories c
  JOIN canonical canon
    ON  canon.user_id = c.user_id
    AND canon.name    = c.name
    AND canon.id     != c.id
)
UPDATE expense_items ei
SET category_id = d.canon_id
FROM duplicates d
WHERE ei.category_id = d.dup_id;

-- Now delete the duplicate category rows
DELETE FROM categories
WHERE id IN (
  SELECT c.id
  FROM categories c
  WHERE EXISTS (
    SELECT 1 FROM categories c2
    WHERE c2.user_id    = c.user_id
      AND c2.name       = c.name
      AND c2.sort_order < c.sort_order
  )
);
