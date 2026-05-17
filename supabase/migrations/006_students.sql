-- ============================================================
-- 006_students.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS students (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_number  TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  date_of_birth   DATE NOT NULL,
  gender          TEXT NOT NULL CHECK (gender IN ('male','female','other')),
  section_id      UUID NOT NULL REFERENCES school_sections(id),
  grade_id        UUID NOT NULL REFERENCES grades(id),
  stream_id       UUID NOT NULL REFERENCES streams(id),
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','graduated','transferred')),
  photo_url       TEXT,
  medical_notes   TEXT,
  nationality     TEXT,
  first_language  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, student_number)
);

CREATE TABLE IF NOT EXISTS student_year_records (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                 UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id                UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  semester_id               UUID NOT NULL REFERENCES semesters(id),
  stream_id                 UUID NOT NULL REFERENCES streams(id),
  enrollment_date           DATE NOT NULL,
  effective_start_date      DATE NOT NULL,
  fa1_weight_override       DECIMAL(5,2),
  fa2_weight_override       DECIMAL(5,2),
  summative_weight_override DECIMAL(5,2),
  year_end_outcome          TEXT CHECK (year_end_outcome IN ('promoted','graduated','repeat_year','transferred')),
  year_end_reason           TEXT,
  created_by                UUID REFERENCES staff(id),
  UNIQUE (student_id, semester_id)
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE UNIQUE,
  contact_name    TEXT NOT NULL,
  relationship    TEXT NOT NULL CHECK (relationship IN ('mother','father','guardian','grandparent','sibling','other')),
  phone_primary   TEXT NOT NULL,
  phone_secondary TEXT,
  medical_alert   TEXT
);

CREATE TABLE IF NOT EXISTS student_parent_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id  UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  UNIQUE (student_id, parent_id)
);

CREATE TABLE IF NOT EXISTS subject_enrollments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id),
  semester_id UUID NOT NULL REFERENCES semesters(id),
  is_locked  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (student_id, subject_id, semester_id)
);

-- Auto-generate student_number: S00001 …
CREATE OR REPLACE FUNCTION generate_student_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM students WHERE school_id = NEW.school_id;
  NEW.student_number := 'S' || LPAD((v_count + 1)::TEXT, 5, '0');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_student_number ON students;
CREATE TRIGGER trg_student_number BEFORE INSERT ON students
FOR EACH ROW WHEN (NEW.student_number IS NULL) EXECUTE FUNCTION generate_student_number();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE students             ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_year_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_parent_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_enrollments  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "si_students"             ON students             FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
DROP POLICY IF EXISTS "si_student_year_records" ON student_year_records;
CREATE POLICY "si_student_year_records" ON student_year_records FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
CREATE POLICY "si_emergency_contacts"   ON emergency_contacts   FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
DROP POLICY IF EXISTS "si_student_parent_links" ON student_parent_links;
CREATE POLICY "si_student_parent_links" ON student_parent_links FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
CREATE POLICY "si_subject_enrollments"  ON subject_enrollments  FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_students_school  ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_stream  ON students(stream_id);
CREATE INDEX IF NOT EXISTS idx_students_grade   ON students(grade_id);
CREATE INDEX IF NOT EXISTS idx_students_status  ON students(status);
CREATE INDEX IF NOT EXISTS idx_syr_student      ON student_year_records(student_id);
CREATE INDEX IF NOT EXISTS idx_syr_semester     ON student_year_records(semester_id);
CREATE INDEX IF NOT EXISTS idx_spl_student      ON student_parent_links(student_id);
CREATE INDEX IF NOT EXISTS idx_spl_parent       ON student_parent_links(parent_id);
CREATE INDEX IF NOT EXISTS idx_se_student       ON subject_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_se_semester      ON subject_enrollments(semester_id);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_students_fts ON students
  USING gin(to_tsvector('english', full_name || ' ' || student_number));
