-- Add assigned_to column to inquiries
ALTER TABLE inquiries ADD COLUMN assigned_to uuid REFERENCES profiles(id);
CREATE INDEX idx_inquiries_assigned_to ON inquiries(assigned_to);

-- Create inquiry_notes table
CREATE TABLE inquiry_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id),
  author_id uuid NOT NULL REFERENCES profiles(id),
  body text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('note', 'status_change', 'assignment', 'call', 'email', 'conversion')),
  meta jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_inquiry_notes_inquiry_id_created ON inquiry_notes(inquiry_id, created_at DESC);

-- RLS on inquiry_notes
ALTER TABLE inquiry_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_same_school_select" ON inquiry_notes
  FOR SELECT
  USING (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'school_admin', 'front_desk', 'hr', 'principal', 'coordinator')
    )
  );

CREATE POLICY "staff_same_school_insert" ON inquiry_notes
  FOR INSERT
  WITH CHECK (
    school_id IN (
      SELECT school_id FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'school_admin', 'front_desk', 'hr', 'principal', 'coordinator')
    )
    AND author_id = auth.uid()
  );

CREATE POLICY "author_update" ON inquiry_notes
  FOR UPDATE
  USING (author_id = auth.uid() AND created_at > now() - interval '15 min')
  WITH CHECK (author_id = auth.uid() AND created_at > now() - interval '15 min');

CREATE POLICY "author_delete" ON inquiry_notes
  FOR DELETE
  USING (author_id = auth.uid() AND created_at > now() - interval '15 min');

-- AFTER UPDATE trigger on inquiries for audit trail
CREATE OR REPLACE FUNCTION inquiry_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Log status changes
  IF OLD.status != NEW.status THEN
    INSERT INTO inquiry_notes (inquiry_id, school_id, author_id, body, kind, meta)
    VALUES (
      NEW.id,
      NEW.school_id,
      auth.uid(),
      'Status changed from ' || OLD.status || ' to ' || NEW.status,
      'status_change',
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;

  -- Log assignment changes
  IF OLD.assigned_to != NEW.assigned_to THEN
    INSERT INTO inquiry_notes (inquiry_id, school_id, author_id, body, kind, meta)
    VALUES (
      NEW.id,
      NEW.school_id,
      auth.uid(),
      CASE
        WHEN NEW.assigned_to IS NULL THEN 'Inquiry unassigned'
        ELSE 'Inquiry assigned to ' || (SELECT full_name FROM profiles WHERE id = NEW.assigned_to)
      END,
      'assignment',
      jsonb_build_object('old_assigned_to', OLD.assigned_to, 'new_assigned_to', NEW.assigned_to)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS inquiry_audit_trigger ON inquiries;
CREATE TRIGGER inquiry_audit_trigger
AFTER UPDATE ON inquiries
FOR EACH ROW
EXECUTE FUNCTION inquiry_audit_trigger();
