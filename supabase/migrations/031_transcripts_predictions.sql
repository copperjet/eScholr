-- Migration 031: Academic Transcripts and Grade Predictions
-- Phase 2: Academic Depth

-- Generated transcripts
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year_ids UUID[] NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now(),
  generated_by UUID REFERENCES staff(id),
  pdf_url TEXT,
  status TEXT DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  notes TEXT
);

-- Grade predictions based on prior performance
CREATE TABLE grade_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  prediction_type TEXT NOT NULL CHECK (prediction_type IN ('algorithm', 'teacher_override')),
  predicted_grade TEXT,
  confidence_score DECIMAL(3,2),
  basis_marks UUID[],
  teacher_override_by UUID REFERENCES staff(id),
  override_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, subject_id, semester_id)
);

-- Indexes
CREATE INDEX idx_transcripts_school ON transcripts(school_id);
CREATE INDEX idx_transcripts_student ON transcripts(student_id);
CREATE INDEX idx_predictions_school ON grade_predictions(school_id);
CREATE INDEX idx_predictions_student ON grade_predictions(student_id);
CREATE INDEX idx_predictions_semester ON grade_predictions(semester_id);

-- RLS policies
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_predictions ENABLE ROW LEVEL SECURITY;

-- Staff access
CREATE POLICY "Staff can access transcripts"
  ON transcripts FOR ALL
  USING (school_id IN (SELECT school_id FROM staff WHERE auth_user_id = auth.uid()));

CREATE POLICY "Staff can access predictions"
  ON grade_predictions FOR ALL
  USING (school_id IN (SELECT school_id FROM staff WHERE auth_user_id = auth.uid()));

-- Student access (own records)
CREATE POLICY "Students can view own transcripts"
  ON transcripts FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()));

CREATE POLICY "Students can view own predictions"
  ON grade_predictions FOR SELECT
  USING (student_id IN (SELECT id FROM students WHERE auth_user_id = auth.uid()));

-- Parent access (their children's records)
CREATE POLICY "Parents can view children's transcripts"
  ON transcripts FOR SELECT
  USING (student_id IN (
    SELECT s.id FROM students s
    JOIN student_parent_links spl ON s.id = spl.student_id
    JOIN parents p ON spl.parent_id = p.id
    WHERE p.auth_user_id = auth.uid()
  ));

CREATE POLICY "Parents can view children's predictions"
  ON grade_predictions FOR SELECT
  USING (student_id IN (
    SELECT s.id FROM students s
    JOIN student_parent_links spl ON s.id = spl.student_id
    JOIN parents p ON spl.parent_id = p.id
    WHERE p.auth_user_id = auth.uid()
  ));

-- Trigger for updated_at on predictions
CREATE TRIGGER update_predictions_updated_at
  BEFORE UPDATE ON grade_predictions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
