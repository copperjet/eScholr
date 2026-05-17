-- Migration 084: Deduplicate library_check_out_copy function
-- Migrations 054/055 created a 7-param version; 057 added an 8-param version
-- with p_copy_id. CREATE OR REPLACE with different param lists creates a NEW
-- function instead of replacing the old one, leaving two overloads. PostgREST
-- then errors: "function name is not unique".
--
-- This migration drops both old signatures explicitly, then re-creates the
-- canonical 8-param version from migration 057.

DROP FUNCTION IF EXISTS public.library_check_out_copy(uuid, uuid, text, uuid, date, uuid, text);
DROP FUNCTION IF EXISTS public.library_check_out_copy(uuid, uuid, text, uuid, date, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.library_check_out_copy(
  p_school_id     uuid,
  p_book_id       uuid,
  p_borrower_type text,
  p_borrower_id   uuid,
  p_due_date      date,
  p_staff_id      uuid,
  p_notes         text DEFAULT NULL,
  p_copy_id       uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_copy_id        uuid;
  v_transaction_id uuid;
  v_max_allowed    int;
  v_current_count  int;
BEGIN
  IF p_copy_id IS NOT NULL THEN
    SELECT id INTO v_copy_id
    FROM library_book_copies
    WHERE id = p_copy_id AND book_id = p_book_id AND school_id = p_school_id
      AND status = 'available'
    FOR UPDATE;

    IF v_copy_id IS NULL THEN
      RAISE EXCEPTION 'Selected copy is not available for checkout.';
    END IF;
  ELSE
    SELECT id INTO v_copy_id
    FROM library_book_copies
    WHERE book_id = p_book_id AND school_id = p_school_id AND status = 'available'
    ORDER BY accession_number
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_copy_id IS NULL THEN
      RAISE EXCEPTION 'No copies available for checkout.';
    END IF;
  END IF;

  SELECT CASE
    WHEN p_borrower_type = 'student' THEN COALESCE(max_books_per_student, 3)
    ELSE COALESCE(max_books_per_staff, 5)
  END
  INTO v_max_allowed
  FROM library_settings WHERE school_id = p_school_id;

  IF v_max_allowed IS NULL THEN
    v_max_allowed := CASE WHEN p_borrower_type = 'student' THEN 3 ELSE 5 END;
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM library_transactions
  WHERE school_id = p_school_id
    AND status IN ('active', 'overdue')
    AND CASE
      WHEN p_borrower_type = 'staff' THEN borrower_staff_id = p_borrower_id
      ELSE borrower_student_id = p_borrower_id
    END;

  IF v_current_count >= v_max_allowed THEN
    RAISE EXCEPTION 'Borrower has reached the maximum number of books (%).', v_max_allowed;
  END IF;

  UPDATE library_book_copies SET status = 'checked_out', updated_at = now()
  WHERE id = v_copy_id;

  INSERT INTO library_transactions (
    school_id, book_id, copy_id, borrower_type,
    borrower_staff_id, borrower_student_id,
    due_date, checked_out_by, status, notes
  ) VALUES (
    p_school_id, p_book_id, v_copy_id, p_borrower_type,
    CASE WHEN p_borrower_type = 'staff' THEN p_borrower_id ELSE NULL END,
    CASE WHEN p_borrower_type = 'student' THEN p_borrower_id ELSE NULL END,
    p_due_date, p_staff_id, 'active', p_notes
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_check_out_copy TO authenticated;
