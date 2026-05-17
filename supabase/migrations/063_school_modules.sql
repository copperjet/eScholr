-- ============================================================
-- 063_school_modules.sql — Per-school module gating
-- Adds module.* keys to school_configs using tier defaults.
-- No new tables — inherits existing school_config_isolation RLS.
-- ============================================================

-- ── Update seed trigger to include module flags ───────────────
CREATE OR REPLACE FUNCTION seed_school_configs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO school_configs (school_id, config_key, config_value) VALUES
    -- ── Existing sub-feature configs (unchanged) ──────────────
    (NEW.id, 'report_comment_max_chars',     '600'),
    (NEW.id, 'attendance_threshold_pct',     '85'),
    (NEW.id, 'school_phone',                 ''),
    (NEW.id, 'school_email',                 ''),
    (NEW.id, 'class_position_enabled',       'true'),
    (NEW.id, 'student_photo_on_report',      'true'),
    (NEW.id, 'eyd_creed_scale',              'cambridge'),
    (NEW.id, 'finance_gate_enabled',         'true'),
    (NEW.id, 'day_book_enabled',             'true'),
    (NEW.id, 'biweekly_enabled',             'true'),
    (NEW.id, 'character_framework_enabled',  'true'),
    (NEW.id, 'front_desk_enabled',           'true'),
    (NEW.id, 'hod_roles_enabled',            'true'),
    (NEW.id, 'coordinator_roles_enabled',    'true'),
    (NEW.id, 'parent_finance_visible',       'true'),
    (NEW.id, 'bulk_import_enabled',          'true'),
    (NEW.id, 'demo_mode',                    'false'),

    -- ── Module flags: all tiers ───────────────────────────────
    (NEW.id, 'module.finance',       'true'),
    (NEW.id, 'module.exams',         'true'),
    (NEW.id, 'module.daybook',       'true'),
    (NEW.id, 'module.announcements', 'true'),

    -- ── Module flags: growth and above ───────────────────────
    (NEW.id, 'module.hr',
      CASE WHEN NEW.subscription_plan IN ('growth','scale','enterprise') THEN 'true' ELSE 'false' END),
    (NEW.id, 'module.frontdesk',
      CASE WHEN NEW.subscription_plan IN ('growth','scale','enterprise') THEN 'true' ELSE 'false' END),
    (NEW.id, 'module.library',
      CASE WHEN NEW.subscription_plan IN ('growth','scale','enterprise') THEN 'true' ELSE 'false' END),
    (NEW.id, 'module.character',
      CASE WHEN NEW.subscription_plan IN ('growth','scale','enterprise') THEN 'true' ELSE 'false' END),

    -- ── Module flags: scale and above ────────────────────────
    (NEW.id, 'module.transport',
      CASE WHEN NEW.subscription_plan IN ('scale','enterprise') THEN 'true' ELSE 'false' END),
    (NEW.id, 'module.hostel',
      CASE WHEN NEW.subscription_plan IN ('scale','enterprise') THEN 'true' ELSE 'false' END)

  ON CONFLICT (school_id, config_key) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── Backfill existing schools with module flags ───────────────
-- Existing schools not on the seed trigger path get growth defaults.
-- ON CONFLICT DO NOTHING protects any manually set values.

INSERT INTO school_configs (school_id, config_key, config_value)
SELECT s.id, m.config_key, m.config_value
FROM schools s
CROSS JOIN (
  VALUES
    ('module.finance',       'true'),
    ('module.exams',         'true'),
    ('module.daybook',       'true'),
    ('module.announcements', 'true'),
    ('module.hr',            'true'),
    ('module.frontdesk',     'true'),
    ('module.library',       'true'),
    ('module.character',     'true'),
    ('module.transport',     'false'),
    ('module.hostel',        'false')
) AS m(config_key, config_value)
ON CONFLICT (school_id, config_key) DO NOTHING;
