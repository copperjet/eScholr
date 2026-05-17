-- ============================================================
-- 001_schools.sql  — School tenant + config
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Schools ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schools (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  code             TEXT UNIQUE NOT NULL,
  logo_url         TEXT,
  primary_color    CHAR(7)  DEFAULT '#1B2A4A',
  secondary_color  CHAR(7)  DEFAULT '#E8A020',
  country          TEXT     DEFAULT 'Zambia',
  timezone         TEXT     DEFAULT 'Africa/Lusaka',
  currency         CHAR(3)  DEFAULT 'ZMW',
  subscription_plan   TEXT NOT NULL DEFAULT 'growth'
    CHECK (subscription_plan IN ('starter','growth','scale','enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('active','trial','suspended','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Per-school key-value config ───────────────────────────────
CREATE TABLE IF NOT EXISTS school_configs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  config_key  TEXT NOT NULL,
  config_value TEXT,
  updated_by  UUID,           -- staff_id FK added later
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, config_key)
);

-- ── App versions (platform-level, no school_id needed) ────────
CREATE TABLE IF NOT EXISTS app_versions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  min_version      TEXT NOT NULL DEFAULT '1.0.0',
  current_version  TEXT NOT NULL DEFAULT '1.0.0',
  ios_store_url    TEXT,
  android_store_url TEXT,
  grace_days       INTEGER NOT NULL DEFAULT 7,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO app_versions (min_version, current_version) VALUES ('1.0.0','1.0.0');

-- ── Seed default configs when a school is created ─────────────
CREATE OR REPLACE FUNCTION seed_school_configs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO school_configs (school_id, config_key, config_value) VALUES
    (NEW.id, 'report_comment_max_chars', '600'),
    (NEW.id, 'attendance_threshold_pct', '85'),
    (NEW.id, 'school_phone',             ''),
    (NEW.id, 'school_email',             ''),
    (NEW.id, 'class_position_enabled',   'true'),
    (NEW.id, 'student_photo_on_report',  'true'),
    (NEW.id, 'eyd_creed_scale',          'cambridge'),
    (NEW.id, 'finance_gate_enabled',     'true'),
    (NEW.id, 'day_book_enabled',         'true'),
    (NEW.id, 'biweekly_enabled',         'true'),
    (NEW.id, 'character_framework_enabled','true'),
    (NEW.id, 'front_desk_enabled',       'true'),
    (NEW.id, 'hod_roles_enabled',        'true'),
    (NEW.id, 'coordinator_roles_enabled','true'),
    (NEW.id, 'parent_finance_visible',   'true'),
    (NEW.id, 'bulk_import_enabled',      'true'),
    (NEW.id, 'demo_mode',                'false');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_school_configs
AFTER INSERT ON schools
FOR EACH ROW EXECUTE FUNCTION seed_school_configs();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_configs ENABLE ROW LEVEL SECURITY;

-- School row: user sees only their school
DROP POLICY IF EXISTS "school_read_own" ON schools;
CREATE POLICY "school_read_own" ON schools FOR SELECT TO authenticated
  USING (id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

-- Platform admins bypass via service_role (no policy needed for service_role)

DROP POLICY IF EXISTS "school_config_isolation" ON school_configs;
CREATE POLICY "school_config_isolation" ON school_configs FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_school_configs_school ON school_configs(school_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_schools_code ON schools(code);
