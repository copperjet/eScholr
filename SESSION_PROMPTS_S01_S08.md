# EduCore — Session Prompts S01–S08
> Paste each block into a fresh Claude Code session. Each is self-contained.
> Stack: React Native (Expo), Supabase (Postgres + RLS), Zustand, React Query, Puppeteer, Expo Router

---

# SESSION S01: Database Schema — Core Entities (Migrations 001–010)

## Project Context
Building EduCore SMS — mobile-first school management app.
Multi-tenant: every table has `school_id`. Supabase Postgres + RLS.
Pilot school: ~800 students, 80 staff, Grades Nursery–A Level.

## Goal
Create Supabase SQL migrations 001–010 covering schools, academic structure, users, students, assignments, attendance, and marks.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
supabase/migrations/001_schools.sql
supabase/migrations/002_academic_structure.sql
supabase/migrations/003_academic_year.sql
supabase/migrations/004_grading.sql
supabase/migrations/005_users.sql
supabase/migrations/006_students.sql
supabase/migrations/007_assignments.sql
supabase/migrations/008_attendance.sql
supabase/migrations/009_marks.sql
supabase/migrations/010_character.sql
```

## Schema Specification

### 001_schools.sql
```
schools:
  id UUID PK DEFAULT gen_random_uuid()
  name TEXT NOT NULL
  code TEXT UNIQUE NOT NULL  -- login identifier e.g. 'CIS2026'
  logo_url TEXT
  primary_color CHAR(7)      -- hex e.g. '#1B2A4A'
  secondary_color CHAR(7)
  country TEXT
  timezone TEXT
  currency CHAR(3)
  subscription_plan TEXT CHECK IN ('starter','growth','scale','enterprise') DEFAULT 'growth'
  subscription_status TEXT CHECK IN ('active','trial','suspended','cancelled') DEFAULT 'trial'
  created_at TIMESTAMPTZ DEFAULT now()

school_configs:
  id UUID PK
  school_id UUID FK schools NOT NULL
  config_key TEXT NOT NULL
  config_value TEXT
  updated_by UUID  -- staff_id FK (added later via ALTER after staff table exists)
  updated_at TIMESTAMPTZ DEFAULT now()
  UNIQUE(school_id, config_key)

-- Seed default configs on school creation via trigger:
-- report_comment_max_chars: '600'
-- attendance_threshold_pct: '85'
-- school_phone: ''
-- school_email: ''
-- class_position_enabled: 'true'
-- student_photo_on_report: 'true'
-- eyd_creed_scale: 'cambridge'
-- finance_gate_enabled: 'true'
-- demo_mode: 'false'
```

### 002_academic_structure.sql
```
school_sections:
  id UUID PK
  school_id UUID FK NOT NULL
  name TEXT NOT NULL        -- 'Early Years Department'
  code TEXT NOT NULL        -- 'EYD'
  order_index INTEGER DEFAULT 0

grades:
  id UUID PK
  school_id UUID FK NOT NULL
  section_id UUID FK school_sections NOT NULL
  name TEXT NOT NULL        -- 'CP1'
  order_index INTEGER DEFAULT 0

streams:
  id UUID PK
  school_id UUID FK NOT NULL
  grade_id UUID FK grades NOT NULL
  name TEXT NOT NULL        -- 'CP1A'
  order_index INTEGER DEFAULT 0

subjects:
  id UUID PK
  school_id UUID FK NOT NULL
  name TEXT NOT NULL
  department TEXT

grade_subject_assignments:
  id UUID PK
  school_id UUID FK NOT NULL
  grade_id UUID FK grades NOT NULL
  subject_id UUID FK subjects NOT NULL
  is_mandatory BOOLEAN DEFAULT true
  UNIQUE(grade_id, subject_id)
```

### 003_academic_year.sql
```
academic_years:
  id UUID PK
  school_id UUID FK NOT NULL
  name TEXT NOT NULL        -- '2025/2026'
  start_date DATE NOT NULL
  end_date DATE NOT NULL
  is_active BOOLEAN DEFAULT false

semesters:
  id UUID PK
  school_id UUID FK NOT NULL
  academic_year_id UUID FK academic_years NOT NULL
  name TEXT NOT NULL        -- 'Semester 1'
  start_date DATE NOT NULL
  end_date DATE NOT NULL
  marks_open_date TIMESTAMPTZ
  marks_close_date TIMESTAMPTZ
  is_active BOOLEAN DEFAULT false
  order_index INTEGER DEFAULT 1

calendar_events:
  id UUID PK
  school_id UUID FK NOT NULL
  academic_year_id UUID FK NOT NULL
  title TEXT NOT NULL
  description TEXT
  start_date DATE NOT NULL
  end_date DATE NOT NULL
  event_type TEXT CHECK IN ('holiday','exam_period','parent_evening','other') DEFAULT 'other'
  recurrence_rule TEXT      -- RRULE string, nullable
  created_by UUID           -- staff_id

-- CONSTRAINT: only one active academic_year per school
-- CONSTRAINT: only one active semester per school
-- Add triggers to enforce these constraints
```

### 004_grading.sql
```
grading_scales:
  id UUID PK
  school_id UUID FK NOT NULL
  grade_label TEXT NOT NULL   -- 'A*','A','B','C','D','E','F','G','U'
  min_percentage INTEGER NOT NULL
  max_percentage INTEGER NOT NULL
  description TEXT
  order_index INTEGER DEFAULT 0
  UNIQUE(school_id, grade_label)

-- Default grades: A*(90-100), A(80-89), B(70-79), C(60-69), D(50-59), E(40-49), F(30-39), G(20-29), U(0-19)

assessment_templates:
  id UUID PK
  school_id UUID FK NOT NULL
  section_id UUID FK school_sections  -- NULL means applies to all sections
  name TEXT NOT NULL        -- 'FA1','FA2','Summative','Biweekly'
  weight_percent DECIMAL(5,2)
  is_on_report BOOLEAN DEFAULT true
  order_index INTEGER DEFAULT 0

-- Default templates:
-- EYD-LS sections: FA1(20%), FA2(20%), Summative(60%) + Biweekly(null weight, not on report)
-- IGCSE/AS/AL sections: Summative(100%)

character_frameworks:
  id UUID PK
  school_id UUID FK NOT NULL UNIQUE  -- one per school
  is_enabled BOOLEAN DEFAULT true
  value_names JSONB DEFAULT '["Creativity","Respect","Excellence","Empathy","Discipline"]'
  rating_scale TEXT CHECK IN ('cambridge','developmental') DEFAULT 'cambridge'
```

### 005_users.sql
```
-- Note: auth.users is managed by Supabase Auth. We create profile tables.

staff:
  id UUID PK DEFAULT gen_random_uuid()
  school_id UUID FK NOT NULL
  auth_user_id UUID UNIQUE REFERENCES auth.users(id)
  full_name TEXT NOT NULL
  staff_number TEXT UNIQUE  -- auto-generated e.g. 'STF001'
  email TEXT NOT NULL
  phone TEXT
  department TEXT
  status TEXT CHECK IN ('active','inactive') DEFAULT 'active'
  date_joined DATE DEFAULT CURRENT_DATE
  created_at TIMESTAMPTZ DEFAULT now()

staff_roles:
  id UUID PK
  school_id UUID FK NOT NULL
  staff_id UUID FK staff NOT NULL
  role TEXT CHECK IN ('super_admin','admin','front_desk','finance','principal','coordinator','hod','hrt','st') NOT NULL
  UNIQUE(staff_id, role)

parents:
  id UUID PK DEFAULT gen_random_uuid()
  school_id UUID FK NOT NULL
  auth_user_id UUID UNIQUE REFERENCES auth.users(id)
  full_name TEXT NOT NULL
  email TEXT NOT NULL
  phone TEXT
  relationship TEXT CHECK IN ('mother','father','guardian')
  created_at TIMESTAMPTZ DEFAULT now()

biometric_sessions:
  id UUID PK
  user_id UUID NOT NULL REFERENCES auth.users(id)
  device_id TEXT NOT NULL
  biometric_enabled BOOLEAN DEFAULT true
  last_biometric_auth_at TIMESTAMPTZ
  pin_hash TEXT              -- bcrypt hash, fallback for devices without biometric
  UNIQUE(user_id, device_id)

-- Add school_code as app_metadata on auth.users JWT via Supabase Auth hook
-- JWT must contain: { school_id, roles[], active_role }
```

### 006_students.sql
```
students:
  id UUID PK DEFAULT gen_random_uuid()
  school_id UUID FK NOT NULL
  student_number TEXT NOT NULL  -- auto-generated 'S00001', persistent
  full_name TEXT NOT NULL
  date_of_birth DATE NOT NULL
  gender TEXT CHECK IN ('male','female','other') NOT NULL
  section_id UUID FK school_sections NOT NULL
  grade_id UUID FK grades NOT NULL
  stream_id UUID FK streams NOT NULL
  enrollment_date DATE NOT NULL
  status TEXT CHECK IN ('active','inactive','graduated','transferred') DEFAULT 'active'
  photo_url TEXT
  medical_notes TEXT
  nationality TEXT
  first_language TEXT
  created_at TIMESTAMPTZ DEFAULT now()
  UNIQUE(school_id, student_number)

