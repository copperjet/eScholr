-- ============================================================
-- 037_denormalised_student_names.sql
-- Performance: kill the streams→grades→school_sections nested
-- join repeated in 40+ Postgrest queries.
--
-- Adds three text columns to `students` (`grade_name`,
-- `section_name`, `stream_name`) kept in sync via triggers.
--
-- Net effect: every student list query drops one heavy join
-- and serialises ~30 % less JSON.
-- ============================================================

-- 1. Add columns (nullable, backfilled below)
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS grade_name   TEXT,
  ADD COLUMN IF NOT EXISTS section_name TEXT,
  ADD COLUMN IF NOT EXISTS stream_name  TEXT;

-- 2. Backfill existing rows
UPDATE students s
   SET stream_name  = st.name,
       grade_name   = g.name,
       section_name = sec.name
  FROM streams st
  JOIN grades  g   ON g.id   = st.grade_id
  JOIN school_sections sec ON sec.id = g.section_id
 WHERE s.stream_id = st.id;

-- 3. Trigger: sync names when student's stream_id changes (or on insert)
CREATE OR REPLACE FUNCTION sync_student_names()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT st.name, g.name, sec.name
    INTO NEW.stream_name, NEW.grade_name, NEW.section_name
    FROM streams st
    JOIN grades g ON g.id = st.grade_id
    JOIN school_sections sec ON sec.id = g.section_id
   WHERE st.id = NEW.stream_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_names ON students;
CREATE TRIGGER trg_sync_student_names
  BEFORE INSERT OR UPDATE OF stream_id ON students
  FOR EACH ROW EXECUTE FUNCTION sync_student_names();

-- 4. Trigger: when a stream is renamed, propagate to all its students
CREATE OR REPLACE FUNCTION propagate_stream_rename()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE students SET stream_name = NEW.name WHERE stream_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_stream_rename ON streams;
CREATE TRIGGER trg_propagate_stream_rename
  AFTER UPDATE OF name ON streams
  FOR EACH ROW EXECUTE FUNCTION propagate_stream_rename();

-- 5. Trigger: when a grade is renamed, propagate to all its students
CREATE OR REPLACE FUNCTION propagate_grade_rename()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE students s
       SET grade_name = NEW.name
      FROM streams st
     WHERE s.stream_id = st.id AND st.grade_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_grade_rename ON grades;
CREATE TRIGGER trg_propagate_grade_rename
  AFTER UPDATE OF name ON grades
  FOR EACH ROW EXECUTE FUNCTION propagate_grade_rename();

-- 6. Trigger: when a school_section is renamed, propagate to its students
CREATE OR REPLACE FUNCTION propagate_section_rename()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE students s
       SET section_name = NEW.name
      FROM streams st
      JOIN grades g ON g.id = st.grade_id
     WHERE s.stream_id = st.id AND g.section_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_section_rename ON school_sections;
CREATE TRIGGER trg_propagate_section_rename
  AFTER UPDATE OF name ON school_sections
  FOR EACH ROW EXECUTE FUNCTION propagate_section_rename();
