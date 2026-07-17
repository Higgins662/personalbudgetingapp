-- Add new categories for all existing users
-- Safe to re-run — NOT EXISTS guard prevents duplicates

INSERT INTO categories (user_id, name, color, description, enabled, is_system, sort_order)
SELECT u.id, 'Vehicle Taxes/Registration', '#3a6a9a', 'Registration fees, property tax, tags', true, false, 21
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.name = 'Vehicle Taxes/Registration');

INSERT INTO categories (user_id, name, color, description, enabled, is_system, sort_order)
SELECT u.id, 'Activities', '#9a3a7a', 'Sports, clubs, hobbies, recreation', true, false, 22
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.name = 'Activities');

INSERT INTO categories (user_id, name, color, description, enabled, is_system, sort_order)
SELECT u.id, 'School Expenses', '#3a7a6a', 'Tuition, supplies, fees, uniforms', true, false, 23
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.name = 'School Expenses');
