-- Migration 029: Homework Module Tables
-- Phase 2: Academic Depth

-- Homework assignments by teachers
CREATE TABLE homework_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  stream_id UUID NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  attachment_url TEXT,
  max_score INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Student submissions
CREATE TABLE homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  submission_text TEXT,
  attachment_url TEXT,
  score INTEGER,
  feedback TEXT,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted', 'graded', 'late', 'resubmitted')),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  graded_by UUID REFERENCES staff(id),
  graded_at TIMESTAMPTZ,
  UNIQUE(homework_id, student_id)
);

-- Indexes
CREATE INDEX idx_homework_school ON homework_assignments(school_id);
CREATE INDEX idx_homework_stream ON homework_assignments(stream_id);
CREATE INDEX idx_homework_semester ON homework_assignments(semester_id);
CREATE INDEX idx_homework_due ON homework_assignments(due_date);
CREATE INDEX idx_submission_homework ON homework_submissions(homework_id);
CREATE INDEX idx_submission_student ON homework_submissions(student_id);

-- RLS policies for homework_assignments
ALTER TABLE homework_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Homework school scoped"
  ON homework_assignments
  USING (school_id IN (
    SELECT s.school_id FROM staff s WHERE s.auth_user_id = auth.uid()
    UNION
    SELECT st.school_id FROM students st WHERE st.auth_user_id = auth.uid()
    UNION
    SELECT p.school_id FROM parents p WHERE p.auth_user_id = auth.uid()
  ));

CREATE POLICY "Teachers can manage homework"
  ON homework_assignments FOR ALL
  USING (assigned_by IN (
    SELECT id FROM staff WHERE auth_user_id = auth.uid()
  ));

-- RLS policies for homework_submissions
ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Submissions school scoped"
  ON homework_submissions
  USING (homework_id IN (
    SELECT ha.id FROM homework_assignments ha
    WHERE ha.school_id IN (
      SELECT s.school_id FROM staff s WHERE s.auth_user_id = auth.uid()
      UNION
      SELECT st.school_id FROM students st WHERE st.auth_user_id = auth.uid()
    )
  ));

CREATE POLICY "Students can submit"
  ON homework_submissions FOR INSERT
  WITH CHECK (student_id IN (
    SELECT id FROM students WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Students can update own submissions"
  ON homework_submissions FOR UPDATE
  USING (student_id IN (
    SELECT id FROM students WHERE auth_user_id = auth.uid()
  ));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_homework_updated_at
  BEFORE UPDATE ON homework_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
