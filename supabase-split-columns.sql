-- ============================================================
-- Add col_credit column to bank_accounts
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- Stores the optional separate deposits/credits column name
-- for banks that export debit and credit in separate columns
-- (e.g. Chase checking: "Debit" + "Credit" instead of "Amount")

ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS col_credit text DEFAULT NULL;
