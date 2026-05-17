-- ============================================================
-- 018_demo_seed.sql — Demo school for board presentation
-- ============================================================
-- Demo passwords: Demo@2026!
-- Demo school code: CIS_DEMO

DO $$
DECLARE
  v_school_id   UUID := gen_random_uuid();
  v_year_id     UUID := gen_random_uuid();
  v_sem1_id     UUID := gen_random_uuid();
  v_sem2_id     UUID := gen_random_uuid();
  -- Section IDs
  v_eyd_id      UUID := gen_random_uuid();
  v_cp_id       UUID := gen_random_uuid();
  v_ls_id       UUID := gen_random_uuid();
  v_igcse_id    UUID := gen_random_uuid();
  v_asal_id     UUID := gen_random_uuid();
  -- Grade IDs (subset)
  v_cp2_id      UUID := gen_random_uuid();
  v_ls1_id      UUID := gen_random_uuid();
  v_ig1_id      UUID := gen_random_uuid();
  -- Stream IDs
  v_cp2a_id     UUID := gen_random_uuid();
  v_ls1a_id     UUID := gen_random_uuid();
  v_ig1b_id     UUID := gen_random_uuid();
  -- Subject IDs
  v_eng_id      UUID := gen_random_uuid();
  v_math_id     UUID := gen_random_uuid();
  v_sci_id      UUID := gen_random_uuid();
  v_ss_id       UUID := gen_random_uuid();
  v_ict_id      UUID := gen_random_uuid();
  v_french_id   UUID := gen_random_uuid();
  v_art_id      UUID := gen_random_uuid();
  v_mdd_id      UUID := gen_random_uuid();
  v_pe_id       UUID := gen_random_uuid();
  v_biz_id      UUID := gen_random_uuid();
  -- Staff IDs
  v_admin_id    UUID := gen_random_uuid();
  v_hrt_id      UUID := gen_random_uuid();
  v_st_id       UUID := gen_random_uuid();
  v_finance_id  UUID := gen_random_uuid();
  -- Parent IDs
  v_parent1_id  UUID := gen_random_uuid();
  v_parent2_id  UUID := gen_random_uuid();
  -- Student IDs
  v_s1  UUID := gen_random_uuid(); v_s2  UUID := gen_random_uuid();
  v_s3  UUID := gen_random_uuid(); v_s4  UUID := gen_random_uuid();
  v_s5  UUID := gen_random_uuid(); v_s6  UUID := gen_random_uuid();
  v_s7  UUID := gen_random_uuid(); v_s8  UUID := gen_random_uuid();
  v_s9  UUID := gen_random_uuid(); v_s10 UUID := gen_random_uuid();
BEGIN

-- ── School ────────────────────────────────────────────────────
INSERT INTO schools (id, name, code, primary_color, secondary_color,
  country, timezone, currency, subscription_plan, subscription_status)
VALUES (v_school_id, 'Cambridge International School', 'CIS_DEMO',
  '#1B2A4A', '#E8A020', 'Zambia', 'Africa/Lusaka', 'ZMW', 'growth', 'active');

-- ── Sections ──────────────────────────────────────────────────
INSERT INTO school_sections (id, school_id, name, code, order_index) VALUES
  (v_eyd_id,   v_school_id, 'Early Years Department', 'EYD', 0),
  (v_cp_id,    v_school_id, 'Cambridge Primary',      'CP',  1),
  (v_ls_id,    v_school_id, 'Lower Secondary',        'LS',  2),
  (v_igcse_id, v_school_id, 'IGCSE',                  'IGCSE',3),
  (v_asal_id,  v_school_id, 'AS / A Level',           'ASAL',4);

-- ── Grades ────────────────────────────────────────────────────
INSERT INTO grades (id, school_id, section_id, name, order_index) VALUES
  (v_cp2_id,  v_school_id, v_cp_id,    'CP2',     1),
  (v_ls1_id,  v_school_id, v_ls_id,    'LS1',     0),
  (v_ig1_id,  v_school_id, v_igcse_id, 'IGCSE 1', 0);

-- ── Streams ───────────────────────────────────────────────────
INSERT INTO streams (id, school_id, grade_id, name, order_index) VALUES
  (v_cp2a_id, v_school_id, v_cp2_id, 'CP2A', 0),
  (v_ls1a_id, v_school_id, v_ls1_id, 'LS1A', 0),
  (v_ig1b_id, v_school_id, v_ig1_id, 'IGCSE1B', 1);

