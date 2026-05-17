-- ============================================================
-- 061_library_accession_mode.sql
-- Manual accession number support, RLS fix on counters,
-- pg_cron overdue job, find_by_accession RPC.
-- ============================================================

-- ── 1. Add accession_mode to library_settings ────────────────
ALTER TABLE library_settings
  ADD COLUMN IF NOT EXISTS accession_mode text NOT NULL DEFAULT 'auto'
    CHECK (accession_mode IN ('auto', 'manual'));

-- ── 2. RLS on library_accession_counters ─────────────────────
ALTER TABLE library_accession_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lib_acc_ctr_select ON library_accession_counters;
DROP POLICY IF EXISTS lib_acc_ctr_insert ON library_accession_counters;
DROP POLICY IF EXISTS lib_acc_ctr_update ON library_accession_counters;

CREATE POLICY lib_acc_ctr_select ON library_accession_counters
  FOR SELECT USING (school_id = public.jwt_school_id());
CREATE POLICY lib_acc_ctr_insert ON library_accession_counters
  FOR INSERT WITH CHECK (school_id = public.jwt_school_id());
CREATE POLICY lib_acc_ctr_update ON library_accession_counters
  FOR UPDATE USING (school_id = public.jwt_school_id());

-- ── 3. RPC: find book by accession number ────────────────────
CREATE OR REPLACE FUNCTION public.library_find_by_accession(
  p_school_id       uuid,
  p_accession_number text
)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT book_id FROM library_book_copies
  WHERE school_id = p_school_id
    AND accession_number = p_accession_number
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.library_find_by_accession TO authenticated;

-- ── 4. Update library_create_book: support manual accessions ─
--    Replaces the version from migrations 055 + 060.
--    New param: p_accession_numbers text[] DEFAULT NULL
--    When provided: use those values (manual mode), skip counter.
--    When NULL: auto-generate from counter (auto mode).

-- Drop ALL existing overloads of library_create_book first.
-- Signature changed (added p_accession_numbers) → CREATE OR REPLACE alone
-- would create a second overload and break callers with ambiguity errors.
DO $drop$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'library_create_book'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig::text || ' CASCADE';
  END LOOP;
END
$drop$;

CREATE OR REPLACE FUNCTION public.library_create_book(
  p_school_id          uuid,
  p_title              text,
  p_author             text        DEFAULT NULL,
  p_isbn               text        DEFAULT NULL,
  p_publisher          text        DEFAULT NULL,
  p_publish_year       int         DEFAULT NULL,
  p_cover_url          text        DEFAULT NULL,
  p_collection_id      uuid        DEFAULT NULL,
  p_genre_id           uuid        DEFAULT NULL,
  p_notes              text        DEFAULT NULL,
  p_total_copies       int         DEFAULT 1,
  p_staff_id           uuid        DEFAULT NULL,
  p_barcode_prefix     text        DEFAULT NULL,
  p_accession_numbers  text[]      DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_book_id    uuid;
  v_next_num   int;
  v_count      int;
  v_accession  text;
  v_barcode    text;
  v_i          int;
BEGIN
  -- Insert book record
  INSERT INTO library_books (
    school_id, title, author, isbn, publisher, publish_year,
    cover_url, collection_id, genre_id, notes, added_by
  ) VALUES (
    p_school_id, p_title, p_author, p_isbn, p_publisher, p_publish_year,
    p_cover_url, p_collection_id, p_genre_id, p_notes, p_staff_id
  ) RETURNING id INTO v_book_id;

  IF p_accession_numbers IS NOT NULL THEN
    -- Manual mode: use provided accession numbers
    v_count := array_length(p_accession_numbers, 1);
    FOR v_i IN 1..COALESCE(v_count, 0) LOOP
      v_accession := p_accession_numbers[v_i];
      -- Store accession_number in barcode too so barcode scan works
      INSERT INTO library_book_copies (school_id, book_id, accession_number, barcode, status)
      VALUES (p_school_id, v_book_id, v_accession, v_accession, 'available');
    END LOOP;
  ELSE
    -- Auto mode: generate sequential ACC-NNNNN numbers
    INSERT INTO library_accession_counters (school_id, next_number)
    VALUES (p_school_id, p_total_copies + 1)
    ON CONFLICT (school_id) DO UPDATE
      SET next_number = library_accession_counters.next_number + p_total_copies
    RETURNING library_accession_counters.next_number - p_total_copies INTO v_next_num;

    FOR v_i IN 1..COALESCE(p_total_copies, 1) LOOP
      v_accession := 'ACC-' || LPAD((v_next_num + v_i - 1)::text, 5, '0');
      v_barcode := CASE
        WHEN p_barcode_prefix IS NOT NULL
          THEN p_barcode_prefix || '-' || LPAD((v_next_num + v_i - 1)::text, 5, '0')
        ELSE v_accession
      END;
      INSERT INTO library_book_copies (school_id, book_id, accession_number, barcode, status)
      VALUES (p_school_id, v_book_id, v_accession, v_barcode, 'available');
    END LOOP;
  END IF;

  RETURN v_book_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_create_book TO authenticated;

-- ── 5. pg_cron: auto-mark overdue transactions daily ─────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if present, then recreate
    PERFORM cron.unschedule('library-mark-overdue');
    PERFORM cron.schedule(
      'library-mark-overdue',
      '0 1 * * *',
      'SELECT public.library_mark_overdue()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- pg_cron unavailable; overdue marking still triggered on dashboard load
END;
$$;
