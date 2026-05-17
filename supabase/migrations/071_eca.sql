-- ============================================================
-- 071_eca.sql
-- Extra Curricular Activities module
-- ============================================================

-- ── Enums ─────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE eca_activity_status  AS ENUM ('draft','published','closed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE eca_assignment_status AS ENUM ('assigned','waitlisted','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE eca_attendance_status AS ENUM ('present','absent','late','excused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Tables ────────────────────────────────────────────────────

-- 1. Categories (e.g. Clubs, Sports, Paid Activities)
CREATE TABLE IF NOT EXISTS eca_categories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  max_choices  SMALLINT NOT NULL DEFAULT 3 CHECK (max_choices BETWEEN 1 AND 5),
  allow_paid   BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

-- 2. Activities (e.g. Football, Chess)
CREATE TABLE IF NOT EXISTS eca_activities (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  category_id          UUID NOT NULL REFERENCES eca_categories(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  description          TEXT,
  capacity             INTEGER NOT NULL CHECK (capacity > 0),
  day_of_week          SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
  start_time           TIME,
  end_time             TIME,
  location             TEXT,
  fee_amount           DECIMAL(12,2) NOT NULL DEFAULT 0,
  status               eca_activity_status NOT NULL DEFAULT 'draft',
  choice_window_start  TIMESTAMPTZ,
  choice_window_end    TIMESTAMPTZ,
  created_by           UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT end_after_start CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time)
);

-- 3. Eligible streams per activity
CREATE TABLE IF NOT EXISTS eca_activity_eligible_streams (
  activity_id  UUID NOT NULL REFERENCES eca_activities(id) ON DELETE CASCADE,
  stream_id    UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, stream_id)
);

-- 4. Patrons (staff assigned to activity)
CREATE TABLE IF NOT EXISTS eca_activity_patrons (
  activity_id  UUID NOT NULL REFERENCES eca_activities(id) ON DELETE CASCADE,
  staff_id     UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  school_id    UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (activity_id, staff_id)
);

-- 5. Student choices (ranked preferences)
CREATE TABLE IF NOT EXISTS eca_choices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id            UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category_id           UUID NOT NULL REFERENCES eca_categories(id) ON DELETE CASCADE,
  choice_rank           SMALLINT NOT NULL CHECK (choice_rank BETWEEN 1 AND 5),
  activity_id           UUID NOT NULL REFERENCES eca_activities(id) ON DELETE CASCADE,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by_parent_id UUID REFERENCES parents(id),
  UNIQUE (student_id, category_id, choice_rank)
);

-- 6. Assignments (result of allocation)
CREATE TABLE IF NOT EXISTS eca_assignments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id               UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category_id              UUID NOT NULL REFERENCES eca_categories(id) ON DELETE CASCADE,
  activity_id              UUID REFERENCES eca_activities(id) ON DELETE SET NULL,
  assigned_from_choice_rank SMALLINT,
  status                   eca_assignment_status NOT NULL DEFAULT 'assigned',
  assigned_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by              UUID REFERENCES auth.users(id)
);

-- One active assignment per student per category
CREATE UNIQUE INDEX IF NOT EXISTS eca_assignments_active_unique
  ON eca_assignments(student_id, category_id)
  WHERE status <> 'withdrawn';

-- 7. Attendance per session
CREATE TABLE IF NOT EXISTS eca_attendance (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  activity_id       UUID NOT NULL REFERENCES eca_activities(id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_date      DATE NOT NULL,
  status            eca_attendance_status NOT NULL,
  marked_by_staff_id UUID REFERENCES staff(id),
  marked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  note              TEXT,
  UNIQUE (activity_id, student_id, session_date)
);

-- ── RLS ───────────────────────────────────────────────────────
DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'eca_categories','eca_activities','eca_activity_eligible_streams',
    'eca_activity_patrons','eca_choices','eca_assignments','eca_attendance'
  ]) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS "si_%I" ON %I',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY "si_%I" ON %I FOR ALL TO authenticated
       USING (school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid)
       WITH CHECK (school_id = (auth.jwt()->''app_metadata''->>''school_id'')::uuid)',
      t, t
    );
  END LOOP;
END $$;

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_eca_cat_school          ON eca_categories(school_id);
CREATE INDEX IF NOT EXISTS idx_eca_act_school_cat      ON eca_activities(school_id, category_id);
CREATE INDEX IF NOT EXISTS idx_eca_act_school_status   ON eca_activities(school_id, status);
CREATE INDEX IF NOT EXISTS idx_eca_elig_stream         ON eca_activity_eligible_streams(stream_id);
CREATE INDEX IF NOT EXISTS idx_eca_patron_staff        ON eca_activity_patrons(staff_id);
CREATE INDEX IF NOT EXISTS idx_eca_choices_student     ON eca_choices(student_id);
CREATE INDEX IF NOT EXISTS idx_eca_choices_cat_time    ON eca_choices(category_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_eca_assign_student      ON eca_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_eca_assign_activity     ON eca_assignments(activity_id, status);
CREATE INDEX IF NOT EXISTS idx_eca_attend_activity_date ON eca_attendance(activity_id, session_date);
CREATE INDEX IF NOT EXISTS idx_eca_attend_student      ON eca_attendance(student_id);
