-- ============================================================
-- 007_assignments.sql — HRT + Subject Teacher assignments
-- ============================================================

CREATE TABLE IF NOT EXISTS hrt_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id        UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  stream_id       UUID NOT NULL REFERENCES streams(id),
  semester_id     UUID NOT NULL REFERENCES semesters(id),
  co_hrt_staff_id UUID REFERENCES staff(id),
  UNIQUE (staff_id, stream_id, semester_id)
);

CREATE TABLE IF NOT EXISTS subject_teacher_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id    UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  subject_id  UUID NOT NULL REFERENCES subjects(id),
  stream_id   UUID NOT NULL REFERENCES streams(id),
  semester_id UUID NOT NULL REFERENCES semesters(id),
  UNIQUE (staff_id, subject_id, stream_id, semester_id)
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE hrt_assignments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_teacher_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "si_hrt_assignments" ON hrt_assignments;
CREATE POLICY "si_hrt_assignments" ON hrt_assignments
  FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);
DROP POLICY IF EXISTS "si_sta" ON subject_teacher_assignments;
CREATE POLICY "si_sta" ON subject_teacher_assignments
  FOR ALL TO authenticated USING (school_id=(auth.jwt()->'app_metadata'->>'school_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_hrt_stream    ON hrt_assignments(stream_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_hrt_staff     ON hrt_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_sta_staff     ON subject_teacher_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_sta_stream    ON subject_teacher_assignments(stream_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_sta_subject   ON subject_teacher_assignments(subject_id);
