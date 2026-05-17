-- Migration 044: school_super_admin cleanup
-- Ensures no school-tenant staff have platform super_admin role
-- Adds school_super_admin where needed

-- Migrate any mistakenly-assigned super_admin roles to school_super_admin
UPDATE staff_roles
SET role = 'school_super_admin'
WHERE role = 'super_admin'
  AND staff_id IN (
    SELECT s.id FROM staff s
    JOIN schools sch ON s.school_id = sch.id
    WHERE sch.code != 'platform' -- assuming platform tenant has special code
  );

-- Add school_super_admin to staff_roles if not exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'app_role' AND typtype = 'e'
  ) THEN
    -- If using text roles, nothing to do
    RETURN;
  END IF;
  
  -- Check if school_super_admin exists in the enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'school_super_admin'
  ) THEN
    -- Add school_super_admin to app_role enum
    ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'school_super_admin';
  END IF;
END $$;