student_year_records:
  id UUID PK
  school_id UUID FK NOT NULL
  student_id UUID FK students NOT NULL
  semester_id UUID FK semesters NOT NULL
  stream_id UUID FK streams NOT NULL    -- stream for this specific semester
  enrollment_date DATE NOT NULL         -- effective start for this semester
  effective_start_date DATE NOT NULL
  fa1_weight_override DECIMAL(5,2)      -- NULL = use default (20%)
  fa2_weight_override DECIMAL(5,2)      -- NULL = use default (20%)
  summative_weight_override DECIMAL(5,2) -- NULL = use default (60%)
  year_end_outcome TEXT CHECK IN ('promoted','graduated','repeat_year','transferred') -- set at year end
  year_end_reason TEXT                  -- required if repeat_year
  created_by UUID FK staff NOT NULL
  UNIQUE(student_id, semester_id)

emergency_contacts:
  id UUID PK
  school_id UUID FK NOT NULL
  student_id UUID FK students NOT NULL UNIQUE  -- one per student
  contact_name TEXT NOT NULL
  relationship TEXT CHECK IN ('mother','father','guardian','grandparent','sibling','other') NOT NULL
  phone_primary TEXT NOT NULL
  phone_secondary TEXT
  medical_alert TEXT

student_parent_links:
  id UUID PK
  school_id UUID FK NOT NULL
  student_id UUID FK students NOT NULL
  parent_id UUID FK parents NOT NULL
  UNIQUE(student_id, parent_id)

subject_enrollments:
  id UUID PK
  school_id UUID FK NOT NULL
  student_id UUID FK students NOT NULL
  subject_id UUID FK subjects NOT NULL
  semester_id UUID FK semesters NOT NULL
  is_locked BOOLEAN DEFAULT false      -- locked when marks window opens (IGCSE)
  UNIQUE(student_id, subject_id, semester_id)
```

### 007_assignments.sql
```
subject_teacher_assignments:
  id UUID PK
  school_id UUID FK NOT NULL
  staff_id UUID FK staff NOT NULL
  subject_id UUID FK subjects NOT NULL
  stream_id UUID FK streams NOT NULL
  semester_id UUID FK semesters NOT NULL
  UNIQUE(staff_id, subject_id, stream_id, semester_id)

hrt_assignments:
  id UUID PK
  school_id UUID FK NOT NULL
  staff_id UUID FK staff NOT NULL
  stream_id UUID FK streams NOT NULL
  semester_id UUID FK semesters NOT NULL
  co_hrt_staff_id UUID FK staff         -- second homeroom teacher (nullable)
  UNIQUE(staff_id, stream_id, semester_id)
```

### 008_attendance.sql
```
attendance_records:
  id UUID PK
  school_id UUID FK NOT NULL
  student_id UUID FK students NOT NULL
  stream_id UUID FK streams NOT NULL
  semester_id UUID FK semesters NOT NULL
  date DATE NOT NULL
  status TEXT CHECK IN ('present','absent','late','ap','sick') NOT NULL
  submitted_by UUID FK staff NOT NULL
  submitted_at TIMESTAMPTZ NOT NULL
  register_locked BOOLEAN DEFAULT false
  corrected_by UUID FK staff
  correction_note TEXT
  corrected_at TIMESTAMPTZ
  UNIQUE(student_id, date)

excused_absence_requests:
  id UUID PK
  school_id UUID FK NOT NULL
  attendance_record_id UUID FK attendance_records NOT NULL UNIQUE
  reason_text TEXT NOT NULL
  granted_by UUID FK staff NOT NULL
  granted_at TIMESTAMPTZ DEFAULT now()

-- Attendance threshold: handled via DB function + trigger
-- Function: check_attendance_threshold(student_id, semester_id)
-- Returns: current_pct DECIMAL, is_below_threshold BOOLEAN
-- Called after each attendance_record INSERT/UPDATE
```

### 009_marks.sql
```
marks:
  id UUID PK
  school_id UUID FK NOT NULL
  student_id UUID FK students NOT NULL
  subject_id UUID FK subjects NOT NULL
  stream_id UUID FK streams NOT NULL
  semester_id UUID FK semesters NOT NULL
  assessment_type TEXT CHECK IN ('fa1','fa2','summative','biweekly') NOT NULL
  value DECIMAL(5,2)                   -- 0.00–100.00, NULL if not yet entered
  raw_total DECIMAL(6,4)              -- unrounded computed total (stored for audit)
  is_excused BOOLEAN DEFAULT false
  excused_reason TEXT                  -- max 200 chars, required if is_excused
  is_locked BOOLEAN DEFAULT false
  correction_unlocked_by UUID FK staff
  correction_unlocked_at TIMESTAMPTZ
  entered_by UUID FK staff
  updated_at TIMESTAMPTZ DEFAULT now()
  UNIQUE(student_id, subject_id, semester_id, assessment_type)

mark_audit_logs:
  id UUID PK
  school_id UUID FK NOT NULL
  mark_id UUID FK marks NOT NULL
  student_id UUID FK NOT NULL
  subject_id UUID FK NOT NULL
  old_value DECIMAL(5,2)
  new_value DECIMAL(5,2)
  changed_by UUID FK staff NOT NULL
  reason TEXT
  created_at TIMESTAMPTZ DEFAULT now()

mark_notes:
  id UUID PK
  school_id UUID FK NOT NULL
  mark_id UUID FK marks NOT NULL
  note_type TEXT CHECK IN ('deviation_warning','correction_note','admin_note') NOT NULL
  note_text TEXT NOT NULL
  created_by UUID FK staff NOT NULL
  created_at TIMESTAMPTZ DEFAULT now()

biweekly_records:
  id UUID PK
  school_id UUID FK NOT NULL
  student_id UUID FK students NOT NULL
  subject_id UUID FK subjects NOT NULL
  semester_id UUID FK semesters NOT NULL
  date DATE NOT NULL
  raw_score DECIMAL(5,2) NOT NULL
  entered_by UUID FK staff NOT NULL
  created_at TIMESTAMPTZ DEFAULT now()

-- DB Function: calculate_student_total(student_id, semester_id, subject_id)
-- Logic: get fa1, fa2, summative values (or overrides from StudentYearRecord)
-- Apply weights, compute raw_total, round to nearest integer (0.5 rounds up)
-- Return: raw_total DECIMAL, rounded_total INTEGER, grade_label TEXT
```

### 010_character.sql
```
character_records:
  id UUID PK
  school_id UUID FK NOT NULL
  student_id UUID FK students NOT NULL
  semester_id UUID FK semesters NOT NULL
  -- CREED values stored as individual columns for query efficiency:
  creativity TEXT        -- grade label e.g. 'A', 'B', or 'Emerging'/'Developing'/'Secure'/'Exceeding'
  respect TEXT
  excellence TEXT
  empathy TEXT
  discipline TEXT
  -- Additional values stored in JSON for configurable frameworks:
  extra_values JSONB DEFAULT '{}'
  entered_by UUID FK staff NOT NULL
  is_locked BOOLEAN DEFAULT false
  UNIQUE(student_id, semester_id)
```

## RLS Pattern (Apply to ALL Tables)
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_isolation" ON table_name
  FOR ALL USING (
    school_id = (auth.jwt() -> 'app_metadata' ->> 'school_id')::uuid
  );
```

## Critical Rules
- Every table MUST have `school_id UUID NOT NULL` — no exceptions
- Use `gen_random_uuid()` for all PKs — never SERIAL
- All timestamps are TIMESTAMPTZ — never TIMESTAMP (timezone matters)
- Add indexes on: `school_id`, `student_id`, `semester_id`, `stream_id` for every table that has them
- Add `CHECK` constraints at DB level — don't rely on app validation alone
- student_number format: 'S' + zero-padded 5-digit number per school
- staff_number format: 'STF' + zero-padded 3-digit number per school
- The `marks` table: `is_locked = true` when report approved; only unlocked by admin action recorded in `mark_audit_logs`

## DO NOT
- Do not create auth.users table — Supabase manages it
- Do not use SERIAL or auto-increment — use UUID PKs
- Do not skip RLS on any table
- Do not create application-level junction tables without school_id
- Do not add soft-delete `deleted_at` columns — status fields handle deactivation

---

# SESSION S02: Database Schema — Reports, Finance, Notifications, Audit + RLS Policies + Demo Seed

## Project Context
EduCore SMS — multi-tenant school management. Supabase Postgres + RLS.
S01 created migrations 001–010. This session completes the schema.

## Goal
Create migrations 011–018: reports, day book, finance, notifications, audit log, inquiries, all RLS policies, and demo school seed data.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
supabase/migrations/011_reports.sql
supabase/migrations/012_daybook.sql
supabase/migrations/013_finance.sql
supabase/migrations/014_notifications.sql
supabase/migrations/015_audit.sql
supabase/migrations/016_inquiry.sql
supabase/migrations/017_rls_policies.sql
supabase/migrations/018_demo_seed.sql
supabase/types/database.ts         -- Generated TypeScript types
```

## Schema Specification

### 011_reports.sql
```
report_templates:
  id UUID PK
  school_id UUID FK NOT NULL UNIQUE  -- one template per school
  show_student_photo BOOLEAN DEFAULT true
  show_class_position BOOLEAN DEFAULT true
  show_subject_teacher_name BOOLEAN DEFAULT true
  hrt_signature_label TEXT DEFAULT 'Class Teacher'
  head_signature_label TEXT DEFAULT 'Head of School'
  footer_text TEXT

