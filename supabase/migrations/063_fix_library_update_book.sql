-- ============================================================
-- 063_fix_library_update_book.sql
-- Drop ALL overloads of library_update_book (migration 056 created
-- a version without p_genre_id; migration 060 used CREATE OR REPLACE
-- with a different signature, creating a second overload instead of
-- replacing the first — PostgREST sees ambiguity and errors).
-- Recreate as single canonical version with p_genre_id.
-- ============================================================

DO $drop$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'library_update_book'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig::text;
  END LOOP;
END
$drop$;

CREATE FUNCTION public.library_update_book(
  p_book_id       uuid,
  p_school_id     uuid,
  p_title         text  DEFAULT NULL,
  p_author        text  DEFAULT NULL,
  p_isbn          text  DEFAULT NULL,
  p_publisher     text  DEFAULT NULL,
  p_publish_year  int   DEFAULT NULL,
  p_cover_url     text  DEFAULT NULL,
  p_collection_id uuid  DEFAULT NULL,
  p_genre_id      uuid  DEFAULT NULL,
  p_notes         text  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE library_books SET
    title          = COALESCE(p_title, title),
    author         = p_author,
    isbn           = p_isbn,
    publisher      = p_publisher,
    publish_year   = p_publish_year,
    cover_url      = COALESCE(p_cover_url, cover_url),
    collection_id  = p_collection_id,
    genre_id       = p_genre_id,
    notes          = p_notes,
    updated_at     = now()
  WHERE id = p_book_id AND school_id = p_school_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_update_book(uuid, uuid, text, text, text, text, int, text, uuid, uuid, text) TO authenticated;
