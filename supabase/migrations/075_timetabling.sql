-- ============================================================
-- 075_timetabling.sql — Structured timetable foundation (M1)
-- Adds: rooms, timetable_periods, timetable_settings tables + RLS
-- Module flags: module.timetable_builder (growth+), module.timetable_live_adjust (scale+)
-- ============================================================

-- ── 1. Tables ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  room_type   TEXT NOT NULL DEFAULT 'classroom'
               CHECK (room_type IN ('classroom','lab','computer_lab','hall','library','sports','other')),
  capacity    INT,
  building    TEXT,
  floor       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);
CREATE INDEX IF NOT EXISTS idx_rooms_school ON rooms(school_id);

CREATE TABLE IF NOT EXISTS timetable_periods (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  period_index  INT NOT NULL,
  name          TEXT NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_break      BOOLEAN NOT NULL DEFAULT false,
  is_assembly   BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (school_id, period_index),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_school ON timetable_periods(school_id);

CREATE TABLE IF NOT EXISTS timetable_settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                   UUID NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
  working_days                INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  periods_per_day             INT NOT NULL DEFAULT 8,
  max_periods_per_teacher_day INT NOT NULL DEFAULT 6,
  max_consecutive_per_teacher INT NOT NULL DEFAULT 3,
  min_gap_same_subject_days   INT NOT NULL DEFAULT 0,
  allow_double_periods        BOOLEAN NOT NULL DEFAULT false,
  assembly_period_index       INT,
  lunch_period_index          INT,
  solver_preset               TEXT NOT NULL DEFAULT 'balanced'
                               CHECK (solver_preset IN ('fast','balanced','optimal')),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. RLS ───────────────────────────────────────────────────

DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'rooms','timetable_periods','timetable_settings'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "si_%I" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "si_%I" ON %I FOR ALL TO authenticated
       USING (school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid)
       WITH CHECK (school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid)',
      t, t
    );
  END LOOP;
END $$;

-- ── 3. Update seed trigger ────────────────────────────────────

CREATE OR REPLACE FUNCTION seed_school_configs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO school_configs (school_id, config_key, config_value) VALUES
    -- ── Existing sub-feature configs (unchanged) ──────────────
    (NEW.id, 'report_comment_max_chars',     '600'),
    (NEW.id, 'attendance_threshold_pct',     '85'),
    (NEW.id, 'school_phone',                 ''),
    (NEW.id, 'school_email',                 ''),
    (NEW.id, 'class_position_enabled',       'true'),
    (NEW.id, 'student_photo_on_report',      'true'),
    (NEW.id, 'eyd_creed_scale',              'cambridge'),
    (NEW.id, 'finance_gate_enabled',         'true'),
    (NEW.id, 'day_book_enabled',             'true'),
    (NEW.id, 'biweekly_enabled',             'true'),
    (NEW.id, 'character_framework_enabled',  'true'),
    (NEW.id, 'front_desk_enabled',           'true'),
    (NEW.id, 'hod_roles_enabled',            'true'),
    (NEW.id, 'coordinator_roles_enabled',    'true'),
    (NEW.id, 'parent_finance_visible',       'true'),
    (NEW.id, 'bulk_import_enabled',          'true'),
    (NEW.id, 'demo_mode',                    'false'),

    -- ── Module flags: all tiers ───────────────────────────────
    (NEW.id, 'module.finance',       'true'),
    (NEW.id, 'module.exams',         'true'),
    (NEW.id, 'module.daybook',       'true'),
    (NEW.id, 'module.announcements', 'true'),

    -- ── Module flags: growth and above ───────────────────────
    (NEW.id, 'module.hr',
      CASE WHEN NEW.subscription_plan IN ('growth','scale','enterprise') THEN 'true' ELSE 'false' END),
    (NEW.id, 'module.frontdesk',
      CASE WHEN NEW.subscription_plan IN ('growth','scale','enterprise') THEN 'true' ELSE 'false' END),
    (NEW.id, 'module.library',
      CASE WHEN NEW.subscription_plan IN ('growth','scale','enterprise') THEN 'true' ELSE 'false' END),
    (NEW.id, 'module.character',
      CASE WHEN NEW.subscription_plan IN ('growth','scale','enterprise') THEN 'true' ELSE 'false' END),
    (NEW.id, 'module.eca',
      CASE WHEN NEW.subscription_plan IN ('growth','scale','enterprise') THEN 'true' ELSE 'false' END),
    (NEW.id, 'module.timetable_builder',
      CASE WHEN NEW.subscription_plan IN ('growth','scale','enterprise') THEN 'true' ELSE 'false' END),

    -- ── Module flags: scale and above ────────────────────────
    (NEW.id, 'module.transport',
      CASE WHEN NEW.subscription_plan IN ('scale','enterprise') THEN 'true' ELSE 'false' END),
    (NEW.id, 'module.hostel',
      CASE WHEN NEW.subscription_plan IN ('scale','enterprise') THEN 'true' ELSE 'false' END),
    (NEW.id, 'module.timetable_live_adjust',
      CASE WHEN NEW.subscription_plan IN ('scale','enterprise') THEN 'true' ELSE 'false' END)

  ON CONFLICT (school_id, config_key) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── 4. Backfill existing schools ─────────────────────────────

