-- ============================================================
-- 057_checkout_copy_selection.sql
-- Allow checkout to target a specific copy by ID.
-- If p_copy_id is provided, that copy is checked out.
-- If NULL, first available copy is auto-picked (unchanged behaviour).
-- ============================================================

CREATE OR REPLACE FUNCTION public.library_check_out_copy(
  p_school_id        uuid,
  p_book_id          uuid,
  p_borrower_type    text,
  p_borrower_id      uuid,
  p_due_date         date,
  p_staff_id         uuid,
  p_notes            text DEFAULT NULL,
  p_copy_id          uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_copy_id     uuid;
  v_max_allowed int;
  v_current_cnt int;
  v_tx_id       uuid;
  v_status      text;
BEGIN
  IF p_copy_id IS NOT NULL THEN
    -- Caller specified a copy — verify it belongs to the book and is available
    SELECT id, status INTO v_copy_id, v_status
    FROM library_book_copies
    WHERE id = p_copy_id AND book_id = p_book_id AND school_id = p_school_id
    FOR UPDATE SKIP LOCKED;

    IF v_copy_id IS NULL THEN
      RAISE EXCEPTION 'Specified copy not found or is being processed';
    END IF;
    IF v_status <> 'available' THEN
      RAISE EXCEPTION 'Specified copy is not available (status: %)', v_status;
    END IF;
  ELSE
    -- Auto-pick first available copy, ordered by accession_number for determinism
    SELECT id INTO v_copy_id
    FROM library_book_copies
    WHERE book_id = p_book_id AND school_id = p_school_id AND status = 'available'
    ORDER BY accession_number
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_copy_id IS NULL THEN
      RAISE EXCEPTION 'No copies available for checkout';
    END IF;
  END IF;

  -- Max books limit check
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
