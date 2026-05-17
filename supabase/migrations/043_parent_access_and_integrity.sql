-- ============================================================
-- 043_parent_access_and_integrity.sql
-- Parent read access to their children's homework, daybook,
-- finance + integrity indexes/FKs across linked entities.
-- ============================================================

-- ── Helper: parent_id of current auth user ───────────────────
CREATE OR REPLACE FUNCTION current_parent_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM parents WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- ── Helper: student_ids linked to current parent ─────────────
CREATE OR REPLACE FUNCTION current_parent_student_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT student_id FROM student_parent_links
  WHERE parent_id = current_parent_id();
$$;

GRANT EXECUTE ON FUNCTION current_parent_id() TO authenticated;
GRANT EXECUTE ON FUNCTION current_parent_student_ids() TO authenticated;

-- ============================================================
-- 1. PARENT-STUDENT LINK INTEGRITY
-- ============================================================
-- Ensure spl school_id matches student's school_id (data hygiene)
CREATE INDEX IF NOT EXISTS idx_spl_school_student
  ON student_parent_links(school_id, student_id);

-- ============================================================
-- 2. STUDENTS: parent can read own children
-- ============================================================
DROP POLICY IF EXISTS students_parent_read ON students;
CREATE POLICY students_parent_read ON students FOR SELECT TO authenticated
  USING (id IN (SELECT current_parent_student_ids()));

-- ============================================================
-- 3. HOMEWORK: parent read for linked students' streams
-- ============================================================
DROP POLICY IF EXISTS homework_parent_read ON homework_assignments;
CREATE POLICY homework_parent_read ON homework_assignments FOR SELECT TO authenticated
  USING (stream_id IN (
    SELECT stream_id FROM students
    WHERE id IN (SELECT current_parent_student_ids())
  ));

DROP POLICY IF EXISTS submissions_parent_read ON homework_submissions;
CREATE POLICY submissions_parent_read ON homework_submissions FOR SELECT TO authenticated
  USING (student_id IN (SELECT current_parent_student_ids()));

-- ============================================================
-- 4. DAYBOOK: parent read only entries marked send_to_parent
-- ============================================================
DROP POLICY IF EXISTS daybook_parent_read ON day_book_entries;
CREATE POLICY daybook_parent_read ON day_book_entries FOR SELECT TO authenticated
  USING (
    send_to_parent = true
    AND archived = false
    AND student_id IN (SELECT current_parent_student_ids())
  );

-- ============================================================
-- 5. FINANCE: parent read of own children's invoices + items + payments
-- ============================================================
DROP POLICY IF EXISTS invoices_parent_read ON invoices;
CREATE POLICY invoices_parent_read ON invoices FOR SELECT TO authenticated
  USING (student_id IN (SELECT current_parent_student_ids()));

DROP POLICY IF EXISTS invoice_items_parent_read ON invoice_items;
CREATE POLICY invoice_items_parent_read ON invoice_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_items.invoice_id
      AND i.student_id IN (SELECT current_parent_student_ids())
  ));

DROP POLICY IF EXISTS finance_parent_read ON finance_records;
CREATE POLICY finance_parent_read ON finance_records FOR SELECT TO authenticated
  USING (student_id IN (SELECT current_parent_student_ids()));

DROP POLICY IF EXISTS payments_parent_read ON payment_transactions;
CREATE POLICY payments_parent_read ON payment_transactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM finance_records fr
    WHERE fr.id = payment_transactions.finance_record_id
      AND fr.student_id IN (SELECT current_parent_student_ids())
  ));

-- ============================================================
-- 6. EMERGENCY CONTACTS: parent read for own children
-- ============================================================
DROP POLICY IF EXISTS emergency_parent_read ON emergency_contacts;
CREATE POLICY emergency_parent_read ON emergency_contacts FOR SELECT TO authenticated
  USING (student_id IN (SELECT current_parent_student_ids()));

-- ============================================================
-- 7. SUBJECT ENROLLMENTS: parent read
-- ============================================================
DROP POLICY IF EXISTS subject_enrol_parent_read ON subject_enrollments;
CREATE POLICY subject_enrol_parent_read ON subject_enrollments FOR SELECT TO authenticated
  USING (student_id IN (SELECT current_parent_student_ids()));

-- ============================================================
-- 8. INTEGRITY INDEXES (missing hot paths)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_invoice_items_school_inv
  ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_fee_sched_grade_stream
  ON fee_schedules(grade_id, stream_id);
CREATE INDEX IF NOT EXISTS idx_homework_subject
  ON homework_assignments(subject_id);
CREATE INDEX IF NOT EXISTS idx_homework_assigned_by
  ON homework_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_messages_student_created
  ON messages(student_id, created_at DESC);

-- ============================================================
-- 9. STUDENT_PARENT_LINKS: guarantee school_id alignment
-- ============================================================
CREATE OR REPLACE FUNCTION spl_align_school()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT school_id INTO NEW.school_id FROM students WHERE id = NEW.student_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_spl_align_school ON student_parent_links;
CREATE TRIGGER trg_spl_align_school
  BEFORE INSERT OR UPDATE ON student_parent_links
  FOR EACH ROW EXECUTE FUNCTION spl_align_school();