reports:
  id UUID PK
  school_id UUID FK NOT NULL
  student_id UUID FK students NOT NULL
  semester_id UUID FK semesters NOT NULL
  status TEXT CHECK IN ('draft','pending_approval','approved','finance_pending','under_review','released') DEFAULT 'draft'
  hrt_comment TEXT           -- max 600 chars enforced by CHECK constraint
  overall_percentage DECIMAL(5,2)  -- calculated and stored at approval time
  class_position INTEGER           -- rank within stream, calculated at approval time
  approved_by UUID FK staff
  approved_at TIMESTAMPTZ
  released_at TIMESTAMPTZ
  finance_cleared_by UUID FK staff
  finance_cleared_at TIMESTAMPTZ
  created_at TIMESTAMPTZ DEFAULT now()
  UNIQUE(student_id, semester_id)
  CHECK (char_length(hrt_comment) <= 600)

report_versions:
  id UUID PK
  school_id UUID FK NOT NULL
  report_id UUID FK reports NOT NULL
  version_number INTEGER NOT NULL DEFAULT 1
  approved_at TIMESTAMPTZ NOT NULL
  approved_by UUID FK staff NOT NULL
  pdf_url TEXT                        -- Supabase Storage URL
  verification_token CHAR(16) UNIQUE NOT NULL  -- random, generated at approval
  is_current BOOLEAN DEFAULT true
  created_at TIMESTAMPTZ DEFAULT now()

-- CONSTRAINT: only one is_current = true per report_id
-- On new version insert: UPDATE report_versions SET is_current = false WHERE report_id = $1 AND is_current = true
-- verification_token: gen_random_bytes(8)::text in hex (16 hex chars)
```

### 012_daybook.sql
```
day_book_entries:
  id UUID PK
  school_id UUID FK NOT NULL
  student_id UUID FK students NOT NULL
  date DATE NOT NULL DEFAULT CURRENT_DATE
  category TEXT CHECK IN (
    'behaviour_minor','behaviour_serious','academic_concern',
    'achievement','attendance_note','health','communication','other'
  ) NOT NULL
  description TEXT NOT NULL
  created_by UUID FK staff NOT NULL
  send_to_parent BOOLEAN DEFAULT false
  edit_window_closes_at TIMESTAMPTZ NOT NULL  -- created_at + 15 minutes
  archived BOOLEAN DEFAULT false
  archived_by UUID FK staff
  archived_at TIMESTAMPTZ
  created_at TIMESTAMPTZ DEFAULT now()

-- Trigger: on INSERT, set edit_window_closes_at = now() + interval '15 minutes'
-- No hard deletes — only archived = true (Admin only)
```

### 013_finance.sql
```
finance_records:
  id UUID PK
  school_id UUID FK NOT NULL
  student_id UUID FK students NOT NULL
  semester_id UUID FK semesters NOT NULL
  status TEXT CHECK IN ('paid','unpaid') DEFAULT 'unpaid'
  balance DECIMAL(12,2) DEFAULT 0.00   -- outstanding balance
  updated_by UUID FK staff
  updated_at TIMESTAMPTZ DEFAULT now()
  UNIQUE(student_id, semester_id)

payment_transactions:
  id UUID PK
  school_id UUID FK NOT NULL
  finance_record_id UUID FK finance_records NOT NULL
  amount DECIMAL(12,2) NOT NULL
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now()
  recorded_by UUID FK staff NOT NULL
  note TEXT
  created_at TIMESTAMPTZ DEFAULT now()
```

### 014_notifications.sql
```
notification_logs:
  id UUID PK
  school_id UUID FK NOT NULL
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id)
  trigger_event TEXT CHECK IN (
    'attendance_absent','report_released','report_updated',
    'daybook_sent','marks_unlocked','marks_complete',
    'threshold_alert','app_update'
  ) NOT NULL
  channel TEXT CHECK IN ('push','in_app') NOT NULL
  title TEXT NOT NULL
  body TEXT NOT NULL
  deep_link_url TEXT
  delivery_status TEXT CHECK IN ('delivered','failed','no_device_registered') DEFAULT 'delivered'
  is_safeguarding BOOLEAN DEFAULT false   -- true only for attendance_absent
  is_read BOOLEAN DEFAULT false
  related_student_id UUID FK students     -- for admin delivery log filtering
  created_at TIMESTAMPTZ DEFAULT now()
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '90 days')

-- Index on: recipient_user_id, is_read, school_id, created_at DESC
-- Safeguarding triggers: only status = 'absent' attendance records
```

### 015_audit.sql
```
audit_logs:
  id UUID PK
  school_id UUID FK NOT NULL
  event_type TEXT CHECK IN (
    'mark_entered','mark_edited','mark_locked','mark_unlocked',
    'report_approved','report_released','report_unlocked',
    'attendance_submitted','attendance_corrected',
    'finance_status_changed','bulk_action',
    'account_created','account_deactivated',
    'student_promoted','student_graduated','student_repeat_year',
    'igcse_subject_changed','platform_impersonation',
    'daybook_archived','mark_excused'
  ) NOT NULL
  actor_id UUID FK staff              -- staff who performed action (nullable for system events)
  student_id UUID FK students         -- nullable
  data JSONB NOT NULL DEFAULT '{}'    -- all relevant context: old_value, new_value, reason, etc.
  created_at TIMESTAMPTZ DEFAULT now()

-- IMPORTANT: No UPDATE or DELETE policies on audit_logs — immutable
-- audit_logs are INSERT-only
-- Retention: 7 years minimum (do not add automated cleanup)
```

### 016_inquiry.sql
```
inquiries:
  id UUID PK
  school_id UUID FK NOT NULL
  name TEXT NOT NULL
  contact_phone TEXT
  contact_email TEXT
  nature_of_inquiry TEXT
  date DATE DEFAULT CURRENT_DATE
  status TEXT CHECK IN ('new','in_progress','enrolled','closed') DEFAULT 'new'
  converted_student_id UUID FK students  -- set when inquiry → enrollment conversion
  created_by UUID FK staff NOT NULL
  notes TEXT
  created_at TIMESTAMPTZ DEFAULT now()
```

### 017_rls_policies.sql
Apply the following RLS policy pattern to EVERY table created in migrations 001–016.

```sql
-- Pattern for staff-accessible tables:
CREATE POLICY "staff_school_isolation" ON {table}
  FOR ALL TO authenticated
  USING (school_id = (auth.jwt() -> 'app_metadata' ->> 'school_id')::uuid);

-- audit_logs: INSERT only, no UPDATE/DELETE
CREATE POLICY "audit_insert_only" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (school_id = (auth.jwt() -> 'app_metadata' ->> 'school_id')::uuid);

-- report_versions: no UPDATE or DELETE (immutable snapshots)
CREATE POLICY "report_versions_read_insert" ON report_versions
  FOR SELECT TO authenticated
  USING (school_id = (auth.jwt() -> 'app_metadata' ->> 'school_id')::uuid);
CREATE POLICY "report_versions_insert" ON report_versions
  FOR INSERT TO authenticated
  WITH CHECK (school_id = (auth.jwt() -> 'app_metadata' ->> 'school_id')::uuid);

-- notification_logs: users see only their own notifications
CREATE POLICY "notifications_own_only" ON notification_logs
  FOR SELECT TO authenticated
  USING (
    school_id = (auth.jwt() -> 'app_metadata' ->> 'school_id')::uuid
    AND recipient_user_id = auth.uid()
  );

-- Staff admin can see all notifications in their school:
CREATE POLICY "admin_all_notifications" ON notification_logs
  FOR SELECT TO authenticated
  USING (
    school_id = (auth.jwt() -> 'app_metadata' ->> 'school_id')::uuid
    AND (auth.jwt() -> 'app_metadata' -> 'roles') ? 'admin'
  );
```

Also create DB helper functions:
- `get_active_semester(school_id UUID) RETURNS UUID` — returns active semester id
- `is_marks_window_open(semester_id UUID) RETURNS BOOLEAN`
- `calculate_student_total(student_id UUID, semester_id UUID, subject_id UUID) RETURNS TABLE(raw_total DECIMAL, rounded_total INTEGER, grade_label TEXT)`
- `get_attendance_percentage(student_id UUID, semester_id UUID) RETURNS DECIMAL`

### 018_demo_seed.sql
Seed a complete demo school with realistic (not real) data:

```
Demo School:
  name: 'Cambridge International School'
  code: 'CIS_DEMO'
  primary_color: '#1B2A4A'
  secondary_color: '#E8A020'
  country: 'Zambia'
  timezone: 'Africa/Lusaka'
  currency: 'ZMW'
  subscription_plan: 'growth'
  subscription_status: 'active'

