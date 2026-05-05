-- ============================================================
-- 056_library_update_fix.sql
-- Fix library_update_book: direct SET instead of COALESCE so
-- collection_id and other nullable fields can be explicitly cleared.
-- cover_url still uses COALESCE (no UI to edit it).
-- ============================================================

CREATE OR REPLACE FUNCTION public.library_update_book(
  p_book_id          uuid,
  p_school_id        uuid,
  p_title            text DEFAULT NULL,
  p_author           text DEFAULT NULL,
  p_isbn             text DEFAULT NULL,
  p_publisher        text DEFAULT NULL,
  p_publish_year     int  DEFAULT NULL,
  p_cover_url        text DEFAULT NULL,
  p_collection_id    uuid DEFAULT NULL,
  p_notes            text DEFAULT NULL
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
    notes          = p_notes,
    updated_at     = now()
  WHERE id = p_book_id AND school_id = p_school_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.library_update_book TO authenticated;