-- ── Subjects ──────────────────────────────────────────────────
INSERT INTO subjects (id, school_id, name, department) VALUES
  (v_eng_id,    v_school_id, 'English',             'English'),
  (v_math_id,   v_school_id, 'Mathematics',         'Mathematics'),
  (v_sci_id,    v_school_id, 'Science',             'Science'),
  (v_ss_id,     v_school_id, 'Social Studies',      'Social Sciences'),
  (v_ict_id,    v_school_id, 'New Computing',       'ICT'),
  (v_french_id, v_school_id, 'French',              'French'),
  (v_art_id,    v_school_id, 'Art',                 'Expressive Arts'),
  (v_mdd_id,    v_school_id, 'MDD',                 'Expressive Arts'),
  (v_pe_id,     v_school_id, 'PE',                  'Physical Education'),
  (v_biz_id,    v_school_id, 'Business Studies',    'Social Sciences');

-- ── Assessment Templates ──────────────────────────────────────
INSERT INTO assessment_templates (school_id, section_id, name, weight_percent, is_on_report, order_index) VALUES
  (v_school_id, v_cp_id,    'FA1',       20,   true,  0),
  (v_school_id, v_cp_id,    'FA2',       20,   true,  1),
  (v_school_id, v_cp_id,    'Summative', 60,   true,  2),
  (v_school_id, v_cp_id,    'Biweekly',  NULL, false, 3),
  (v_school_id, v_ls_id,    'FA1',       20,   true,  0),
  (v_school_id, v_ls_id,    'FA2',       20,   true,  1),
  (v_school_id, v_ls_id,    'Summative', 60,   true,  2),
  (v_school_id, v_igcse_id, 'Summative', 100,  true,  0),
  (v_school_id, v_asal_id,  'Summative', 100,  true,  0);

-- ── Academic Year + Semesters ─────────────────────────────────
INSERT INTO academic_years (id, school_id, name, start_date, end_date, is_active)
VALUES (v_year_id, v_school_id, '2025/2026', '2025-08-01', '2026-06-30', true);

INSERT INTO semesters (id, school_id, academic_year_id, name, start_date, end_date,
  marks_open_date, marks_close_date, is_active, order_index) VALUES
  (v_sem1_id, v_school_id, v_year_id, 'Semester 1', '2025-08-01', '2025-12-20',
   '2025-11-01', '2025-12-10', false, 1),
  (v_sem2_id, v_school_id, v_year_id, 'Semester 2', '2026-01-06', '2026-06-30',
   '2026-05-01', '2026-06-15', true, 2);

