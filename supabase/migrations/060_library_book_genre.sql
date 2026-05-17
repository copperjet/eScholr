-- Add genre_id to library_books (separate from collection_id)
ALTER TABLE library_books
  ADD COLUMN IF NOT EXISTS genre_id uuid REFERENCES library_collections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_library_books_genre
  ON library_books (school_id, genre_id);

-- Update library_create_book RPC to accept p_genre_id
CREATE OR REPLACE FUNCTION library_create_book(
  p_school_id     uuid,
  p_title         text,
  p_author        text        DEFAULT NULL,
  p_isbn          text        DEFAULT NULL,
  p_publisher     text        DEFAULT NULL,
  p_publish_year  int         DEFAULT NULL,
  p_cover_url     text        DEFAULT NULL,
  p_collection_id uuid        DEFAULT NULL,
  p_genre_id      uuid        DEFAULT NULL,
  p_notes         text        DEFAULT NULL,
  p_total_copies  int         DEFAULT 1,
  p_staff_id      uuid        DEFAULT NULL,
  p_barcode_prefix text       DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_book_id uuid;
  v_prefix  text;
  v_next    int;
  v_accession text;
  i         int;
BEGIN
  INSERT INTO library_books (
    school_id, title, author, isbn, publisher, publish_year,
    cover_url, collection_id, genre_id, notes, added_by
  ) VALUES (
    p_school_id, p_title, p_author, p_isbn, p_publisher, p_publish_year,
    p_cover_url, p_collection_id, p_genre_id, p_notes, p_staff_id
  )
  RETURNING id INTO v_book_id;

  v_prefix := COALESCE(p_barcode_prefix, 'ACC');

  FOR i IN 1..COALESCE(p_total_copies, 1) LOOP
    INSERT INTO library_accession_counters (school_id, next_number)
      VALUES (p_school_id, 1)
      ON CONFLICT (school_id) DO UPDATE SET next_number = library_accession_counters.next_number + 1
      RETURNING next_number INTO v_next;

    -- Re-read after update
    SELECT next_number - 1 INTO v_next
      FROM library_accession_counters
      WHERE school_id = p_school_id;

    v_accession := v_prefix || '-' || LPAD(v_next::text, 5, '0');

    INSERT INTO library_book_copies (school_id, book_id, accession_number, barcode, status)
      VALUES (p_school_id, v_book_id, v_accession, v_accession, 'available');
  END LOOP;

  RETURN v_book_id;
END;
$$;

-- Update library_update_book RPC to accept p_genre_id
CREATE OR REPLACE FUNCTION library_update_book(
  p_book_id       uuid,
  p_school_id     uuid,
  p_title         text        DEFAULT NULL,
  p_author        text        DEFAULT NULL,
  p_isbn          text        DEFAULT NULL,
  p_publisher     text        DEFAULT NULL,
  p_publish_year  int         DEFAULT NULL,
  p_cover_url     text        DEFAULT NULL,
  p_collection_id uuid        DEFAULT NULL,
  p_genre_id      uuid        DEFAULT NULL,
  p_notes         text        DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE library_books SET
    title         = COALESCE(p_title, title),
    author        = p_author,
    isbn          = p_isbn,
    publisher     = p_publisher,
    publish_year  = p_publish_year,
    cover_url     = p_cover_url,
    collection_id = p_collection_id,
    genre_id      = p_genre_id,
    notes         = p_notes,
    updated_at    = NOW()
  WHERE id = p_book_id AND school_id = p_school_id;
END;
$$;
