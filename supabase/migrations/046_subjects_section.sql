-- Add section_id to subjects so subjects can be scoped to a section (e.g. Primary, Secondary).
-- When a subject belongs to a section, it is accessible in all grades/streams within that section.
-- Existing subjects get section_id = NULL and will appear in an "Unassigned" group in the UI.

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES school_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS subjects_section_id_idx ON subjects(section_id);

-- RLS: existing policies use school_id, which is still present. No policy changes needed.