Seed:
- All 5 sections (EYD, CP, LS, IGCSE, AS/AL) with grades and streams per spec
- All subjects per section per spec (Section 2.5 of spec)
- Default grading scale (A* through U)
- Assessment templates per section
- CREED framework enabled, cambridge scale
- Academic year 2025/2026 with 2 semesters
- Active semester: Semester 2 (Jan–Jun 2026)
- Marks window: open (for demo purposes)
- 5 demo staff users (one per key role: Admin, HRT, ST, Finance, Parent-facing)
- 10 demo students across CP2A, LS1A, IGCSE1B
- Demo marks entered for most students (varied grades for realism)
- 2 demo parents linked to demo students
- 3 demo day book entries
- Finance records: mix of paid/unpaid
- 2 demo reports: one in 'approved' status, one in 'released' status
- 1 demo notification (unread) for demo parent
```

## TypeScript Types File
Generate `supabase/types/database.ts` using Supabase CLI pattern:
```bash
# Command to run after migrations are applied:
supabase gen types typescript --local > supabase/types/database.ts
```
Include this command in a README note, don't generate the types manually.

## Critical Rules
- audit_logs: INSERT-only. No UPDATE/DELETE RLS policy. This is immutable by design.
- report_versions: immutable snapshots. No UPDATE/DELETE.
- notification_logs expire after 90 days — add a scheduled Postgres function or note this for a cron Edge Function.
- All demo passwords: 'Demo@2026!' — document this clearly in seed file comments.
- Demo school must be completely isolated from any real school data.

## DO NOT
- Do not skip RLS on any table
- Do not add UPDATE/DELETE policies on audit_logs or report_versions
- Do not use real student names or real school data in demo seed
- Do not seed more than ~10 students — just enough for a convincing board demo

---

# SESSION S03: Design System — Tokens, Primitives & Core Components

## Project Context
EduCore SMS — React Native (Expo) app. Mobile-first. iOS + Android.
Design law: beautiful, premium, instant. No loading spinners. Dark mode from day 1.
Brand colors are injected at runtime from school config — every component uses tokens.

## Goal
Build the complete design system: color tokens (light + dark), typography scale, spacing, and all core UI components.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
constants/colors.ts
constants/typography.ts
constants/spacing.ts
constants/themes.ts
hooks/useTheme.ts
components/ui/Text.tsx
components/ui/Card.tsx
components/ui/Button.tsx
components/ui/FAB.tsx
components/ui/BottomSheet.tsx
components/ui/Skeleton.tsx
components/ui/Badge.tsx
components/ui/Avatar.tsx
components/ui/SearchBar.tsx
components/ui/EmptyState.tsx
components/ui/ErrorState.tsx
components/ui/ProgressBar.tsx
components/ui/Divider.tsx
components/ui/StatusChip.tsx
components/ui/IconButton.tsx
providers/ThemeProvider.tsx
providers/BrandProvider.tsx
```

## Specification

### Color Tokens (constants/colors.ts)
```typescript
// Light mode base
export const lightColors = {
  background: '#FFFFFF',
  surface: '#F9FAFB',
  surfaceSecondary: '#F3F4F6',
  border: '#E5E7EB',
  borderStrong: '#D1D5DB',
  textPrimary: '#1B2A4A',
  textSecondary: '#374151',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',
  // Semantic
  success: '#10B981',
  successLight: '#D1FAE5',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  info: '#3B82F6',
  infoLight: '#DBEAFE',
  // Attendance status
  present: '#10B981',
  presentLight: '#D1FAE5',
  late: '#F59E0B',
  lateLight: '#FEF3C7',
  absent: '#EF4444',
  absentLight: '#FEE2E2',
  ap: '#3B82F6',
  apLight: '#DBEAFE',
  sick: '#8B5CF6',
  sickLight: '#EDE9FE',
};

export const darkColors = {
  background: '#111827',
  surface: '#1F2937',
  surfaceSecondary: '#374151',
  border: '#374151',
  borderStrong: '#4B5563',
  textPrimary: '#F9FAFB',
  textSecondary: '#D1D5DB',
  textMuted: '#9CA3AF',
  textInverse: '#111827',
  // Semantic (same as light — high contrast accents)
  success: '#10B981',
  successLight: '#064E3B',
  warning: '#F59E0B',
  warningLight: '#78350F',
  error: '#EF4444',
  errorLight: '#7F1D1D',
  info: '#3B82F6',
  infoLight: '#1E3A5F',
  // Attendance (same values, dark bg)
  present: '#10B981',
  presentLight: '#064E3B',
  late: '#F59E0B',
  lateLight: '#78350F',
  absent: '#EF4444',
  absentLight: '#7F1D1D',
  ap: '#3B82F6',
  apLight: '#1E3A5F',
  sick: '#8B5CF6',
  sickLight: '#2E1065',
};

// Brand colors — injected at runtime, default values for dev
export const defaultBrand = {
  primary: '#1B2A4A',
  secondary: '#E8A020',
};
```

### Typography (constants/typography.ts)
```typescript
// Font: System default (San Francisco on iOS, Roboto on Android)
// Scale: 6 sizes. Line heights: 1.3–1.5x.
export const typography = {
  h1: { fontSize: 28, fontWeight: '700', lineHeight: 36 },
  h2: { fontSize: 22, fontWeight: '700', lineHeight: 30 },
  h3: { fontSize: 18, fontWeight: '600', lineHeight: 26 },
  h4: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodyMedium: { fontSize: 15, fontWeight: '500', lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '500', lineHeight: 16, letterSpacing: 0.5 },
  overline: { fontSize: 11, fontWeight: '600', lineHeight: 14, letterSpacing: 1, textTransform: 'uppercase' as const },
};
```

### Spacing (constants/spacing.ts)
```typescript
export const spacing = {
  xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, '2xl': 32, '3xl': 48,
};
export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, full: 9999,
};
// Minimum tap target: 48px (accessibility)
export const MIN_TAP_TARGET = 48;
```

### Core Components

**Text.tsx** — themed Text with variant prop
Props: `variant` ('h1'|'h2'|'h3'|'h4'|'body'|'bodyMedium'|'caption'|'label'|'overline'), `color` (token name or hex), `align`, standard RN Text props.
Reads color from useTheme. Never hardcodes colors.

**Card.tsx** — themed surface container
Props: `accentColor` (hex, optional — shows 3px left border strip), `onPress` (optional), `padding` (default: base), `shadow` (boolean, default: true).

**Button.tsx** — primary / secondary / ghost / danger variants
Props: `variant` ('primary'|'secondary'|'ghost'|'danger'), `size` ('sm'|'md'|'lg'), `fullWidth`, `loading` (boolean, shows skeleton pulse, NOT spinner), `leftIcon`, `rightIcon`.
Primary bg = brand primary color. Never show ActivityIndicator.

**FAB.tsx** — floating action button
Props: `icon` (Ionicons name), `label` (optional), `onPress`, `color` (default: brand primary).
Position: absolute bottom-right, 24px from edges. Safe area aware.

**BottomSheet.tsx** — swipeable bottom sheet
Props: `visible`, `onClose`, `title` (optional), `children`, `snapPoints` (array of heights).
Use `react-native-gesture-handler` + `react-native-reanimated`. Backdrop dims to rgba(0,0,0,0.5). Swipe down to dismiss + haptic (light).

**Skeleton.tsx** — loading placeholder
Props: `width`, `height`, `borderRadius`, `lines` (for multi-line text skeleton).
Animated shimmer: bg alternates between surface and surfaceSecondary. Duration: 1000ms loop.

**Badge.tsx** — status badge
Props: `label`, `color` (semantic: 'success'|'warning'|'error'|'info'|'neutral'), `size` ('sm'|'md').
Pill shape, colored bg at 15% opacity + colored text.

**Avatar.tsx** — student/staff photo
Props: `photoUrl` (optional), `name` (fallback initials), `size` (24–80), `onPress`.
Fallback: initials (first + last word of name) on brand primary background.

**SearchBar.tsx** — global search input
Props: `value`, `onChangeText`, `placeholder`, `onClear`.
Debounce: caller handles (200ms). Shows X button when value non-empty. No search button.
Tap target for clear: 48x48.

**EmptyState.tsx**
Props: `title`, `body`, `actionLabel` (optional), `onAction` (optional), `illustration` (image source, optional).
Centered layout. Never show blank screen.

**ErrorState.tsx**
Props: `message`, `onRetry` (optional), `retryLabel` ('Try again' default).
Shows error icon, human message, retry button.

**ProgressBar.tsx**
Props: `value` (0–100), `color` (default: brand primary), `height` (default: 8), `showLabel` (boolean).
Animated fill. Rounded ends.

**StatusChip.tsx** — attendance status indicator
Props: `status` ('present'|'absent'|'late'|'ap'|'sick'), `size` ('sm'|'md').
Colored pill from attendance color tokens.

**IconButton.tsx** — icon-only tap target
Props: `icon` (Ionicons name), `onPress`, `color`, `size`.
Min tap target: 48x48. Ripple on Android.

### Providers

**ThemeProvider.tsx**
- Reads system color scheme with `useColorScheme()`
- Allows user override stored in Zustand
- Provides `{ colors, isDark }` via context

**BrandProvider.tsx**
- Fetches school brand config from Zustand store on app load
- Provides `{ primaryColor, secondaryColor, logoUrl }` via context
- Applied immediately on school code entry (before auth)

### useTheme hook
```typescript
// Returns merged theme: base colors + brand colors
const { colors, brand, isDark } = useTheme();
```

## Critical Rules
- ZERO hardcoded color hex values in component files — all from `useTheme()`
- Brand colors (primary, secondary) are runtime values — never assume a fixed value
- Min tap target: 48dp on all interactive elements
- No ActivityIndicator anywhere — Skeleton only
- Dark mode: test every component in both modes
- BottomSheet must handle safe area bottom inset (iOS home indicator)
- All font sizes use the typography scale — no ad-hoc `fontSize` values in screens

## DO NOT
- Do not install heavy UI libraries (no NativeBase, no UI Kitten, no Tamagui)
- Do not use StyleSheet.create with hardcoded colors
- Do not use `Platform.select` for colors — use theme tokens instead
- Do not add ActivityIndicator or loading spinners anywhere

---

# SESSION S04: Auth Flow + Navigation Shell + Biometric

## Project Context
EduCore SMS — React Native (Expo), Supabase Auth (JWT), Expo Router.
Design system from S03 exists in `components/ui/`.
DB schema from S01/S02 exists in `supabase/migrations/`.
Multi-tenant: school code → school_id → branding loads before auth.
10 roles: super_admin, admin, front_desk, finance, principal, coordinator, hod, hrt, st, parent.

