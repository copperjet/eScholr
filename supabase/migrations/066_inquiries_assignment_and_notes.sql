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
    -- author_id must match caller for user notes; NULL allowed for trigger-generated system notes
    AND (author_id = auth.uid() OR author_id IS NULL)
  );

CREATE POLICY "author_update" ON inquiry_notes
  FOR UPDATE
  USING (author_id = auth.uid() AND created_at > now() - interval '15 min')
  WITH CHECK (author_id = auth.uid() AND created_at > now() - interval '15 min');

CREATE POLICY "author_delete" ON inquiry_notes
  FOR DELETE
  USING (author_id = auth.uid() AND created_at > now() - interval '15 min');

-- AFTER UPDATE trigger on inquiries for audit trail.
-- NOTE: auth.uid() is not available inside a trigger body (no JWT context).
-- We record a sentinel system-user UUID via a DB setting or leave author_id
-- nullable for system-generated events. Here we make author_id nullable for
-- 'status_change' and 'assignment' kinds so the trigger never violates the
-- NOT NULL. For notes added by real users (kind='note'), the application layer
-- supplies author_id directly.
ALTER TABLE inquiry_notes ALTER COLUMN author_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION inquiry_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Log status changes (IS DISTINCT FROM handles NULL comparisons correctly)
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO inquiry_notes (inquiry_id, school_id, author_id, body, kind, meta)
    VALUES (
      NEW.id,
      NEW.school_id,
      NULL,  -- system-generated; no JWT in trigger context
      'Status changed from ' || OLD.status || ' to ' || NEW.status,
      'status_change',
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;

  -- IS DISTINCT FROM correctly handles NULL -> UUID and UUID -> NULL transitions
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO inquiry_notes (inquiry_id, school_id, author_id, body, kind, meta)
    VALUES (
      NEW.id,
      NEW.school_id,
      NULL,  -- system-generated
      CASE
        WHEN NEW.assigned_to IS NULL THEN 'Inquiry unassigned'
        ELSE 'Inquiry assigned to ' || COALESCE((SELECT full_name FROM profiles WHERE id = NEW.assigned_to), 'Unknown')
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
