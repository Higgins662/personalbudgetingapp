-- BUG FIX: account deletion failed for anyone who had opened the Calendar.
--
-- delete_user_account deletes each table's rows explicitly and finishes with
-- DELETE FROM auth.users. recurring_due_days (added with the Calendar) was
-- never added to that list, and its foreign key to auth.users was NO ACTION,
-- so the final delete hit a foreign-key violation and the whole function
-- rolled back — the user's data and login both survived a "delete account".
--
-- ON DELETE CASCADE (as user_preferences already uses) removes the rows with
-- the login, and covers any future path that deletes a user, not just this
-- function.

ALTER TABLE recurring_due_days
  DROP CONSTRAINT IF EXISTS recurring_due_days_user_id_fkey,
  ADD  CONSTRAINT recurring_due_days_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