## Goal
Build the complete auth flow (school code → branding → login → JWT), biometric auth, role-based navigation shell, and role switcher.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
app/_layout.tsx                  -- Root layout, providers
app/(auth)/_layout.tsx
app/(auth)/index.tsx             -- School code entry screen
app/(auth)/login.tsx             -- Email + password login screen
app/(auth)/set-password.tsx      -- Forced password change (first login + parent)
app/(auth)/forgot-password.tsx   -- Password reset request
app/(app)/_layout.tsx            -- Authenticated shell, role-based tabs
app/(app)/(hrt)/_layout.tsx      -- HRT tab navigator
app/(app)/(st)/_layout.tsx       -- Subject Teacher tab navigator
app/(app)/(admin)/_layout.tsx    -- Admin tab navigator
app/(app)/(finance)/_layout.tsx  -- Finance tab navigator
app/(app)/(parent)/_layout.tsx   -- Parent tab navigator
app/(app)/(frontdesk)/_layout.tsx
app/(app)/(principal)/_layout.tsx
lib/supabase.ts                  -- Supabase client
lib/auth.ts                      -- Auth helpers + biometric
stores/authStore.ts              -- Zustand auth store
stores/brandStore.ts             -- Brand/school config store
hooks/useAuth.ts
hooks/useBrand.ts
app/update-required.tsx          -- Blocking update screen
```

## Specification

### School Code Screen (app/(auth)/index.tsx)
1. EduCore logo centered top half
2. "Enter your school code" label
3. Text input: all-caps, code-style font, auto-capitalize
4. "Continue" button (disabled until 3+ chars entered)
5. On submit: POST to Edge Function or Supabase RPC `resolve_school(code TEXT)`
   - Returns: `{ school_id, name, logo_url, primary_color, secondary_color }`
   - On success: store in `brandStore`, navigate to `/login`
   - On error: inline field error "School not found. Check your school code and try again."
6. **Brand injection**: as soon as school resolves, primary_color is applied to the Continue button and input border — before auth. Logo shows in corner.
7. Rate limiting: track failed attempts in Zustand. After 10 fails: show "Too many attempts. Try again in 1 hour." (no more input for 1 hour — store cooldown timestamp).

### Login Screen (app/(auth)/login.tsx)
1. School logo top (from brandStore)
2. School name as subtitle
3. Email input (keyboard: email-address)
4. Password input (secureTextEntry, show/hide toggle)
5. "Forgot password?" link → `/forgot-password`
6. "Sign In" button (brand primary color)
7. On submit: `supabase.auth.signInWithPassword({ email, password })`
   - On success: check JWT claims for roles[], navigate to role dashboard
   - If multiple roles: show role-switcher BottomSheet before navigation
   - On first login (parent forced change): navigate to `/set-password`
   - On error: show specific messages:
     - Wrong password: "Incorrect password. Try again."
     - Account locked: "Too many failed attempts. Try again in 15 minutes or reset your password."
     - School not found: shouldn't happen here, but handle gracefully
8. Rate limiting: after 5 wrong passwords → show locked message (Supabase handles lockout, app shows appropriate message from error code)
9. Biometric prompt: if biometric_sessions record exists and biometric_enabled = true, show biometric prompt on screen load. Skip email/password on success.

### Biometric Auth (lib/auth.ts)
```typescript
// On app cold start:
// 1. Check if valid session exists (Supabase session)
// 2. If session valid + biometric_enabled: prompt biometric
// 3. If biometric success: skip login, navigate to dashboard
// 4. If biometric fail 3x: fall back to password login
// 5. If no session: show school code screen

// Use expo-local-authentication:
// LocalAuthentication.authenticateAsync({ promptMessage: 'Sign in to EduCore' })
// LocalAuthentication.hasHardwareAsync() + isEnrolledAsync() to check support
// PIN fallback: if !hasHardware, show PIN input (4-digit, stored as bcrypt hash in biometric_sessions)
```

### JWT + Role Resolution (lib/auth.ts)
```typescript
// After sign in, decode JWT app_metadata:
// { school_id: string, roles: string[], active_role: string }
// Store in authStore: { user, school_id, roles, activeRole }
// Navigate to: getRouteForRole(activeRole)

const roleRoutes = {
  hrt: '/(app)/(hrt)',
  st: '/(app)/(st)',
  admin: '/(app)/(admin)',
  super_admin: '/(app)/(admin)',
  finance: '/(app)/(finance)',
  parent: '/(app)/(parent)',
  front_desk: '/(app)/(frontdesk)',
  principal: '/(app)/(principal)',
  coordinator: '/(app)/(principal)',  // same UI, different data scope
  hod: '/(app)/(st)',  // inherits ST + dept monitoring
};
```

### Role-Based Tab Navigators
Each role gets its own tab bar. Only show tabs relevant to that role.

**HRT tabs:** Home | Attendance | Marks | Day Book | Profile
**ST tabs:** Home | Marks | Day Book | Profile
**Admin tabs:** Home | Students | Staff | Reports | More (→ Finance, Calendar, Audit, Settings)
**Finance tabs:** Home | Payments | Reports | Profile
**Parent tabs:** Home | Reports | Attendance | Inbox | Profile
**Front Desk tabs:** Home | Students | Inquiries | Calendar | Profile
**Principal tabs:** Home | Reports | Attendance | Profile

Tab bar styling:
- Active tab: brand primary color icon + label
- Inactive tab: textMuted color
- Background: surface color (adapts to dark mode)
- Top border: 1px border color

### Role Switcher (BottomSheet)
Accessible from profile icon (top app bar) on every screen.
Shows list of user's available roles as large tappable rows.
Selected role has checkmark + brand primary color.
On select: update `authStore.activeRole`, reload navigation, reset to Home tab.
"Switching role will discard unsaved changes. Continue?" — confirm if form is dirty.

### App Version Check (app/_layout.tsx)
On cold start, before anything else:
```typescript
// RPC: get_minimum_app_version() → { min_version: string, current_store_url: string }
// Compare with Constants.expoConfig.version
// If below min: navigate to /update-required (blocking, no back)
// If within 7 days grace: show dismissible banner on home screen
```

### Authstore (stores/authStore.ts)
```typescript
interface AuthState {
  user: User | null;
  session: Session | null;
  school_id: string | null;
  roles: string[];
  activeRole: string | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setActiveRole: (role: string) => void;
  signOut: () => Promise<void>;
}
```

### Set Password Screen (app/(auth)/set-password.tsx)
- Required on first login for parents + any user with temp password
- New password input + confirm password
- Rules: min 8 chars, 1 number, 1 uppercase (show rules inline as user types)
- On save: `supabase.auth.updateUser({ password })`
  - Invalidates all other sessions (server-side via auth hook)
  - Navigate to dashboard

## Critical Rules
- School code screen: brand colors apply to button + input border as soon as school resolves — BEFORE the user authenticates. This is a core product feature.
- Biometric is offered on first successful login. Default: ON. Stored in `biometric_sessions` table.
- Never store password in local storage. JWT only.
- Session persistence: users stay logged in across app restarts (Supabase handles refresh tokens).
- `/(app)/` route is protected — redirect to `/(auth)` if no valid session.
- Multi-role users: show role switcher BottomSheet immediately post-login if >1 role.

## DO NOT
- Do not build custom auth — Supabase Auth handles it
- Do not use AsyncStorage directly for sensitive data — Supabase SDK uses SecureStore
- Do not build separate apps per role — one app, role-based navigation
- Do not show a loading spinner on any screen — Skeleton or instant navigation

---

# SESSION S05: Board Demo Build — 7 Polished Screens

## Project Context
EduCore SMS — React Native (Expo). Design system in `components/ui/`. Auth shell in `app/(auth)/` + `app/(app)/`.
This is the first engineering deliverable. Goal: 20-minute board presentation. Pre-seeded demo data, no real CRUD.
Demo school: code 'CIS_DEMO', primary '#1B2A4A', secondary '#E8A020', logo available at `assets/demo-logo.png`.

## Goal
Build 7 polished, pixel-perfect screens using demo data. These screens must be board-ready: beautiful, fast, no rough edges.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
app/(auth)/index.tsx             -- UPDATE: polish school code screen for demo
app/(auth)/login.tsx             -- UPDATE: polish login screen for demo
app/(app)/(hrt)/index.tsx        -- HRT Home Dashboard
app/(app)/(hrt)/attendance/index.tsx  -- Attendance Register
app/(app)/(hrt)/attendance/success.tsx -- Submission success screen
app/(app)/(parent)/index.tsx     -- Parent Home Dashboard
app/(app)/(parent)/report/[id].tsx  -- Report PDF Viewer
components/modules/AttendanceRegister.tsx
components/modules/ReportViewer.tsx
hooks/useDemoData.ts             -- Static demo data hook (no API calls)
assets/demo-logo.png             -- Copy/reference school logo
```

## Screen Specifications

### Screen 1: School Code Entry (polish existing)
- Large EduCore wordmark top half
- "Welcome to EduCore" subtitle in textSecondary
- Input: large, rounded, code-style. Placeholder: "e.g. CIS2026"
- Continue button: full width, brand primary
- On CIS_DEMO entered: instantly apply school branding (no API needed for demo — hardcoded demo config)
- Animation: logo fades in, input slides up — 300ms ease-out on mount

