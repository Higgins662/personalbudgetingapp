-- Add Vehicle Taxes/Registration category for all existing users
INSERT INTO categories (user_id, name, color, description, enabled, is_system, sort_order)
SELECT u.id, 'Vehicle Taxes/Registration', '#3a6a9a', 'Registration fees, property tax, tags', true, false, 21
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.user_id = u.id AND c.name = 'Vehicle Taxes/Registration'
);
