-- ============================================================
-- 057_fix_st_missing_columns.sql
-- Adds two columns that the Subject Teacher screens query but
-- that were never added to the DB, causing "Could not load"
-- errors for every ST user.
--
-- 1. school_sections.section_type
--    Used by home.tsx fallback query and get_st_dashboard RPC
--    to determine expected mark count (IGCSE = 1 component,
--    others = 3). Values: 'primary' | 'secondary' | 'igcse' | 'sixth_form'
--    Backfilled from the section code: IGCSE schools typically
--    name/code their IGCSE section with 'igcse' in the code.
--
-- 2. semesters.marks_window_open
--    Boolean admin toggle for whether marks entry is open.
--    Queried by ST marks/marks-entry/marks-import and admin
--    marks-unlock/marks-matrix screens.
--    Backfilled from existing marks_open_date / marks_close_date.
-- ============================================================

-- ── 1. school_sections.section_type ───────────────────────────

ALTER TABLE school_sections
  ADD COLUMN IF NOT EXISTS section_type TEXT NOT NULL DEFAULT 'primary'
    CHECK (section_type IN ('primary','secondary','igcse','sixth_form','other'));

-- Backfill: if the section code contains 'igcse' (case-insensitive)
-- treat it as IGCSE; otherwise leave as 'primary' default.
UPDATE school_sections
   SET section_type = 'igcse'
 WHERE lower(code) LIKE '%igcse%'
    OR lower(name) LIKE '%igcse%';

UPDATE school_sections
   SET section_type = 'secondary'
 WHERE section_type = 'primary'
   AND (lower(code) LIKE '%sec%' OR lower(name) LIKE '%secondary%' OR lower(name) LIKE '%senior%');

UPDATE school_sections
   SET section_type = 'sixth_form'
 WHERE section_type = 'primary'
   AND (lower(code) LIKE '%sixth%' OR lower(name) LIKE '%sixth%' OR lower(name) LIKE '%a level%' OR lower(name) LIKE '%alevel%');

CREATE INDEX IF NOT EXISTS idx_school_sections_type ON school_sections(school_id, section_type);

-- ── 2. semesters.marks_window_open ────────────────────────────

ALTER TABLE semesters
  ADD COLUMN IF NOT EXISTS marks_window_open BOOLEAN NOT NULL DEFAULT true;

-- Backfill: if the semester has explicit open/close dates, use
-- whether now() falls in that window. Otherwise default true.
UPDATE semesters
   SET marks_window_open = (
     marks_open_date IS NOT NULL
     AND marks_close_date IS NOT NULL
     AND now() BETWEEN marks_open_date AND marks_close_date
   )
 WHERE marks_open_date IS NOT NULL
   AND marks_close_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_semesters_window ON semesters(school_id, marks_window_open) WHERE is_active = true;