### Screen 2: Login (polish existing)
- School logo (demo logo) center top
- "Cambridge International School" subtitle
- Clean email + password fields
- "Sign In" button in brand primary
- Subtle shadow on card container
- Below button: school code shown dimly "School: CIS_DEMO"

### Screen 3: HRT Home Dashboard
Layout (scroll view):
1. **Header**: "Good morning, Ms. Kamau" (time-based greeting) + bell icon (notification badge: 2)
2. **Attendance card** (tap → Screen 4):
   - Title: "Today's Register" | Status badge: "NOT SUBMITTED" (red) or "SUBMITTED" (green)
   - Subtitle: "CP2A • 28 students"
   - Arrow icon right
3. **Marks progress card**:
   - Title: "Marks Progress — Semester 2"
   - List: 3 subjects each showing "X of 28 marks entered" + progress bar
   - One subject shows in red (incomplete)
4. **Reports status card**:
   - Row: "Pending Approval: 12 | Approved: 8 | Released: 8"
5. **Recent Day Book** (3 entries):
   - Each: student avatar + name + category badge + "2h ago"
6. **Quick actions strip**: 3 icon buttons: "Attendance" | "Day Book" | "Reports"

### Screen 4: Attendance Register
Header: "CP2A — Attendance" + date (today) + "28 students"
**Student list**: 28 rows (demo data, use realistic Zambian names)
Each row:
- Avatar (initials) + Name + status chip (default: empty/unmarked)
- Tap row → opens BottomSheet with 5 status options
**Status BottomSheet**:
- Large rows: Present (✓ green) | Late (⏰ amber) | Absent (✗ red) | Absent w/ Permission (🔵 blue) | Sick (💜 purple)
- Selected = checkmark + colored background
- Closes immediately on selection + haptic (light)
- Row updates with colored StatusChip
**FAB** (bottom right): "Mark All..." label
- Tap → BottomSheet: "Set all students to:" + same 5 options
- On select: all rows animate to chosen status + haptic (success, heavy)
**Submit button** (sticky bottom bar):
- "Submit Register" — brand primary, full width
- Count badge: "28 / 28 marked" (shows progress)
- Disabled + grey if not all marked. Enabled when all marked.

### Screen 5: Submission Success
Full-screen success state:
- Large animated checkmark (scale in animation, 400ms)
- "Register Submitted" h2
- "CP2A • 28 students marked" caption
- Time: "Submitted at 8:14am"
- Haptic: success (heavy) on mount
- "Done" button → back to HRT Home
- Auto-navigate after 3 seconds if no tap

### Screen 6: Parent Home Dashboard
Layout:
1. **Header**: "Hello, Mrs. Banda" + bell icon (badge: 1)
2. **Child card** (if multiple children: switcher tabs at top):
   - Child photo placeholder + "Amara Banda" + "CP2A • Active"
3. **Latest Report card** (tap → Screen 7):
   - "Semester 1 Report" | "Available" green badge
   - "Tap to view" hint
   - Released date
4. **Attendance summary bar**:
   - "This Semester" label
   - Visual bar: green/red/amber segments
   - "Present: 68 | Absent: 4 | Late: 3 | Total: 75 days | 94.7%"
5. **Recent Day Book** (3 entries):
   - Teacher name + date + category badge + "Tap to read" → detail
6. **Fees status**:
   - Green "Paid ✓" badge if paid, red "Unpaid" if not
   - Semester label

### Screen 7: Report PDF Viewer
Header: "Semester 1 Report — Amara Banda" + share icon (top right) + download icon
**PDF Viewer**: Use `expo-web-browser` or a WebView to render a sample PDF, OR render a native report card view if PDF not available:

Native report card layout (use if PDF not ready):
```
[School logo left] [Cambridge International School] [REPORT CARD]
Academic Year: 2025/2026 | Semester 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Student: Amara Banda          [Photo]
Grade: CP2  Stream: CP2A
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACADEMIC PERFORMANCE
Subject           FA1  FA2  Sum  Total  Grade  Teacher
English            78   82   75   77%    B      Mr. Phiri
Mathematics        85   88   82   84%    A      Ms. Mwale
[... 8 more subjects]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall Average: 79.3% | Grade: B | Position: 4th of 28
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREED CHARACTER ASSESSMENT
Creativity: A | Respect: A* | Excellence: B | Empathy: A | Discipline: B
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ATTENDANCE
Present: 68 | Absent: 4 | Late: 3 | Total Days: 75 | 94.7%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Teacher Comment:
Amara has shown remarkable growth this semester...
                    _____________________    _____________________
                    Ms. J. Kamau           Principal
                    Class Teacher
[QR code bottom right: verify.educore.app/ABC123DEF456XYZ]
```

## Animation Requirements
- All screens: fade in on mount (opacity 0→1, 200ms)
- Attendance register rows: staggered slide-in on load (each row 30ms apart)
- FAB: scale bounce on first render (scale 0.8→1, 300ms spring)
- Success screen checkmark: scale 0→1 with spring (damping: 8, stiffness: 200)
- Mark All animation: status chips animate with scale flash (0.9→1, 100ms) across all rows

## Demo Data (hooks/useDemoData.ts)
Return static data — no API calls. Everything hardcoded for demo stability.
Include: 28 students with realistic Zambian names, marks data, attendance records, 3 day book entries.

## Critical Rules
- Zero loading states — all data from useDemoData (static). Screens are instant.
- Every tap must feel responsive — add 100ms active opacity animation to all tappable rows
- Attendance BottomSheet must use `react-native-gesture-handler` — feel native, not sluggish
- StatusChip colors must match spec exactly (present=green, absent=red, late=amber, ap=blue, sick=purple)
- Submit button: disabled state must visually communicate disabled (not just opacity)
- Haptics: test on real device — must fire on Mark All, Submit, Status change

## DO NOT
- Do not make any Supabase API calls in demo screens — static data only
- Do not add loading skeletons (data is instant from static hook)
- Do not skip animations — they are the "wow" factor for the board demo
- Do not use placeholder text like "Lorem ipsum" — use realistic school names, subjects, student names

---

# SESSION S06: Student Management — CRUD, Search, Unified Profile

## Project Context
EduCore SMS — React Native (Expo), Supabase. Design system in `components/ui/`.
Auth + navigation shell complete. DB schema complete (S01/S02).
Students: ~800, Grades Nursery–A Level. Roles with student access: Admin, HRT, ST, Finance, Parent.
Emergency contact is a REQUIRED field at enrollment (safeguarding).

