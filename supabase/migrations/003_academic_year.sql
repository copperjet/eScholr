-- ============================================================
-- 003_academic_year.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS academic_years (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS semesters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  marks_open_date   TIMESTAMPTZ,
  marks_close_date  TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT false,
  order_index       INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  event_type       TEXT NOT NULL DEFAULT 'other'
    CHECK (event_type IN ('holiday','exam_period','parent_evening','other')),
  recurrence_rule  TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active academic year per school
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_year
  ON academic_years(school_id) WHERE is_active = true;

-- Only one active semester per school
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_semester
  ON semesters(school_id) WHERE is_active = true;

-- Helper: get active semester for current school
CREATE OR REPLACE FUNCTION get_active_semester(p_school_id UUID)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT id FROM semesters WHERE school_id = p_school_id AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_marks_window_open(p_semester_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT marks_open_date IS NOT NULL
    AND marks_close_date IS NOT NULL
    AND now() BETWEEN marks_open_date AND marks_close_date
  FROM semesters WHERE id = p_semester_id;
$$;

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE academic_years  ENABLE ROW LEVEL SECURITY;
ALTER TABLE semesters       ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "si_academic_years"  ON academic_years  FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
CREATE POLICY "si_semesters"       ON semesters       FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
DROP POLICY IF EXISTS "si_calendar_events" ON calendar_events;
CREATE POLICY "si_calendar_events" ON calendar_events FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_years_school    ON academic_years(school_id);
CREATE INDEX IF NOT EXISTS idx_semesters_year  ON semesters(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_events_school   ON calendar_events(school_id);
CREATE INDEX IF NOT EXISTS idx_events_dates    ON calendar_events(start_date, end_date);