INSERT INTO school_configs (school_id, config_key, config_value)
SELECT s.id, 'module.timetable_builder',
  CASE WHEN s.subscription_plan IN ('growth','scale','enterprise') THEN 'true' ELSE 'false' END
FROM schools s
ON CONFLICT (school_id, config_key) DO NOTHING;

INSERT INTO school_configs (school_id, config_key, config_value)
SELECT s.id, 'module.timetable_live_adjust',
  CASE WHEN s.subscription_plan IN ('scale','enterprise') THEN 'true' ELSE 'false' END
FROM schools s
ON CONFLICT (school_id, config_key) DO NOTHING;

-- ============================================================
-- M2: Constraints — subject requirements, teacher availability
-- ============================================================

-- ── 5. subject_period_requirements ──────────────────────────

CREATE TABLE IF NOT EXISTS subject_period_requirements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  grade_id              UUID REFERENCES grades(id) ON DELETE CASCADE,
  stream_id             UUID REFERENCES streams(id) ON DELETE CASCADE,
  subject_id            UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  periods_per_week      INT NOT NULL DEFAULT 5 CHECK (periods_per_week >= 1),
  double_period_allowed BOOLEAN NOT NULL DEFAULT false,
  min_double_periods    INT NOT NULL DEFAULT 0,
  max_double_periods    INT NOT NULL DEFAULT 0,
  preferred_room_type   TEXT CHECK (preferred_room_type IN ('classroom','lab','computer_lab','hall','library','sports','other')),
  requires_specific_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  priority              INT NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  CONSTRAINT spr_grade_or_stream CHECK (
    (grade_id IS NOT NULL AND stream_id IS NULL) OR
    (stream_id IS NOT NULL AND grade_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spr_grade_subject
  ON subject_period_requirements(school_id, grade_id, subject_id)
  WHERE stream_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_spr_stream_subject
  ON subject_period_requirements(school_id, stream_id, subject_id)
  WHERE stream_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_spr_school ON subject_period_requirements(school_id);

-- ── 6. teacher_availability ───────────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_availability (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day_of_week  INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period_index INT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'neutral'
                CHECK (status IN ('unavailable','preferred','neutral')),
  reason       TEXT,
  UNIQUE (staff_id, day_of_week, period_index)
);

CREATE INDEX IF NOT EXISTS idx_ta_school   ON teacher_availability(school_id);
CREATE INDEX IF NOT EXISTS idx_ta_staff    ON teacher_availability(staff_id);

-- ── 7. teacher_constraints ────────────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_constraints (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id             UUID NOT NULL UNIQUE REFERENCES staff(id) ON DELETE CASCADE,
  max_periods_per_day  INT,
  max_periods_per_week INT,
  max_consecutive      INT,
  no_first_period      BOOLEAN NOT NULL DEFAULT false,
  no_last_period       BOOLEAN NOT NULL DEFAULT false,
  preferred_days       INT[],
  min_off_days_per_week INT NOT NULL DEFAULT 0,
  notes                TEXT
);

CREATE INDEX IF NOT EXISTS idx_tc_school ON teacher_constraints(school_id);

-- ── 8. M2 RLS ─────────────────────────────────────────────────

DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'subject_period_requirements','teacher_availability','teacher_constraints'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "si_%I" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "si_%I" ON %I FOR ALL TO authenticated
       USING (school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid)
       WITH CHECK (school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid)',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================
-- M3: Timetable containers + slot grid + conflict + run audit
-- ============================================================

-- ── 9. timetables ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timetables (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id    UUID REFERENCES academic_years(id) ON DELETE SET NULL,
  semester_id         UUID REFERENCES semesters(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','generating','generated','published','archived')),
  generated_at        TIMESTAMPTZ,
  generator_version   TEXT,
  generation_run_id   UUID,
  published_at        TIMESTAMPTZ,
  published_by        UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_timetables_one_published
  ON timetables(school_id, semester_id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_timetables_school ON timetables(school_id, status);

-- ── 10. timetable_generation_runs ─────────────────────────────

CREATE TABLE IF NOT EXISTS timetable_generation_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  timetable_id     UUID REFERENCES timetables(id) ON DELETE CASCADE,
  triggered_by     UUID REFERENCES staff(id) ON DELETE SET NULL,
  algorithm        TEXT NOT NULL DEFAULT 'csp_backtrack'
                    CHECK (algorithm IN ('csp_backtrack','csp_hillclimb','simulated_annealing')),
  seed             BIGINT,
  input_snapshot   JSONB,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  runtime_ms       INT,
  status           TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','succeeded','failed','timeout','partial')),
  iterations       INT,
  conflicts_found  INT,
  cost_score       NUMERIC,
  error_message    TEXT,
  log_tail         TEXT
);

CREATE INDEX IF NOT EXISTS idx_tgr_timetable ON timetable_generation_runs(timetable_id);
CREATE INDEX IF NOT EXISTS idx_tgr_school    ON timetable_generation_runs(school_id);

-- ── 11. timetable_slots ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timetable_slots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  timetable_id UUID NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  stream_id    UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  day_of_week  INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period_id    UUID REFERENCES timetable_periods(id) ON DELETE SET NULL,
  period_index INT NOT NULL,
  subject_id   UUID REFERENCES subjects(id) ON DELETE SET NULL,
  staff_id     UUID REFERENCES staff(id) ON DELETE SET NULL,
  room_id      UUID REFERENCES rooms(id) ON DELETE SET NULL,
  slot_type    TEXT NOT NULL DEFAULT 'lesson'
                CHECK (slot_type IN ('lesson','break','free','assembly','study_hall')),
  is_double    BOOLEAN NOT NULL DEFAULT false,
  pair_slot_id UUID REFERENCES timetable_slots(id) ON DELETE SET NULL,
  is_locked    BOOLEAN NOT NULL DEFAULT false,
  notes        TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (timetable_id, stream_id, day_of_week, period_index)
);

CREATE INDEX IF NOT EXISTS idx_ts_timetable ON timetable_slots(timetable_id);
CREATE INDEX IF NOT EXISTS idx_ts_teacher   ON timetable_slots(staff_id, day_of_week, period_index);
CREATE INDEX IF NOT EXISTS idx_ts_room      ON timetable_slots(room_id, day_of_week, period_index);
CREATE INDEX IF NOT EXISTS idx_ts_stream    ON timetable_slots(stream_id, timetable_id);

-- ── 12. timetable_conflicts ────────────────────────────────────

CREATE TABLE IF NOT EXISTS timetable_conflicts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timetable_id      UUID NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
  slot_id           UUID REFERENCES timetable_slots(id) ON DELETE CASCADE,
  conflicting_slot_id UUID REFERENCES timetable_slots(id) ON DELETE SET NULL,
  severity          TEXT NOT NULL DEFAULT 'error'
                     CHECK (severity IN ('error','warning','info')),
  kind              TEXT NOT NULL CHECK (kind IN (
                     'teacher_clash','room_clash','period_count_short','period_count_over',
                     'unavailable_teacher','room_capacity','consecutive_exceeded','missing_room'
                    )),
  description       TEXT NOT NULL,
  resolved          BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tc_timetable ON timetable_conflicts(timetable_id, resolved);

-- ── 13. M3 RLS ────────────────────────────────────────────────

DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'timetables','timetable_generation_runs','timetable_slots'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "si_%I" ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY "si_%I" ON %I FOR ALL TO authenticated
       USING (school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid)
       WITH CHECK (school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid)',
      t, t
    );
  END LOOP;
END $$;

ALTER TABLE timetable_conflicts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si_timetable_conflicts" ON timetable_conflicts;
CREATE POLICY "si_timetable_conflicts" ON timetable_conflicts
  FOR ALL TO authenticated
  USING (
    timetable_id IN (
      SELECT id FROM timetables
      WHERE school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    )
  );

-- ── 14. subject_colors ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subject_colors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  bg_color   TEXT NOT NULL DEFAULT '#4F46E5',
  fg_color   TEXT NOT NULL DEFAULT '#FFFFFF',
  icon_name  TEXT,
  UNIQUE (school_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_sc_school ON subject_colors(school_id);

ALTER TABLE subject_colors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si_subject_colors" ON subject_colors;
CREATE POLICY "si_subject_colors" ON subject_colors
  FOR ALL TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid)
  WITH CHECK (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);
