-- ============================================================
-- 066_inquiries_assignment_and_notes.sql
-- Adds staff assignment to inquiries and an inquiry_notes audit trail.
-- Uses the project's staff/staff_roles tables and JWT app_metadata
-- (school_id, staff_id, roles) — there is no `profiles` table.
-- ============================================================

-- ── 1. Assignment column on inquiries ────────────────────────
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES staff(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inquiries_assigned_to ON inquiries(assigned_to);

-- ── 2. inquiry_notes table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS inquiry_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id  uuid NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  school_id   uuid NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  -- author_id NULLABLE: trigger-generated rows have no JWT context
  author_id   uuid REFERENCES staff(id) ON DELETE SET NULL,
  body        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN (
                'note', 'status_change', 'assignment', 'call', 'email', 'conversion'
              )),
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiry_notes_inquiry_created
  ON inquiry_notes(inquiry_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inquiry_notes_school
  ON inquiry_notes(school_id);

-- ── 3. RLS — school-scoped via JWT (matches si_inquiries pattern) ─
ALTER TABLE inquiry_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "si_inquiry_notes_select" ON inquiry_notes;
CREATE POLICY "si_inquiry_notes_select" ON inquiry_notes
  FOR SELECT TO authenticated
  USING (school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid);

DROP POLICY IF EXISTS "si_inquiry_notes_insert" ON inquiry_notes;
CREATE POLICY "si_inquiry_notes_insert" ON inquiry_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = (auth.jwt()->'app_metadata'->>'school_id')::uuid
    -- Author must be the calling staff user, OR null (system trigger).
    AND (
      author_id IS NULL
      OR author_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    )
  );

-- Author can edit/delete their own note within 15 min
DROP POLICY IF EXISTS "inquiry_notes_author_update" ON inquiry_notes;
CREATE POLICY "inquiry_notes_author_update" ON inquiry_notes
  FOR UPDATE TO authenticated
  USING (
    author_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    AND created_at > now() - interval '15 min'
  )
  WITH CHECK (
    author_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    AND created_at > now() - interval '15 min'
  );

DROP POLICY IF EXISTS "inquiry_notes_author_delete" ON inquiry_notes;
CREATE POLICY "inquiry_notes_author_delete" ON inquiry_notes
  FOR DELETE TO authenticated
  USING (
    author_id = (auth.jwt()->'app_metadata'->>'staff_id')::uuid
    AND created_at > now() - interval '15 min'
  );

-- ── 4. Audit trigger on inquiries (status / assignment changes) ──
-- auth.jwt() is not reliably populated inside trigger context, so
-- system-generated notes have author_id = NULL.
CREATE OR REPLACE FUNCTION inquiry_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO inquiry_notes (inquiry_id, school_id, author_id, body, kind, meta)
    VALUES (
      NEW.id, NEW.school_id, NULL,
      'Status changed from ' || OLD.status || ' to ' || NEW.status,
      'status_change',
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO inquiry_notes (inquiry_id, school_id, author_id, body, kind, meta)
    VALUES (
      NEW.id, NEW.school_id, NULL,
      CASE
        WHEN NEW.assigned_to IS NULL THEN 'Inquiry unassigned'
        ELSE 'Inquiry assigned to ' || COALESCE(
          (SELECT full_name FROM staff WHERE id = NEW.assigned_to),
          'Unknown'
        )
      END,
      'assignment',
      jsonb_build_object('old_assigned_to', OLD.assigned_to, 'new_assigned_to', NEW.assigned_to)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inquiry_audit_trigger ON inquiries;
CREATE TRIGGER inquiry_audit_trigger
AFTER UPDATE OF status, assigned_to ON inquiries
FOR EACH ROW EXECUTE FUNCTION inquiry_audit_trigger();
