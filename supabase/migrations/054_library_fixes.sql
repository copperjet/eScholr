-- ============================================================
-- 054_library_fixes.sql
-- Atomic checkout/checkin RPCs, overdue auto-marking,
-- max-books enforcement, barcode index fix.
-- ============================================================

-- ── 1. Fix barcode unique index: filter out NULLs ──────────
ALTER TABLE library_books DROP CONSTRAINT IF EXISTS library_books_school_id_barcode_key;
DROP INDEX IF EXISTS library_books_school_id_barcode_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_books_barcode_unique
  ON library_books(school_id, barcode) WHERE barcode IS NOT NULL;

-- ── 2. Atomic checkout RPC ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.library_check_out(
  p_school_id         uuid,
  p_book_id           uuid,
  p_borrower_type     text,
  p_borrower_id       uuid,
  p_due_date          date,
  p_staff_id          uuid,
  p_notes             text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_available    int;
  v_total        int;
  v_max_allowed  int;
  v_current_cnt  int;
  v_tx_id        uuid;
BEGIN
  -- Lock the book row
  SELECT available_copies, total_copies
    INTO v_available, v_total
    FROM library_books
   WHERE id = p_book_id AND school_id = p_school_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Book not found';
  END IF;
  IF v_available < 1 THEN
    RAISE EXCEPTION 'No copies available for checkout';
  END IF;

  -- Check max books limit
  SELECT CASE
    WHEN p_borrower_type = 'student' THEN COALESCE(max_books_per_student, 3)
    ELSE COALESCE(max_books_per_staff, 5)
  END INTO v_max_allowed
  FROM library_settings
  WHERE school_id = p_school_id;

  -- Default if no settings row
  IF NOT FOUND THEN
    v_max_allowed := CASE WHEN p_borrower_type = 'student' THEN 3 ELSE 5 END;
  END IF;

  SELECT COUNT(*) INTO v_current_cnt
  FROM library_transactions
  WHERE school_id = p_school_id
    AND status = 'active'
    AND CASE
      WHEN p_borrower_type = 'staff' THEN borrower_staff_id = p_borrower_id
      ELSE borrower_student_id = p_borrower_id
    END;

  IF v_current_cnt >= v_max_allowed THEN
    RAISE EXCEPTION 'Borrower has reached maximum allowed books (%)', v_max_allowed;
  END IF;

  -- Insert transaction
  INSERT INTO library_transactions (
    school_id, book_id, borrower_type,
    borrower_staff_id, borrower_student_id,
    due_date, checked_out_by, status, notes
  ) VALUES (
    p_school_id, p_book_id, p_borrower_type,
    CASE WHEN p_borrower_type = 'staff' THEN p_borrower_id ELSE NULL END,
    CASE WHEN p_borrower_type = 'student' THEN p_borrower_id ELSE NULL END,
    p_due_date, p_staff_id, 'active', p_notes
  )
  RETURNING id INTO v_tx_id;

  -- Decrement available copies atomically
  UPDATE library_books
     SET available_copies = available_copies - 1,
         status = CASE WHEN available_copies - 1 = 0 THEN 'checked_out' ELSE status END,
         updated_at = now()
   WHERE id = p_book_id AND school_id = p_school_id;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_check_out TO authenticated;

-- ── 3. Atomic checkin RPC ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.library_check_in(
  p_school_id       uuid,
  p_transaction_id  uuid,
  p_book_id         uuid,
  p_staff_id        uuid,
  p_notes           text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_status       text;
  v_total        int;
  v_available    int;
BEGIN
  -- Lock + verify transaction
  SELECT status INTO v_status
    FROM library_transactions
   WHERE id = p_transaction_id AND school_id = p_school_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  IF v_status NOT IN ('active', 'overdue') THEN
    RAISE EXCEPTION 'Transaction already returned or lost';
  END IF;

  -- Update transaction
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

  -- Lock book and increment
  SELECT total_copies, available_copies
    INTO v_total, v_available
    FROM library_books
   WHERE id = p_book_id AND school_id = p_school_id
     FOR UPDATE;

  UPDATE library_books
     SET available_copies = LEAST(v_available + 1, v_total),
         status = 'available',
         updated_at = now()
   WHERE id = p_book_id AND school_id = p_school_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_check_in TO authenticated;

-- ── 4. Auto-mark overdue transactions ──────────────────────
-- This function can be called via pg_cron or a Supabase edge
-- function scheduled daily. Also used by the dashboard RPC.
CREATE OR REPLACE FUNCTION public.library_mark_overdue()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE library_transactions
     SET status = 'overdue'
   WHERE status = 'active'
     AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_mark_overdue TO authenticated;

-- Also run overdue marking inside dashboard stats so it's always fresh
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
  -- Mark overdue first (idempotent)
  UPDATE library_transactions
     SET status = 'overdue'
   WHERE school_id = p_school_id
     AND status = 'active'
     AND due_date < CURRENT_DATE;

  SELECT COUNT(*)                          INTO v_total       FROM library_books WHERE school_id = p_school_id;
  SELECT COALESCE(SUM(available_copies),0) INTO v_available   FROM library_books WHERE school_id = p_school_id;
  SELECT COUNT(*)                          INTO v_checked_out FROM library_transactions WHERE school_id = p_school_id AND status IN ('active', 'overdue');
  SELECT COUNT(*)                          INTO v_overdue     FROM library_transactions WHERE school_id = p_school_id AND status = 'overdue';
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

-- Also update overdue RPC to include 'overdue' status
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
    AND t.status IN ('active', 'overdue')
    AND t.due_date < CURRENT_DATE
  ORDER BY t.due_date ASC;
$$;
