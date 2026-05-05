-- Add login_status and temp_password to parents and students
-- Matches the staff table pattern so the invite-user edge function
-- can store credentials and the admin UI can display the temp password card.

ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS login_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS temp_password TEXT;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS login_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS temp_password TEXT;
