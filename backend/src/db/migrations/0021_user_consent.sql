-- 0021_user_consent.sql
-- Add consent tracking to users table

ALTER TABLE users
  ADD COLUMN consent_accepted_at TIMESTAMPTZ,
  ADD COLUMN consent_version TEXT;
