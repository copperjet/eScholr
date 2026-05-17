-- ============================================================
-- 010_character.sql — CREED character assessments
-- ============================================================

CREATE TABLE IF NOT EXISTS character_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  semester_id UUID NOT NULL REFERENCES semesters(id),
  creativity  TEXT,
  respect     TEXT,
  excellence  TEXT,
  empathy     TEXT,
  discipline  TEXT,
  extra_values JSONB NOT NULL DEFAULT '{}',
  entered_by  UUID NOT NULL REFERENCES staff(id),
  is_locked   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, semester_id)
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE character_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "si_character_records" ON character_records;
CREATE POLICY "si_character_records" ON character_records FOR ALL TO authenticated
  USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_cr_student   ON character_records(student_id);
CREATE INDEX IF NOT EXISTS idx_cr_semester  ON character_records(semester_id);
