-- ============================================================
-- 053_library_module.sql
-- School Library module: catalog, collections, transactions,
-- settings, dashboard RPCs.  Adds 'librarian' role.
-- ============================================================

-- ── 1. Expand staff_roles CHECK to include 'librarian' ───────
ALTER TABLE staff_roles
  DROP CONSTRAINT IF EXISTS staff_roles_role_check;

ALTER TABLE staff_roles
  ADD CONSTRAINT staff_roles_role_check
  CHECK (role IN (
    'super_admin','school_super_admin','admin','front_desk','finance',
    'hr','principal','coordinator','hod','hrt','st','librarian'
  ));

-- ── 2. Library collections (genres / shelves) ────────────────
CREATE TABLE IF NOT EXISTS library_collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  color       text DEFAULT '#3B82F6',
  icon        text DEFAULT 'library-outline',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (school_id, name)
);

-- ── 3. Library books (master catalog) ────────────────────────
CREATE TABLE IF NOT EXISTS library_books (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title             text NOT NULL,
  author            text,
  isbn              text,
  publisher         text,
  publish_year      smallint,
  cover_url         text,
  accession_number  text NOT NULL,
  barcode           text,
  status            text NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','checked_out','lost','damaged','reserved')),
  collection_id     uuid REFERENCES library_collections(id) ON DELETE SET NULL,
  total_copies      int NOT NULL DEFAULT 1,
  available_copies  int NOT NULL DEFAULT 1,
  added_by          uuid REFERENCES staff(id) ON DELETE SET NULL,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (school_id, accession_number),
  UNIQUE (school_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_library_books_school
  ON library_books(school_id);
CREATE INDEX IF NOT EXISTS idx_library_books_collection
  ON library_books(school_id, collection_id);
CREATE INDEX IF NOT EXISTS idx_library_books_status
  ON library_books(school_id, status);
CREATE INDEX IF NOT EXISTS idx_library_books_isbn
  ON library_books(school_id, isbn) WHERE isbn IS NOT NULL;

-- ── 4. Library transactions (check-in / check-out ledger) ────
CREATE TABLE IF NOT EXISTS library_transactions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  book_id              uuid NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  borrower_type        text NOT NULL CHECK (borrower_type IN ('staff','student')),
  borrower_staff_id    uuid REFERENCES staff(id) ON DELETE SET NULL,
  borrower_student_id  uuid REFERENCES students(id) ON DELETE SET NULL,
  checked_out_at       timestamptz NOT NULL DEFAULT now(),
  due_date             date NOT NULL,
  checked_in_at        timestamptz,
  checked_out_by       uuid REFERENCES staff(id) ON DELETE SET NULL,
  checked_in_by        uuid REFERENCES staff(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','returned','overdue','lost')),
  notes                text,
  created_at           timestamptz DEFAULT now(),
  -- Exactly one borrower must be set
  CONSTRAINT chk_borrower CHECK (
    (borrower_staff_id IS NOT NULL AND borrower_student_id IS NULL)
    OR
    (borrower_staff_id IS NULL AND borrower_student_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lib_tx_school
  ON library_transactions(school_id);
CREATE INDEX IF NOT EXISTS idx_lib_tx_book
  ON library_transactions(book_id);
CREATE INDEX IF NOT EXISTS idx_lib_tx_status
  ON library_transactions(school_id, status);
CREATE INDEX IF NOT EXISTS idx_lib_tx_borrower_staff
  ON library_transactions(borrower_staff_id) WHERE borrower_staff_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lib_tx_borrower_student
  ON library_transactions(borrower_student_id) WHERE borrower_student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lib_tx_due_date
  ON library_transactions(due_date) WHERE status = 'active';

-- ── 5. Library settings (per school) ─────────────────────────
CREATE TABLE IF NOT EXISTS library_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE UNIQUE,
  default_loan_days        int NOT NULL DEFAULT 14,
  max_books_per_student    int NOT NULL DEFAULT 3,
  max_books_per_staff      int NOT NULL DEFAULT 5,
  overdue_notification_days int NOT NULL DEFAULT 3,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);

-- ── 6. RLS ───────────────────────────────────────────────────
ALTER TABLE library_collections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_books          ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_settings       ENABLE ROW LEVEL SECURITY;

-- Helper: extract school_id from JWT app_metadata
CREATE OR REPLACE FUNCTION public.jwt_school_id() RETURNS uuid
LANGUAGE sql STABLE
AS $$ SELECT (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'school_id')::uuid $$;

-- Collections
CREATE POLICY lib_collections_select ON library_collections
  FOR SELECT USING (school_id = public.jwt_school_id());
CREATE POLICY lib_collections_insert ON library_collections
  FOR INSERT WITH CHECK (school_id = public.jwt_school_id());
CREATE POLICY lib_collections_update ON library_collections
  FOR UPDATE USING (school_id = public.jwt_school_id());
CREATE POLICY lib_collections_delete ON library_collections
  FOR DELETE USING (school_id = public.jwt_school_id());

-- Books
CREATE POLICY lib_books_select ON library_books
  FOR SELECT USING (school_id = public.jwt_school_id());
CREATE POLICY lib_books_insert ON library_books
  FOR INSERT WITH CHECK (school_id = public.jwt_school_id());
CREATE POLICY lib_books_update ON library_books
  FOR UPDATE USING (school_id = public.jwt_school_id());
CREATE POLICY lib_books_delete ON library_books
  FOR DELETE USING (school_id = public.jwt_school_id());

-- Transactions
CREATE POLICY lib_tx_select ON library_transactions
  FOR SELECT USING (school_id = public.jwt_school_id());
CREATE POLICY lib_tx_insert ON library_transactions
  FOR INSERT WITH CHECK (school_id = public.jwt_school_id());
CREATE POLICY lib_tx_update ON library_transactions
  FOR UPDATE USING (school_id = public.jwt_school_id());

-- Settings
CREATE POLICY lib_settings_select ON library_settings
  FOR SELECT USING (school_id = public.jwt_school_id());
CREATE POLICY lib_settings_insert ON library_settings
  FOR INSERT WITH CHECK (school_id = public.jwt_school_id());
CREATE POLICY lib_settings_update ON library_settings
  FOR UPDATE USING (school_id = public.jwt_school_id());

-- ── 7. Dashboard stats RPC ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_library_dashboard_stats(p_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_total       int;
  v_available   int;
  v_checked_out int;
  v_overdue     int;
  v_lost        int;
  v_collections int;
  v_result      jsonb;
BEGIN
  SELECT COUNT(*)                          INTO v_total       FROM library_books WHERE school_id = p_school_id;
  SELECT COALESCE(SUM(available_copies),0) INTO v_available   FROM library_books WHERE school_id = p_school_id;
  SELECT COUNT(*)                          INTO v_checked_out FROM library_transactions WHERE school_id = p_school_id AND status = 'active';
  SELECT COUNT(*)                          INTO v_overdue     FROM library_transactions WHERE school_id = p_school_id AND status = 'active' AND due_date < CURRENT_DATE;
  SELECT COUNT(*)                          INTO v_lost        FROM library_books WHERE school_id = p_school_id AND status = 'lost';
  SELECT COUNT(*)                          INTO v_collections FROM library_collections WHERE school_id = p_school_id;

  v_result := jsonb_build_object(
    'total_books',   v_total,
    'available',     v_available,
    'checked_out',   v_checked_out,
    'overdue',       v_overdue,
    'lost',          v_lost,
    'collections',   v_collections
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_library_dashboard_stats TO authenticated;

-- ── 8. Overdue books RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_overdue_books(p_school_id uuid)
RETURNS TABLE (
  transaction_id   uuid,
  book_title       text,
  accession_number text,
  borrower_name    text,
  borrower_type    text,
  due_date         date,
  days_overdue     int,
  checked_out_at   timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    t.id               AS transaction_id,
    b.title            AS book_title,
    b.accession_number,
    CASE
      WHEN t.borrower_type = 'staff'   THEN s.full_name
      WHEN t.borrower_type = 'student' THEN st.full_name
      ELSE 'Unknown'
    END                AS borrower_name,
    t.borrower_type,
    t.due_date,
    (CURRENT_DATE - t.due_date)::int AS days_overdue,
    t.checked_out_at
  FROM library_transactions t
  JOIN library_books b ON b.id = t.book_id
  LEFT JOIN staff s    ON s.id = t.borrower_staff_id
  LEFT JOIN students st ON st.id = t.borrower_student_id
  WHERE t.school_id = p_school_id
    AND t.status = 'active'
    AND t.due_date < CURRENT_DATE
  ORDER BY t.due_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_overdue_books TO authenticated;
