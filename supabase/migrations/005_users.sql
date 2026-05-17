-- ============================================================
-- 005_users.sql — Staff, Parents, Biometric sessions
-- ============================================================

CREATE TABLE IF NOT EXISTS staff (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  auth_user_id  UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name     TEXT NOT NULL,
  staff_number  TEXT,
  email         TEXT NOT NULL,
  phone         TEXT,
  department    TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  date_joined   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, email)
);

CREATE TABLE IF NOT EXISTS staff_roles (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id  UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN (
    'super_admin','admin','front_desk','finance',
    'principal','coordinator','hod','hrt','st'
  )),
  UNIQUE (staff_id, role)
);

CREATE TABLE IF NOT EXISTS parents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name    TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  relationship TEXT CHECK (relationship IN ('mother','father','guardian')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, email)
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id  TEXT NOT NULL,
  push_token TEXT NOT NULL,
  platform   TEXT CHECK (platform IN ('ios','android','web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS biometric_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id             TEXT NOT NULL,
  biometric_enabled     BOOLEAN NOT NULL DEFAULT true,
  last_biometric_auth_at TIMESTAMPTZ,
  pin_hash              TEXT,
  UNIQUE (user_id, device_id)
);

-- Auto-generate staff_number: STF001, STF002 …
CREATE OR REPLACE FUNCTION generate_staff_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM staff WHERE school_id = NEW.school_id;
  NEW.staff_number := 'STF' || LPAD((v_count + 1)::TEXT, 3, '0');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_staff_number ON staff;
CREATE TRIGGER trg_staff_number BEFORE INSERT ON staff
FOR EACH ROW WHEN (NEW.staff_number IS NULL) EXECUTE FUNCTION generate_staff_number();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE staff             ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_roles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "si_staff"       ON staff       FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
DROP POLICY IF EXISTS "si_staff_roles" ON staff_roles;
CREATE POLICY "si_staff_roles" ON staff_roles FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
CREATE POLICY "si_parents"     ON parents     FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

-- Push tokens: own device only
DROP POLICY IF EXISTS "push_tokens_own" ON push_tokens;
CREATE POLICY "push_tokens_own" ON push_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid());
-- Biometric: own device only
DROP POLICY IF EXISTS "biometric_own" ON biometric_sessions;
CREATE POLICY "biometric_own" ON biometric_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_staff_school      ON staff(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_auth        ON staff(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_staff_roles_staff ON staff_roles(staff_id);
CREATE INDEX IF NOT EXISTS idx_parents_school    ON parents(school_id);
CREATE INDEX IF NOT EXISTS idx_parents_auth      ON parents(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user  ON push_tokens(user_id);
