-- ─────────────────────────────────────────────────────────────────────────────
-- 022_timetable.sql
-- Timetable documents: admin upload PDF/image per grade/stream; all roles view.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timetable_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  grade_id        uuid REFERENCES grades(id) ON DELETE SET NULL,
  stream_id       uuid REFERENCES streams(id) ON DELETE SET NULL,
  label           text NOT NULL,              -- e.g. "Grade 10A — Term 1 2026"
  file_url        text NOT NULL,              -- Storage URL
  file_type       text NOT NULL DEFAULT 'pdf', -- 'pdf' | 'image'
  file_name       text NOT NULL,
  file_size_bytes bigint,
  effective_from  date NOT NULL,
  uploaded_by     uuid NOT NULL,              -- auth.users.id
  is_current      boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Only one current timetable per school+grade+stream combo
CREATE UNIQUE INDEX IF NOT EXISTS idx_timetable_current
  ON timetable_documents(school_id, grade_id, stream_id)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_timetable_school
  ON timetable_documents(school_id, effective_from DESC);

-- RLS
ALTER TABLE timetable_documents ENABLE ROW LEVEL SECURITY;

-- Any authenticated user in same school can read
CREATE POLICY "timetable_read" ON timetable_documents
  FOR SELECT USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
  );

-- Admin/coordinator only can insert/delete
CREATE POLICY "timetable_insert" ON timetable_documents
  FOR INSERT WITH CHECK (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| ARRAY['admin','coordinator','super_admin']
  );

CREATE POLICY "timetable_delete" ON timetable_documents
  FOR DELETE USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| ARRAY['admin','coordinator','super_admin']
  );

CREATE POLICY "timetable_update" ON timetable_documents
  FOR UPDATE USING (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    AND (auth.jwt()->'app_metadata'->'roles') ?| ARRAY['admin','coordinator','super_admin']
  );

-- Storage bucket policy comment (apply via Supabase dashboard or separate script):
-- Bucket name: timetables
-- Public: false
-- RLS: SELECT policy — school_id in path matches JWT school_id
-- INSERT/DELETE: admin/coordinator roles only