## Goal
Build student CRUD, global search (debounced <300ms), bulk CSV import, and the unified tabbed student profile screen.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
app/(app)/student/[id]/_layout.tsx         -- Tabbed profile layout
app/(app)/student/[id]/overview.tsx        -- Overview tab
app/(app)/student/[id]/marks.tsx           -- Marks tab
app/(app)/student/[id]/reports.tsx         -- Reports tab
app/(app)/student/[id]/attendance.tsx      -- Attendance tab
app/(app)/student/[id]/daybook.tsx         -- Day Book tab
app/(app)/student/[id]/fees.tsx            -- Fees tab
app/(app)/student/[id]/history.tsx         -- History tab
app/(app)/(admin)/students/index.tsx       -- Student list (admin)
app/(app)/(admin)/students/add.tsx         -- Add student form
app/(app)/(admin)/students/import.tsx      -- Bulk CSV import wizard
app/(app)/(admin)/students/[id]/edit.tsx   -- Edit student
components/modules/StudentSearch.tsx       -- Global search component
components/modules/StudentListRow.tsx      -- Reusable student list row
hooks/useStudents.ts                       -- React Query hooks
hooks/useSearch.ts                         -- Global search hook
stores/searchStore.ts
```

## Specification

### Student List (admin view)
- SearchBar at top (global, debounced 200ms)
- Filter chips below search: All | Active | Section tabs (EYD | CP | LS | IGCSE | A-Level)
- Student rows: Avatar + full_name + student_number + grade/stream + status badge
- FAB (+): opens Add Student form
- Each row tap → student profile [id]/overview
- Pull to refresh

### Global Search (all roles)
Search icon in top app bar → expands SearchBar overlay on any screen.
Query: `supabase.rpc('search_students', { query, school_id })` — searches full_name, student_number, stream name, grade name.
Results appear within 300ms (200ms debounce + fast RPC).
Each result row: Avatar + name + grade/stream + role-specific action button:
- Admin: "View Profile"
- HRT: "View Profile" | "Add Day Book"
- ST: "Open Marks"
- Finance: "View Fees"
- Parent: cannot search (hidden)

Create Postgres function `search_students`:
```sql
-- Full-text search on students table
-- Returns: id, full_name, student_number, grade_name, stream_name, photo_url
-- Limit: 20 results
-- Ordered by: name similarity score DESC
```

### Add Student Form (3-step wizard, max 3 taps to start)
**Step 1: Personal Info**
- Full name (required), Date of birth (date picker), Gender (segmented control), Nationality, First Language
- Enrollment date (default: today, date picker)

**Step 2: Academic Placement**
- Section (segmented): EYD | CP | LS | IGCSE | A-Level
- Grade (filtered dropdown based on section)
- Stream (filtered dropdown based on grade)
- IGCSE only: Subject selection multi-select (5-6 subjects)
- Parent/Guardian: search existing parent or "Add new parent" inline

**Step 3: Emergency Contact** (required — cannot skip)
- Emergency Contact Name (required)
- Relationship (picker: Mother/Father/Guardian/Grandparent/Sibling/Other)
- Primary Phone (required, must differ from parent phone)
- Secondary Phone (optional)
- Medical Alert (optional text)

Progress indicator: 1 → 2 → 3 dots at top.
"Save & Add Another" | "Save & View Profile" buttons on final step.

### Edit Student
Same form, pre-filled. Photo upload: tap Avatar → image picker → upload to Supabase Storage.
Status change: Active/Inactive/Graduated/Transferred (Admin only, confirmation required).

### Unified Student Profile Tabs

**Tab: Overview**
- Large avatar (tap to view full photo)
- Name (h1), student_number, grade/stream badge, status chip
- Info rows: DOB, Enrollment date, Gender, Nationality, Language
- Medical Notes (Admin + HRT only, collapsed behind "Medical" label)
- Emergency Contact section (Admin + HRT only)
- Parent contacts (name, relationship, phone, email)
- Edit button (Admin only, top right)

**Tab: Marks**
- Semester picker (top): active semester selected by default
- Subject rows: FA1 | FA2 | Summative | Total | Grade
- For IGCSE+: Summative | Grade only
- If marks window open: show banner "Marks window closes [date]"
- Admin/HRT sees all subjects. ST sees only their assigned subjects.
- N/A marks shown in italic grey

**Tab: Reports**
- List of report cards, newest first
- Each row: semester label + academic year + status badge + "View" button
- Tap → in-app PDF viewer (or native report view from S05)
- Empty state: "No reports yet for this student."

**Tab: Attendance**
- Semester picker
- Summary stats: Present | Absent | Late | AP | Sick | Total | Percentage
- Calendar grid view: color-coded dots per day (present=green, absent=red, etc.)
- Monthly navigation arrows
- Below: list of absences with date + status + note (if any)

**Tab: Day Book**
- Filter chips: All | Behaviour | Academic | Achievement | Health | Other
- Entry rows: date + category badge + description preview + "sent to parent" indicator
- Tap → full entry detail (description, created by, sent status)
- FAB (+): Create new entry for this student (any teacher)
- Empty state: "No entries for this student yet."

**Tab: Fees** (Admin + Finance only)
- Current semester: status badge + balance if unpaid + date cleared if paid
- Payment history: list of all semesters + status + cleared date
- PaymentTransaction log: date | amount | recorded by | note
- "Mark as Paid" button (Finance only)

**Tab: History** (Admin + Coordinator + Principal)
- Timeline: each academic year as a card
- Card: academic year | grade | stream | overall average | report count
- Read-only. No edit.

### Bulk CSV Import Wizard
Step 1: Upload CSV/Excel file (pick from device)
Step 2: Column mapping — map spreadsheet columns to system fields
  - Auto-map by column name (case-insensitive)
  - Manual dropdowns for unmapped columns
Step 3: Validation preview:
  - "Ready to import: N rows" (green)
  - "Skipped: N rows with errors" (amber) + list of errors with row numbers
  - "Import valid rows only" | "Cancel" buttons
Step 4: Import + results: success count + downloadable error report (CSV of skipped rows)

### React Query Hooks (hooks/useStudents.ts)
```typescript
useStudents({ section?, grade?, stream?, status?, search? })  // paginated list
useStudent(id: string)                                         // single student
useStudentMarks(id: string, semesterId: string)
useStudentAttendance(id: string, semesterId: string)
useStudentReports(id: string)
useStudentDayBook(id: string)
useStudentFees(id: string)
useStudentHistory(id: string)
useCreateStudent()         -- mutation
useUpdateStudent()         -- mutation
useImportStudents()        -- mutation (bulk)
```

## Critical Rules
- Emergency contact: CANNOT save student without it. Form validation blocks Step 3 submit if empty.
- Photo upload: Supabase Storage bucket `student-photos/{school_id}/{student_id}.jpg`
- Tab state persists in session: last viewed tab stays active when returning to same student
- Search results < 300ms: requires Postgres full-text index on `students(full_name, student_number)`
- Parent-visible data: parents can only see their own child's profile (RLS enforces this)
- Medical notes + emergency contacts: Admin + HRT only. Never visible to Finance, ST, or Parent.
- IGCSE subject selection: locked when marks window opens. Show lock icon + "Locked — contact Admin" if locked.
- Student profile active tab: persist in Zustand across navigation (not URL params)

## DO NOT
- Do not hard-delete students — status = 'inactive'/'transferred'/'graduated' only
- Do not show medical notes or emergency contacts to Finance, ST, or parent roles
- Do not allow parents to search other students
- Do not paginate with "Load More" button — use infinite scroll (React Query infinite query)

---

# SESSION S07: Attendance Module

## Project Context
EduCore SMS — React Native (Expo), Supabase. Design system + auth + student module complete.
HRTs: 2 per stream (co-equal). First HRT to submit locks the register. Second can propose corrections.
Attendance statuses: present (P), absent (A), late (L), ap (AP), sick (S).
Absent = immediate parent push notification. AP does NOT trigger notification.
Admin can edit any register at any time (with mandatory note).

## Goal
Build the full attendance module: daily register, FAB bulk actions, submission, two-HRT conflict, correction flow, absence notifications, attendance threshold alerts, admin override, summary views.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
app/(app)/(hrt)/attendance/index.tsx       -- Register screen
app/(app)/(hrt)/attendance/history.tsx     -- Past registers (HRT view)
app/(app)/(admin)/attendance/index.tsx     -- Admin attendance overview
app/(app)/(admin)/attendance/correct.tsx   -- Admin correction screen
components/modules/AttendanceRegister.tsx  -- Register list component
components/modules/AttendanceStatusSheet.tsx -- Status picker bottom sheet
components/modules/AttendanceSummaryCard.tsx
hooks/useAttendance.ts
lib/notifications.ts                       -- Push notification helpers
supabase/functions/send-absence-notification/index.ts  -- Edge Function
```

## Specification

### Register Screen (HRT view)
**Header**: Stream name + date (today) + student count
**State banner** (if second HRT viewing submitted register):
  - "Register submitted by [Name] at [time]. You may propose a correction."

**Student list**: sorted alphabetically
Each row:
- Avatar (initials or photo) + full name
- Status chip (right): grey if unmarked, colored if set
- Tap row → StatusSheet BottomSheet

**StatusSheet BottomSheet** (U1 spec):
Five large rows (min 56px height each):
- ✓ Present (green) — if AP selected: text field for reason (required, max 200 chars)
- ⏰ Late (amber)
- ✗ Absent (red)
- 🔵 Absent with Permission (blue) — requires reason note field inline in sheet
- 💜 Sick / Medical (purple)
Current status shown with checkmark.
Closes immediately on selection. Haptic: light impact.
Row updates instantly (optimistic UI).

**FAB** (bottom right): "Mark All..."
Tap → BottomSheet: "Set all students to:" + same 5 options
On select: all rows animate to status (scale flash) + heavy haptic + "All 28 students marked as Present" toast.

**Exam period banner**: if today is within a CalendarEvent of type 'exam_period':
- Yellow banner: "Exam Period — [Event name]"
- Pre-mark all students as Present on register open (can still change individually)

**Submit bar** (sticky bottom):
- "Submit Register" button (brand primary, full width)
- Count badge: "28 / 28 marked"
- Disabled if any student unmarked
- On tap: confirm dialog "Submit register for CP2A? This locks today's attendance."
- On confirm: POST to Supabase, optimistic success, haptic (heavy), navigate to success screen
- Register locked for HRT after submission (read-only)

**HRT 2 correction flow** (if this HRT is co_hrt):
- Register is read-only (greyed out)
- "Propose a Change" FAB instead of Submit
- Tap → select student → select new status → submit proposal
- First HRT gets push notification: "[Name] proposed a change to today's register. Review and confirm."
- Proposal shown as pending amendment row (amber highlight) until approved/dismissed

### Absence Notification (Edge Function)
Triggered immediately when student marked Absent:
```
Title: "[Child name] marked absent"
Body: "Marked at [time] by [First name + Last initial]. If unexpected, contact the school."
Deep link: educore://attendance/{stream_id}/{date}
```
Uses Expo Push API. Logs to `notification_logs` with is_safeguarding = true.
If push fails: in-app notification still created. Admin delivery log shows red indicator for failed push.

### Attendance Correction (after submission)
**HRT correction** (within 24h of submission):
- Tap submitted row → "Correct Status" option
- Opens StatusSheet — select new status, optional note
- Saves with corrected_by + corrected_at + correction_note

**Admin correction** (any time):
- Admin attendance overview shows all streams + dates
- Select stream + date → see full register
- Tap any student → can change status
- Mandatory note field: "Reason for correction" (required, blocks save if empty)
- Saves to audit_logs: { event_type: 'attendance_corrected', old_status, new_status, note, actor }

### Attendance Threshold Alert
DB trigger: after each attendance_records INSERT/UPDATE:
- Call `get_attendance_percentage(student_id, semester_id)`
- If < threshold (default 85%): check if alert already fired this semester
- If not fired: insert notification_log for HRT + Admin
  - "Amara Banda in CP2A has dropped below 85% attendance (82.3% present)"
  - One-time per crossing. Resets if student returns above threshold.
- Student profile shows red badge on Attendance tab when below threshold

### Attendance Summary (Student Profile Attendance Tab)
Already specced in S06 — this session implements the data hooks:
```typescript
useAttendanceForStudent(studentId, semesterId) → {
  present: number, absent: number, late: number, ap: number, sick: number,
  total_school_days: number, percentage: number,
  daily_records: { date, status, note }[]
}
// total_school_days calculated from calendar, excluding holidays
// Uses StudentYearRecord.enrollment_date as start (not semester start)
```

