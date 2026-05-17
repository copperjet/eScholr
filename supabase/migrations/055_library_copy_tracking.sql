-- ============================================================
-- 055_library_copy_tracking.sql
-- Per-copy accession numbers, barcodes, and checkout tracking.
-- ============================================================

-- ── 1. Accession counter per school ──────────────────────────
CREATE TABLE IF NOT EXISTS library_accession_counters (
  school_id    uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  next_number  int NOT NULL DEFAULT 1
);

-- ── 2. Copies table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_book_copies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  book_id          uuid NOT NULL REFERENCES library_books(id) ON DELETE CASCADE,
  accession_number text NOT NULL,
  barcode          text,
  status           text NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available','checked_out','lost','damaged')),
  condition_notes  text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (school_id, accession_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lib_copies_barcode_unique
  ON library_book_copies(school_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lib_copies_book ON library_book_copies(book_id);
CREATE INDEX IF NOT EXISTS idx_lib_copies_school ON library_book_copies(school_id);
CREATE INDEX IF NOT EXISTS idx_lib_copies_status ON library_book_copies(school_id, status);

-- ── 3. Add copy_id to transactions ───────────────────────────
ALTER TABLE library_transactions ADD COLUMN IF NOT EXISTS copy_id uuid REFERENCES library_book_copies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lib_tx_copy ON library_transactions(copy_id);

-- ── 4. Migrate existing data ─────────────────────────────────
-- One copy per existing book
INSERT INTO library_book_copies (school_id, book_id, accession_number, barcode, status, created_at)
SELECT
  school_id,
  id AS book_id,
  COALESCE(accession_number, 'MIGRATED-' || substring(id::text, 1, 8)),
  barcode,
  CASE WHEN available_copies > 0 THEN 'available' ELSE 'checked_out' END,
  created_at
FROM library_books
WHERE id NOT IN (SELECT book_id FROM library_book_copies);

-- Migrate existing transactions to copy_id
UPDATE library_transactions t
SET copy_id = c.id
FROM library_book_copies c
WHERE c.book_id = t.book_id AND t.copy_id IS NULL;

-- ── 5. Drop old RPCs that reference removed columns ───────────
DROP FUNCTION IF EXISTS public.library_check_out(uuid, uuid, text, uuid, date, uuid, text);
DROP FUNCTION IF EXISTS public.library_check_in(uuid, uuid, uuid, uuid, text);

-- ── 6. Drop columns moved to copies ──────────────────────────
ALTER TABLE library_books DROP COLUMN IF EXISTS accession_number;
ALTER TABLE library_books DROP COLUMN IF EXISTS barcode;
ALTER TABLE library_books DROP COLUMN IF EXISTS available_copies;
ALTER TABLE library_books DROP COLUMN IF EXISTS total_copies;
ALTER TABLE library_books DROP COLUMN IF EXISTS status;

-- Drop old status index
DROP INDEX IF EXISTS idx_library_books_status;

-- ── 7. RLS on copies ───────────────────────────────────────
ALTER TABLE library_book_copies ENABLE ROW LEVEL SECURITY;
CREATE POLICY lib_copies_select ON library_book_copies FOR SELECT USING (school_id = public.jwt_school_id());
CREATE POLICY lib_copies_insert ON library_book_copies FOR INSERT WITH CHECK (school_id = public.jwt_school_id());
CREATE POLICY lib_copies_update ON library_book_copies FOR UPDATE USING (school_id = public.jwt_school_id());
CREATE POLICY lib_copies_delete ON library_book_copies FOR DELETE USING (school_id = public.jwt_school_id());

-- ── 8. RPC: create book with copies ──────────────────────────
CREATE OR REPLACE FUNCTION public.library_create_book(
  p_school_id        uuid,
  p_title            text,
  p_author           text DEFAULT NULL,
  p_isbn             text DEFAULT NULL,
  p_publisher        text DEFAULT NULL,
  p_publish_year     int DEFAULT NULL,
  p_cover_url        text DEFAULT NULL,
  p_collection_id    uuid DEFAULT NULL,
  p_notes            text DEFAULT NULL,
  p_total_copies     int DEFAULT 1,
  p_staff_id         uuid DEFAULT NULL,
  p_barcode_prefix   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_book_id    uuid;
  v_next_num   int;
  v_accession  text;
  v_barcode    text;
  v_i          int;
BEGIN
  -- Lock + bump accession counter
  INSERT INTO library_accession_counters (school_id, next_number)
  VALUES (p_school_id, p_total_copies + 1)
  ON CONFLICT (school_id) DO UPDATE
    SET next_number = library_accession_counters.next_number + p_total_copies
  RETURNING library_accession_counters.next_number - p_total_copies INTO v_next_num;

  -- Insert title
  INSERT INTO library_books (
    school_id, title, author, isbn, publisher, publish_year,
    cover_url, collection_id, notes, added_by
  ) VALUES (
    p_school_id, p_title, p_author, p_isbn, p_publisher, p_publish_year,
    p_cover_url, p_collection_id, p_notes, p_staff_id
  ) RETURNING id INTO v_book_id;

  -- Insert copies
  FOR v_i IN 1..p_total_copies LOOP
    v_accession := 'ACC-' || LPAD((v_next_num + v_i - 1)::text, 5, '0');
    v_barcode := CASE
      WHEN p_barcode_prefix IS NOT NULL THEN p_barcode_prefix || '-' || LPAD((v_next_num + v_i - 1)::text, 5, '0')
      ELSE NULL
    END;
    INSERT INTO library_book_copies (school_id, book_id, accession_number, barcode, status)
    VALUES (p_school_id, v_book_id, v_accession, v_barcode, 'available');
  END LOOP;

  RETURN v_book_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_create_book TO authenticated;

-- ── 8. RPC: update book metadata ─────────────────────────────
CREATE OR REPLACE FUNCTION public.library_update_book(
  p_book_id          uuid,
  p_school_id        uuid,
  p_title            text DEFAULT NULL,
  p_author           text DEFAULT NULL,
  p_isbn             text DEFAULT NULL,
  p_publisher        text DEFAULT NULL,
  p_publish_year     int DEFAULT NULL,
  p_cover_url        text DEFAULT NULL,
  p_collection_id    uuid DEFAULT NULL,
  p_notes            text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE library_books SET
    title = COALESCE(p_title, title),
    author = COALESCE(p_author, author),
    isbn = COALESCE(p_isbn, isbn),
    publisher = COALESCE(p_publisher, publisher),
    publish_year = COALESCE(p_publish_year, publish_year),
    cover_url = COALESCE(p_cover_url, cover_url),
    collection_id = COALESCE(p_collection_id, collection_id),
    notes = COALESCE(p_notes, notes),
    updated_at = now()
  WHERE id = p_book_id AND school_id = p_school_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_update_book TO authenticated;

-- ── 9. RPC: delete book (cascades to copies) ─────────────────
CREATE OR REPLACE FUNCTION public.library_delete_book(p_book_id uuid, p_school_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM library_books WHERE id = p_book_id AND school_id = p_school_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_delete_book TO authenticated;

-- ── 10. RPC: checkout a copy ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.library_check_out_copy(
  p_school_id        uuid,
  p_book_id          uuid,
  p_borrower_type    text,
  p_borrower_id      uuid,
  p_due_date         date,
  p_staff_id         uuid,
  p_notes            text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_copy_id     uuid;
  v_max_allowed int;
  v_current_cnt int;
  v_tx_id       uuid;
BEGIN
  -- Pick an available copy
  SELECT id INTO v_copy_id
  FROM library_book_copies
  WHERE book_id = p_book_id AND school_id = p_school_id AND status = 'available'
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_copy_id IS NULL THEN
    RAISE EXCEPTION 'No copies available for checkout';
  END IF;

  -- Max books limit
  SELECT CASE
    WHEN p_borrower_type = 'student' THEN COALESCE(max_books_per_student, 3)
    ELSE COALESCE(max_books_per_staff, 5)
  END INTO v_max_allowed
  FROM library_settings WHERE school_id = p_school_id;

  IF NOT FOUND THEN
    v_max_allowed := CASE WHEN p_borrower_type = 'student' THEN 3 ELSE 5 END;
  END IF;

  SELECT COUNT(*) INTO v_current_cnt
  FROM library_transactions
  WHERE school_id = p_school_id
    AND status IN ('active', 'overdue')
    AND CASE
      WHEN p_borrower_type = 'staff' THEN borrower_staff_id = p_borrower_id
      ELSE borrower_student_id = p_borrower_id
    END;

  IF v_current_cnt >= v_max_allowed THEN
    RAISE EXCEPTION 'Borrower has reached maximum allowed books (%)', v_max_allowed;
  END IF;

  -- Mark copy checked_out
  UPDATE library_book_copies SET status = 'checked_out', updated_at = now() WHERE id = v_copy_id;

  -- Insert transaction
  INSERT INTO library_transactions (
    school_id, book_id, copy_id, borrower_type,
    borrower_staff_id, borrower_student_id,
    due_date, checked_out_by, status, notes
  ) VALUES (
    p_school_id, p_book_id, v_copy_id, p_borrower_type,
    CASE WHEN p_borrower_type = 'staff' THEN p_borrower_id ELSE NULL END,
    CASE WHEN p_borrower_type = 'student' THEN p_borrower_id ELSE NULL END,
    p_due_date, p_staff_id, 'active', p_notes
  ) RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_check_out_copy TO authenticated;

-- ── 11. RPC: checkin a copy ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.library_check_in_copy(
  p_school_id        uuid,
  p_transaction_id   uuid,
  p_staff_id         uuid,
  p_notes            text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_copy_id  uuid;
  v_book_id  uuid;
BEGIN
  SELECT copy_id, book_id INTO v_copy_id, v_book_id
  FROM library_transactions
  WHERE id = p_transaction_id AND school_id = p_school_id
  FOR UPDATE;

  IF v_copy_id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found or has no copy';
  END IF;

  UPDATE library_transactions
     SET checked_in_at = now(),
         checked_in_by = p_staff_id,
         status = 'returned',
         notes = CASE
           WHEN p_notes IS NOT NULL AND notes IS NOT NULL THEN notes || E'\n' || p_notes
           WHEN p_notes IS NOT NULL THEN p_notes
           ELSE notes
         END
   WHERE id = p_transaction_id;

  UPDATE library_book_copies
     SET status = 'available', updated_at = now()
   WHERE id = v_copy_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_check_in_copy TO authenticated;

-- ── 12. Update dashboard stats ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_library_dashboard_stats(p_school_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
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
  UPDATE library_transactions SET status = 'overdue'
  WHERE school_id = p_school_id AND status = 'active' AND due_date < CURRENT_DATE;

  SELECT COUNT(*) INTO v_total                      FROM library_book_copies WHERE school_id = p_school_id;
  SELECT COUNT(*)                INTO v_available FROM library_book_copies WHERE school_id = p_school_id AND status = 'available';
  SELECT COUNT(*)                INTO v_checked_out FROM library_transactions WHERE school_id = p_school_id AND status IN ('active', 'overdue');
  SELECT COUNT(*)                INTO v_overdue     FROM library_transactions WHERE school_id = p_school_id AND status = 'overdue';
  SELECT COUNT(*)                INTO v_lost        FROM library_book_copies WHERE school_id = p_school_id AND status IN ('lost', 'damaged');
  SELECT COUNT(*)                INTO v_collections FROM library_collections WHERE school_id = p_school_id;

  v_result := jsonb_build_object(
    'total_books', v_total, 'available', v_available,
    'checked_out', v_checked_out, 'overdue', v_overdue,
    'lost', v_lost, 'collections', v_collections
  );
  RETURN v_result;
END;
$$;

-- ── 13. Update overdue books RPC ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_overdue_books(p_school_id uuid)
RETURNS TABLE (
  transaction_id   uuid, book_title text, accession_number text,
  borrower_name    text, borrower_type text, due_date date,
  days_overdue     int, checked_out_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    t.id, b.title AS book_title, c.accession_number,
    CASE WHEN t.borrower_type = 'staff' THEN s.full_name
         WHEN t.borrower_type = 'student' THEN st.full_name
         ELSE 'Unknown' END AS borrower_name,
    t.borrower_type, t.due_date,
    (CURRENT_DATE - t.due_date)::int AS days_overdue,
    t.checked_out_at
  FROM library_transactions t
  JOIN library_books b ON b.id = t.book_id
  JOIN library_book_copies c ON c.id = t.copy_id
  LEFT JOIN staff s ON s.id = t.borrower_staff_id
  LEFT JOIN students st ON st.id = t.borrower_student_id
  WHERE t.school_id = p_school_id
    AND t.status IN ('active', 'overdue')
    AND t.due_date < CURRENT_DATE
  ORDER BY t.due_date ASC;
$$;

-- ── 14. RPC: find book by barcode (searches copies) ────────
CREATE OR REPLACE FUNCTION public.library_find_by_barcode(p_school_id uuid, p_barcode text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT book_id FROM library_book_copies
  WHERE school_id = p_school_id AND barcode = p_barcode
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.library_find_by_barcode TO authenticated;

-- ── 15. RPC: get copies for a book ──────────────────────────
CREATE OR REPLACE FUNCTION public.library_get_book_copies(p_book_id uuid)
RETURNS TABLE (id uuid, accession_number text, barcode text, status text, condition_notes text)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id, accession_number, barcode, status, condition_notes
  FROM library_book_copies WHERE book_id = p_book_id ORDER BY accession_number;
$$;

GRANT EXECUTE ON FUNCTION public.library_get_book_copies TO authenticated;

-- ── 16. RPC: mark overdue ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.library_mark_overdue()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE v_count int;
BEGIN
  UPDATE library_transactions SET status = 'overdue'
  WHERE status = 'active' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_mark_overdue TO authenticated;
