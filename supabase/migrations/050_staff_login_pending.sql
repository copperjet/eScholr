-- ============================================================
-- 050_staff_login_pending.sql
-- Adds login_status and temp_password to staff so that admins
-- can see pending logins and recover temp credentials if they
-- navigate away before writing them down.
-- login_status: 'none' | 'pending_login' | 'active'
-- temp_password is cleared automatically once the user resets.
-- ============================================================

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS login_status  TEXT NOT NULL DEFAULT 'none'
    CHECK (login_status IN ('none', 'pending_login', 'active')),
  ADD COLUMN IF NOT EXISTS temp_password TEXT;

-- Back-fill existing rows that already have an auth account
UPDATE staff SET login_status = 'active' WHERE auth_user_id IS NOT NULL AND login_status = 'none';

CREATE INDEX IF NOT EXISTS idx_staff_login_status ON staff(school_id, login_status);
