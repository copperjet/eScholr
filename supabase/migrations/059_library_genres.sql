-- Add collection_type to distinguish collections from genres
-- collection: shelf/series/custom grouping chosen by librarian
-- genre:      subject-matter grouping (Mystery, Science Fiction, etc.)

ALTER TABLE library_collections
  ADD COLUMN IF NOT EXISTS collection_type text NOT NULL DEFAULT 'collection'
    CHECK (collection_type IN ('collection', 'genre'));

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_library_collections_type
  ON library_collections (school_id, collection_type);