-- ── Staff (no auth_user_id — demo doesn't use real auth) ──────
INSERT INTO staff (id, school_id, full_name, staff_number, email, department, status) VALUES
  (v_admin_id,   v_school_id, 'Sarah Mwale',    'STF001', 'admin@cis-demo.edu',   NULL,        'active'),
  (v_hrt_id,     v_school_id, 'Joyce Kamau',    'STF002', 'jkamau@cis-demo.edu',  NULL,        'active'),
  (v_st_id,      v_school_id, 'David Phiri',    'STF003', 'dphiri@cis-demo.edu',  'English',   'active'),
  (v_finance_id, v_school_id, 'Grace Tembo',    'STF004', 'gtembo@cis-demo.edu',  NULL,        'active');

INSERT INTO staff_roles (school_id, staff_id, role) VALUES
  (v_school_id, v_admin_id,   'admin'),
  (v_school_id, v_admin_id,   'super_admin'),
  (v_school_id, v_hrt_id,     'hrt'),
  (v_school_id, v_st_id,      'st'),
  (v_school_id, v_finance_id, 'finance');

-- HRT assignment
INSERT INTO hrt_assignments (school_id, staff_id, stream_id, semester_id)
VALUES (v_school_id, v_hrt_id, v_cp2a_id, v_sem2_id);

-- ST assignments
INSERT INTO subject_teacher_assignments (school_id, staff_id, subject_id, stream_id, semester_id) VALUES
  (v_school_id, v_st_id, v_eng_id,  v_cp2a_id, v_sem2_id),
  (v_school_id, v_st_id, v_eng_id,  v_ls1a_id, v_sem2_id);

-- ── Parents ───────────────────────────────────────────────────
INSERT INTO parents (id, school_id, full_name, email, phone, relationship) VALUES
  (v_parent1_id, v_school_id, 'Mrs. Chanda Banda',  'cbanda@email.com',  '+260971000001', 'mother'),
  (v_parent2_id, v_school_id, 'Mr. Patrick Zulu',   'pzulu@email.com',   '+260971000002', 'father');

-- ── Students ─────────────────────────────────────────────────
INSERT INTO students (id, school_id, student_number, full_name, date_of_birth,
  gender, section_id, grade_id, stream_id, enrollment_date, status) VALUES
  (v_s1,  v_school_id,'S00001','Amara Banda',      '2014-03-12','female',v_cp_id,v_cp2_id,v_cp2a_id,'2022-08-01','active'),
  (v_s2,  v_school_id,'S00002','Kwame Zulu',       '2014-07-25','male',  v_cp_id,v_cp2_id,v_cp2a_id,'2022-08-01','active'),
  (v_s3,  v_school_id,'S00003','Thandiwe Moyo',    '2014-01-08','female',v_cp_id,v_cp2_id,v_cp2a_id,'2022-08-01','active'),
  (v_s4,  v_school_id,'S00004','Chisomo Phiri',    '2014-11-30','male',  v_cp_id,v_cp2_id,v_cp2a_id,'2023-01-10','active'),
  (v_s5,  v_school_id,'S00005','Nchimunya Tembo',  '2014-05-14','female',v_cp_id,v_cp2_id,v_cp2a_id,'2022-08-01','active'),
  (v_s6,  v_school_id,'S00006','Mulenga Mutale',   '2014-09-03','male',  v_cp_id,v_cp2_id,v_cp2a_id,'2022-08-01','active'),
  (v_s7,  v_school_id,'S00007','Luyando Kabwe',    '2014-02-17','female',v_cp_id,v_cp2_id,v_cp2a_id,'2022-08-01','active'),
  (v_s8,  v_school_id,'S00008','Sipho Dlamini',    '2014-06-22','male',  v_cp_id,v_cp2_id,v_cp2a_id,'2022-08-01','active'),
  (v_s9,  v_school_id,'S00009','Bwalya Chipata',   '2013-12-05','male',  v_ls_id,v_ls1_id,v_ls1a_id,'2020-08-01','active'),
  (v_s10, v_school_id,'S00010','Mutinta Sikazwe',  '2013-04-18','female',v_ls_id,v_ls1_id,v_ls1a_id,'2020-08-01','active');

-- ── Emergency contacts ────────────────────────────────────────
INSERT INTO emergency_contacts (school_id, student_id, contact_name, relationship, phone_primary) VALUES
  (v_school_id, v_s1,  'Mr. Charles Banda',  'father', '+260971100001'),
  (v_school_id, v_s2,  'Mrs. Faith Zulu',    'mother', '+260971100002'),
  (v_school_id, v_s3,  'Mr. James Moyo',     'father', '+260971100003'),
  (v_school_id, v_s4,  'Mrs. Ruth Phiri',    'mother', '+260971100004'),
  (v_school_id, v_s5,  'Mr. Paul Tembo',     'father', '+260971100005'),
  (v_school_id, v_s6,  'Mrs. Mary Mutale',   'mother', '+260971100006'),
  (v_school_id, v_s7,  'Mr. John Kabwe',     'father', '+260971100007'),
  (v_school_id, v_s8,  'Mrs. Ann Dlamini',   'mother', '+260971100008'),
  (v_school_id, v_s9,  'Mrs. Susan Chipata', 'mother', '+260971100009'),
  (v_school_id, v_s10, 'Mr. George Sikazwe', 'father', '+260971100010');

-- ── Parent links ──────────────────────────────────────────────
INSERT INTO student_parent_links (school_id, student_id, parent_id) VALUES
  (v_school_id, v_s1, v_parent1_id),
  (v_school_id, v_s2, v_parent2_id);

-- ── Marks (Semester 1 — completed for CP2A) ───────────────────
-- English marks for CP2A students (8 students entered)
INSERT INTO marks (school_id, student_id, subject_id, stream_id, semester_id, assessment_type, value, entered_by) VALUES
  (v_school_id,v_s1,v_eng_id,v_cp2a_id,v_sem1_id,'fa1', 78, v_st_id),
  (v_school_id,v_s1,v_eng_id,v_cp2a_id,v_sem1_id,'fa2', 82, v_st_id),
  (v_school_id,v_s1,v_eng_id,v_cp2a_id,v_sem1_id,'summative', 75, v_st_id),
  (v_school_id,v_s2,v_eng_id,v_cp2a_id,v_sem1_id,'fa1', 65, v_st_id),
  (v_school_id,v_s2,v_eng_id,v_cp2a_id,v_sem1_id,'fa2', 70, v_st_id),
  (v_school_id,v_s2,v_eng_id,v_cp2a_id,v_sem1_id,'summative', 68, v_st_id),
  (v_school_id,v_s3,v_eng_id,v_cp2a_id,v_sem1_id,'fa1', 88, v_st_id),
  (v_school_id,v_s3,v_eng_id,v_cp2a_id,v_sem1_id,'fa2', 91, v_st_id),
  (v_school_id,v_s3,v_eng_id,v_cp2a_id,v_sem1_id,'summative', 85, v_st_id);

-- ── Attendance records (current semester, some days) ──────────
INSERT INTO attendance_records (school_id, student_id, stream_id, semester_id, date, status, submitted_by) VALUES
  (v_school_id,v_s1,v_cp2a_id,v_sem2_id,'2026-04-21','present',v_hrt_id),
  (v_school_id,v_s2,v_cp2a_id,v_sem2_id,'2026-04-21','present',v_hrt_id),
  (v_school_id,v_s3,v_cp2a_id,v_sem2_id,'2026-04-21','absent', v_hrt_id),
  (v_school_id,v_s4,v_cp2a_id,v_sem2_id,'2026-04-21','late',   v_hrt_id),
  (v_school_id,v_s5,v_cp2a_id,v_sem2_id,'2026-04-21','present',v_hrt_id),
  (v_school_id,v_s6,v_cp2a_id,v_sem2_id,'2026-04-21','present',v_hrt_id),
  (v_school_id,v_s7,v_cp2a_id,v_sem2_id,'2026-04-21','present',v_hrt_id),
  (v_school_id,v_s8,v_cp2a_id,v_sem2_id,'2026-04-21','present',v_hrt_id);

-- ── Finance records ───────────────────────────────────────────
INSERT INTO finance_records (school_id, student_id, semester_id, status, balance) VALUES
  (v_school_id, v_s1,  v_sem2_id, 'paid',   0),
  (v_school_id, v_s2,  v_sem2_id, 'unpaid', 4500),
  (v_school_id, v_s3,  v_sem2_id, 'paid',   0),
  (v_school_id, v_s4,  v_sem2_id, 'paid',   0),
  (v_school_id, v_s5,  v_sem2_id, 'unpaid', 4500),
  (v_school_id, v_s6,  v_sem2_id, 'paid',   0),
  (v_school_id, v_s7,  v_sem2_id, 'paid',   0),
  (v_school_id, v_s8,  v_sem2_id, 'paid',   0);

-- ── Semester 1 Report for Amara Banda ─────────────────────────
INSERT INTO reports (school_id, student_id, semester_id, status, hrt_comment,
  overall_percentage, class_position, approved_by, approved_at, released_at,
  finance_cleared_by, finance_cleared_at)
VALUES (v_school_id, v_s1, v_sem1_id, 'released',
  'Amara has shown remarkable growth this semester. Her analytical thinking and participation in class discussions are commendable. Keep up the excellent work!',
  77.3, 4, v_hrt_id, '2026-01-08 09:00:00+02', '2026-01-10 14:00:00+02',
  v_finance_id, '2026-01-09 11:00:00+02');

-- ── Day Book entries ──────────────────────────────────────────
INSERT INTO day_book_entries (school_id, student_id, date, category, description,
  created_by, send_to_parent, edit_window_closes_at)
VALUES
  (v_school_id, v_s2, '2026-04-20', 'academic_concern',
   'Kwame has not submitted his Science project for the second time. Please follow up with parents regarding homework support.',
   v_hrt_id, true, now() - INTERVAL '1 hour'),
  (v_school_id, v_s3, '2026-04-18', 'achievement',
   'Thandiwe scored the highest in the Mathematics quiz — 98/100. Excellent performance!',
   v_st_id, false, now() - INTERVAL '2 days'),
  (v_school_id, v_s4, '2026-04-15', 'behaviour_minor',
   'Chisomo arrived 20 minutes late without a note. Parents have been informed.',
   v_hrt_id, true, now() - INTERVAL '8 days');

-- ── CREED for Amara (Semester 1) ─────────────────────────────
INSERT INTO character_records (school_id, student_id, semester_id,
  creativity, respect, excellence, empathy, discipline, entered_by, is_locked)
VALUES (v_school_id, v_s1, v_sem1_id, 'A', 'A*', 'B', 'A', 'B', v_hrt_id, true);

END $$;