### Admin Attendance Overview
- Stream cards: each showing today's submission status + % present
- Filter: by section/grade
- Tap stream → view that stream's register (read-only or editable for admin)
- "Mark attendance on behalf of absent HRT" — admin can open and submit any register

## Supabase RLS for Attendance
- HRT: can SELECT/INSERT/UPDATE records for their assigned streams + active semester only
- Admin: full access to all attendance records in school
- Parent: SELECT only for their child's records

## Critical Rules
- AP status: requires reason_text in excused_absence_requests table — enforce at app level before saving
- Absent notification: fires on individual status change, NOT on register submission
- Two-HRT: first to submit wins + locks. Second sees read-only + propose amendment UI.
- Mark All with Exam Period: default pre-mark to Present. FAB still available.
- 24h correction window for HRT: store submitted_at on register. Check server-side.
- Admin corrections: always write to audit_log — non-negotiable.
- Attendance percentage formula: ((Present + Late + AP) / TotalSchoolDays) × 100 — NOT dividing only AP by total.

## DO NOT
- Do not trigger parent notification for AP, Late, or Sick — only Absent (A)
- Do not allow HRT to edit after 24h — show locked state, redirect to Admin
- Do not use a spinner for status changes — instant optimistic update
- Do not let second HRT overwrite the submitted register — proposal flow only

---

# SESSION S08: Marks Entry + CREED + Bulk Import

## Project Context
EduCore SMS — React Native (Expo), Supabase. Auth + students + attendance complete.
Assessment structure: EYD–LS3: FA1(20%) + FA2(20%) + Summative(60%). IGCSE+: Summative(100%).
Marks window: Admin-controlled open/close dates. Outside window = read-only.
Subject Teachers enter marks for their assigned Subject+Stream combinations.
Live class average recalculates after each mark entry. Deviation > 30pts → soft warning.

## Goal
Build marks entry, CREED entry, bulk marks import, progress tracking, mark correction flow, and all related UX (keyboard nav, micro-interactions, class average).

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
app/(app)/(st)/marks/index.tsx           -- ST marks overview (my subjects)
app/(app)/(st)/marks/[assignmentId].tsx  -- Marks entry for subject+stream
app/(app)/(hrt)/creed/[streamId].tsx     -- CREED entry for stream
app/(app)/(admin)/marks/index.tsx        -- Admin marks completion matrix
app/(app)/(admin)/marks/unlock.tsx       -- Mark unlock + correction flow
app/(app)/(st)/marks/import.tsx          -- Bulk import wizard
components/modules/MarksEntryList.tsx    -- Scrollable student marks grid
components/modules/ClassAverageBanner.tsx
components/modules/MarkInputField.tsx    -- Single mark input with validation
components/modules/MarksWindowBanner.tsx -- "Window closes [date]" banner
components/modules/CreedEntryGrid.tsx
hooks/useMarks.ts
hooks/useCreed.ts
supabase/functions/notify-marks-complete/index.ts  -- Edge Function
```

## Specification

### ST Marks Overview (index.tsx)
Header: "My Marks" + semester label
MarksWindowBanner: "Marks window closes [date]" (amber) or "Marks window closed" (red, read-only)
List of SubjectTeacherAssignments:
Each card:
- Subject name + Stream label
- Progress: "22 / 28 marks entered" + ProgressBar
- "Complete" green badge if 100%
- Incomplete shows count in red
- Tap → marks entry screen for that assignment
Empty state: "You have no subject assignments for this semester."

### Marks Entry Screen ([assignmentId].tsx)
**Header**: "[Subject] — [Stream]" + semester
**ClassAverageBanner** (sticky top): "Class average: 72.4% — 22 of 28 marks entered"
- Updates live after each mark change
- Shown even when 0 marks entered: "No marks entered yet"

**MarksWindowBanner**: if closed: "Marks window closed. Contact Admin to reopen." (all fields read-only)

**Student list** (scrollable):
For EYD–LS3:
```
[Avatar] [Name]    [FA1 __] [FA2 __] [Sum __]  [Total] [Grade]
                    0-100    0-100    0-100     auto    auto
```
For IGCSE–A Level:
```
[Avatar] [Name]    [Summative __]  [Grade]
                    0-100           auto
```

**MarkInputField behavior**:
- Numeric keyboard (returnKeyType='next' except last field = 'done')
- Input validation on blur: 0–100 only. Typing "105" → auto-corrects to "100" with red flash (F7).
- Grade auto-displays immediately after blur (e.g. type 78 → "B")
- Save: optimistic (instant UI update). Micro-interaction: green checkmark fades in, out after 2s.
- Failed save: amber retry indicator persists. Tap to retry.
- Haptic: light impact on each mark save.
- Keyboard Next: focus moves to next student's FA1 → FA2 → Summative → next student

**N/A toggle**: next to each student name: "Excused" toggle (long press to reveal or small icon button)
- On toggle: mark field disabled, shows "N/A" text, opens text input for reason (required, 200 chars max)
- Excluded from class average calculation
- Only Admin can remove N/A designation

**Deviation warning** (inline, below field):
- If |entered_mark - class_average| > 30: show soft warning in amber text below field:
  "This mark is significantly [above/below] the class average (72%). Please confirm."
- Teacher can dismiss + save. Warning logged to mark_notes table.

**Keyboard Done action**: saves all unsaved marks, dismisses keyboard.

**Bottom bar**: "Save All" button (if any unsaved marks exist) — appears on scroll-up gesture.

### CREED Entry Screen
HRT view. Stream-scoped. One entry per student per semester.
Grid layout (scrollable):
```
[Student]    [Creativity] [Respect] [Excellence] [Empathy] [Discipline]
Amara Banda   [A*▼]        [A▼]      [B▼]         [A▼]      [B▼]
```
Each cell: tap → mini BottomSheet with grade options:
- Cambridge scale: A*, A, B, C, D, E, F, G, U
- Developmental scale (if eyd_creed_scale='developmental'): Emerging | Developing | Secure | Exceeding

"Save All CREED" button bottom. Locked after report approval.
Empty state: "CREED grades not yet entered for this stream."

### Admin Marks Completion Matrix
Table view: rows = subjects, columns = streams.
Each cell: "22/28" + color (green if complete, red if incomplete, grey if not started).
Filter: by section. Sortable by completion %.
Tap cell → view that subject+stream marks entry (admin read-only view).
"Marks Window" card at top: shows open/close dates + "Close Window" / "Reopen Window" toggle (Admin only).

### Mark Correction Flow (Admin)
Trigger: Admin navigates to a specific mark (from student profile Marks tab or marks matrix).
Steps:
1. Admin sees locked mark row (grayed, lock icon)
2. "Unlock Mark" button (Admin only)
3. Confirm sheet: "Unlock this mark? The report for [Student] will revert to Draft and require re-approval by the Homeroom Teacher."
4. On confirm: mark.is_locked = false; mark.correction_unlocked_by = admin_id; report.status = 'pending_approval'
5. Push to HRT: "Marks for [Student] have been unlocked. Please re-approve when ready."
6. Subject teacher can now edit the mark
7. After edit: mark re-locks automatically. HRT must re-approve.
8. Every unlock event → audit_logs.

### Bulk Import Wizard
Same 4-step wizard pattern as S06 student import:
Step 1: Upload CSV/Excel (columns: student_name, student_id, fa1, fa2, summative)
Step 2: Column mapping
Step 3: Validation preview — catches: out-of-range (>100), unknown student IDs, duplicate entries
  "X marks will be added, Y will be updated."
Step 4: Import (subject to marks window check — fails silently with clear message if window closed)

### Marks Completion Notification (Edge Function)
Trigger: when all marks are entered for a stream's active semester.
Notify the stream's HRT: "All marks are complete for [Stream]. Please review and approve reports."
Deep link: `educore://reports/approve/{stream_id}`
Log to notification_logs.

### React Query Hooks (hooks/useMarks.ts)
```typescript
useMarksForAssignment(assignmentId)        // all student marks for this subject+stream
useClassAverage(subjectId, streamId, semesterId, assessmentType)
useMarksProgress(semesterId)               // admin: all subjects + completion %
useMarkCorrection()                        // mutation: admin unlock
useCreedForStream(streamId, semesterId)
useUpdateMark()                            // mutation: save/update single mark
useBulkImportMarks()                       // mutation
```

## Critical Rules
- Marks window: enforce at API level (Supabase RPC checks `is_marks_window_open()` before INSERT/UPDATE) AND at UI level (show read-only state)
- Class average: exclude N/A marks and NULL (unentered) marks from calculation
- Grade auto-calculation: use `grading_scales` table — never hardcode grade boundaries in app
- Total calculation (EYD–LS3): apply StudentYearRecord weight overrides if mid-semester joiner
- Deviation warning is non-blocking — teacher can always save
- All mark saves → write to mark_audit_logs (old_value, new_value, changed_by, timestamp)
- CREED: locked = true after HRT approves report. Show padlock icon.
- Bulk import: cannot import if marks window closed. Clear error: "The marks window is currently closed. Contact Admin to reopen."

## DO NOT
- Do not allow mark entry outside the marks window (even with admin override at app level — admin uses DB unlock)
- Do not calculate grade in JavaScript — always query grading_scales table
- Do not use ActivityIndicator — micro-interaction checkmark only
- Do not round marks during entry — raw decimal stored, rounding only at display/report

---
