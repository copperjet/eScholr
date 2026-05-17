# eScholr — Full Codebase Audit & Implementation Plan

> Audited: 26 April 2026  
> Scope: All 10 user roles, all screens, DB schema, edge functions, hooks, types  
> Baseline: Expo Router app + Supabase backend, 23 migrations, 13 edge functions

---

## Part 1: Role-by-Role Audit

### 1. Platform Admin (`super_admin`)
**Route group:** `(platform)` — 4 screens  
**Routing:** `index.tsx` → `/(app)/(platform)/home`

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` — Schools overview + stats | ✅ Working | Lists all schools, student/staff counts, subscription status |
| `school-detail.tsx` — View/edit school | ✅ Working | Change subscription plan/status |
| `onboard.tsx` — Onboard new school | ✅ Working | Full school creation wizard |
| `more.tsx` — Profile & sign out | ✅ Working | Minimal — only profile alert + sign out |

**Gaps:**
- **No billing/revenue dashboard** — no aggregate revenue, no invoice generation
- **No system-wide analytics** — no cross-school comparison charts
- **No school data export/backup trigger** — only Supabase internal backups
- **No school deletion/archival** — can suspend but not archive
- **School Super Admin concept missing** — requirement #2 "School super admin" is NOT a separate role. Currently `super_admin` = platform level only. There's no school-scoped super admin that can backup their school data to Google Drive

---

### 2. School Super Admin
**Route group:** ❌ **DOES NOT EXIST AS A SEPARATE ROLE**

The `staff_roles` table constraint allows: `'super_admin','admin','front_desk','finance','principal','coordinator','hod','hrt','st'`

- `super_admin` in the DB is the **platform** admin, not a school-scoped super admin
- The requirements call for a "School Super Admin" who can backup data to Google Drive
- Currently there is no mechanism for a school-level admin to have elevated privileges beyond `admin`

**Resolution needed:** Either:
- (a) Add a `school_super_admin` role, OR
- (b) Give the `admin` role backup/export capabilities with a feature flag

---

### 3. Admin (`admin` / `principal` / `coordinator` / `hod`)
**Route group:** `(admin)` — 24 screens  
**Routing:** All 4 roles → `/(app)/(admin)/home`  
**Role gating:** `ADMIN_ROLES = ['admin','principal','coordinator','hod']` + per-feature `ROLE_ACCESS` map

| Screen | Status | Role Access |
|--------|--------|-------------|
| `home.tsx` — Dashboard (students, staff, attendance, pending reports) | ✅ | All |
| `students.tsx` — Student list | ✅ | admin, super_admin |
| `student-add.tsx` — Add student | ✅ | admin, super_admin |
| `student-edit.tsx` — Edit student | ✅ | admin, super_admin |
| `student-import.tsx` — Bulk CSV import | ✅ | admin, super_admin |
| `staff.tsx` — Staff management | ✅ | admin, super_admin |
| `parents.tsx` — Parent management + linking | ✅ | admin, super_admin |
| `assignments.tsx` — HRT/ST assignments | ✅ | admin, super_admin |
| `attendance-overview.tsx` — Today's status | ✅ | admin, principal, coordinator |
| `attendance-correct.tsx` — Corrections | ✅ | admin, principal, coordinator |
| `marks-matrix.tsx` — Completion heatmap | ✅ | All admin roles |
| `marks-unlock.tsx` — Unlock marks for re-entry | ✅ | All admin roles |
| `marks-windows.tsx` — Open/close entry windows | ✅ | admin, hod |
| `reports.tsx` — Approve/release reports | ✅ | All admin roles |
| `daybook.tsx` — School-wide view | ✅ | All admin roles |
| `announcements.tsx` — Compose & send | ✅ | admin, principal, coordinator |
| `calendar.tsx` — Academic calendar events | ✅ | admin, principal, coordinator |
| `timetable-upload.tsx` — Upload PDF/image | ✅ | admin, super_admin |
| `notification-log.tsx` — All notifications | ✅ | admin, principal |
| `audit-log.tsx` — Action history | ✅ | admin |
| `semesters.tsx` — Manage semesters | ✅ | admin |
| `promotion-wizard.tsx` — Year-end promote | ✅ | admin |
| `school-onboarding.tsx` — Onboard school | ✅ | super_admin only |
| `more.tsx` — Full menu + sign out | ✅ | All (filtered) |

**Gaps:**
- **No fee structure editor** — cannot create fee categories, amounts, or invoice templates
- **No subject/stream management screen** — subjects are created during onboarding but can't be edited after
- **`marks-windows`, `audit-log`, `calendar` are hidden (`href: null`)** — only accessible via deep-link from More menu, which is correct
- **Principal/Coordinator/HOD see identical dashboard** — no role-specific oversight views
  - Principal: should have an approval queue, school overview KPIs
  - Coordinator: should see academic scheduling, conflict resolution
  - HOD: should see department-level marks analytics
- **No school settings editor** — `school_configs` table exists with 16+ config keys but no UI to edit them
- **No school profile editor** — no way to update school name, logo, colors after onboarding

---

### 4. Finance (`finance`)
**Route group:** `(finance)` — 3 screens  
**Routing:** `/(app)/(finance)/home`  
**Layout:** Stack navigator (not tabs)

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` — Finance ledger + bulk clear | ✅ | Lists all students, paid/unpaid, balance |
| `student-finance.tsx` — Individual student detail | ✅ | Record full/partial payments, transaction history |
| `finance-reports.tsx` — Reports pending finance clearance | ✅ | Clear `finance_pending` → `approved` |

**Gaps:**
- **No fee structure setup** — cannot create fee categories (tuition, transport, uniform, etc.)
- **No invoice generation** — no way to create invoices per student per semester
- **No receipt export/print** — payments recorded but no receipt PDF
- **No financial reporting** — no term-end collection reports, aging reports, or revenue breakdown
- **No Sage integration** — requirement: bidirectional sync with Sage Accounting
- **No fee schedule management** — no way to set different fee amounts per grade/section
- **DB schema limitation** — `finance_records` is a flat status+balance per student per semester. No `fee_categories`, `fee_items`, or `invoices` tables
- **No More/Settings screen** — finance layout is a bare Stack, no profile/logout (must use switch-role)

---

### 5. HR (`hr`)
**Route group:** ❌ **COMPLETELY MISSING**

- No `(hr)` folder exists
- No HR-related tables (leave_requests, payroll, contracts, staff_attendance)
- No HR hooks
- The `staff_roles` constraint does NOT include 'hr' as a valid role
- The `index.tsx` switch statement has no `case 'hr'`

**Required for first school:**
- Leave management (submit/approve leave requests)
- Staff attendance tracking
- Staff payroll data (read-only mirror from Sage)
- Staff contracts/documents

---

### 6. Front Desk (`front_desk`)
**Route group:** `(frontdesk)` — 4 screens  
**Routing:** `/(app)/(frontdesk)/home`

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` — Dashboard (today's inquiries, all-time stats) | ✅ | Good summary UI |
| `inquiries.tsx` — CRUD inquiry list | ✅ | Create, update status, search |
| `inquiry-detail.tsx` — Individual inquiry | ✅ | Full edit, status transitions, conversion to enrollment |
| `more.tsx` — Profile + links | ✅ | Announcements, timetable, notifications, sign out |

**Gaps:**
- **No visitor sign-in log** — `front_desk_enabled` config exists but no visitor tracking screen
- **No public-facing application form** — inquiries are staff-entered only; requirement calls for online application portal
- **No applicant portal** — parents cannot track application status
- **No day book access** — front desk can't see or add day book entries

---

### 7. Principal / Coordinator / HOD
**Route group:** Shared with `(admin)` — no separate routes

All three roles use the exact same `(admin)` layout with feature gating via `ROLE_ACCESS`:
- **Principal** → sees: attendance, marks matrix, reports, daybook, announcements, calendar, notification log
- **Coordinator** → sees: attendance, marks matrix, reports, daybook, announcements, calendar
- **HOD** → sees: marks matrix, marks windows, reports, daybook

**Gaps:**
- **No role-specific dashboards** — all share the admin dashboard
- **No approval workflows specific to role** — principal should be the final approver, coordinator handles scheduling
- **No departmental analytics for HOD** — HOD should see their department's marks/attendance only
- **No class observation tools** — for principal/coordinator oversight

---

### 8. Homeroom Teacher (`hrt`)
**Route group:** `(hrt)` — 10 screens  
**Routing:** `/(app)/(hrt)/home`

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` — Dashboard (class stats, attendance status, recent daybook) | ✅ | Rich dashboard |
| `attendance.tsx` — Daily register (43KB — full featured) | ✅ | Mark present/absent/late/AP, lock register |
| `attendance-history.tsx` — Past registers | ✅ | Calendar view + stats |
| `marks.tsx` — View/enter marks for class | ✅ | FA1/FA2/Summative entry |
| `reports-approve.tsx` — HRT comment + submit for approval | ✅ | Per-student comments |
| `reports.tsx` — View class reports | ✅ | Status tracking |
| `daybook.tsx` — CRUD day book entries | ✅ | Categories, send-to-parent toggle |
| `creed.tsx` — CREED character ratings | ✅ | Creativity/Respect/Excellence/Empathy/Discipline |
| `students.tsx` — Class list | ✅ | Links to student profile |
| `more.tsx` — Profile + all features | ✅ | Full menu |

**Gaps:**
- **No homework assignment** — requirement: online homework with teacher feedback
- **No lesson plan management** — requirement: resource repository
- **igaprep.com link is a basic Linking.openURL** — no SSO or deep integration

**Assessment:** Mostly solid. This is the most complete role.

---

### 9. Subject Teacher (`st`)
**Route group:** `(st)` — 7 screens  
**Routing:** `/(app)/(st)/home`

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` — Dashboard (completion progress per subject/stream) | ✅ | Progress bars |
| `marks.tsx` — Subject picker → enter marks | ✅ | FA1/FA2/Summative |
| `marks-entry.tsx` — Actual marks entry grid | ✅ | Per-student score entry |
| `marks-import.tsx` — CSV bulk import | ✅ | Template download + upload |
| `daybook.tsx` — Student notes | ✅ | CRUD |
| `students.tsx` — Student list | ⚠️ Minimal | 511 bytes — likely just a placeholder redirect |
| `more.tsx` — Profile + features | ✅ | Full menu |

**Gaps:**
- **`students.tsx` is a stub** (511 bytes) — needs proper student list for assigned streams
- **No homework module** — requirement: assign homework + feedback loop
- Same igaprep.com limitation as HRT

---

### 10. Student
**Route group:** ❌ **COMPLETELY MISSING**

- No `(student)` folder
- No `student` role in `staff_roles` constraint or `UserRole` type
- The `index.tsx` switch has no `case 'student'`
- Students are data entities (in `students` table) but have no login capability
- There IS a shared `student/[id].tsx` profile screen, but it's a staff-facing view

**Required:**
- Students should be able to log in (own auth account, linked to `students` table)
- View their own marks, attendance, reports, daybook
- View timetable, announcements
- Submit homework (future)
- View fee status (if school allows)

---

### 11. Parent (`parent`)
**Route group:** `(parent)` — 3 screens  
**Routing:** `/(app)/(parent)/home`

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` — Child dashboard (report card, attendance, daybook, quick links) | ✅ | Multi-child selector |
| `reports.tsx` — Released report cards | ✅ | PDF viewer integration |
| `inbox.tsx` — Day Book notes + notifications | ✅ | Two-tab inbox |

**Gaps:**
- **No fees view** — `parent_finance_visible` config exists in DB but no fees tab/screen
- **No online payment** — cannot pay fees through app
- **No absence/leave note submission** — parent can read daybook but cannot reply
- **No parent-teacher messaging** — daybook is one-way (teacher → parent)
- **No timetable access** — quick links go to shared timetable but it may not filter for child's class
- **No child's marks detail view** — home shows report overview but no per-subject marks breakdown

---

## Part 2: Database Schema Gaps

### Existing Tables (23 migrations)
```
schools, school_configs, app_versions,
school_sections, grades, streams, subjects,
semesters, academic_years,
grading_scales, grade_boundaries, grade_descriptors,
staff, staff_roles, parents, push_tokens, biometric_sessions,
students, student_year_records, emergency_contacts, student_parent_links, subject_enrollments,
hrt_assignments, subject_teacher_assignments,
attendance_records, attendance_thresholds,
marks, marks_windows,
character_records,
reports,
day_book_entries,
finance_records, payment_transactions,
notification_logs,
audit_logs,
inquiries,
announcements, announcement_reads,
timetable_uploads
```

### Missing Tables Needed
| Table | Purpose | Priority |
|-------|---------|----------|
| `fee_categories` | Fee types (tuition, transport, etc.) | P0 — MVP |
| `fee_schedules` | Amount per category per grade per semester | P0 — MVP |
| `invoices` | Generated invoices per student | P0 — MVP |
| `leave_requests` | Staff leave submission/approval | P0 — MVP |
| `staff_attendance` | Daily staff check-in | P1 |
| `homework_assignments` | Teacher assigns homework | P2 |
| `homework_submissions` | Student submits work | P2 |
| `syllabus_codes` | CAIE syllabus mapping | P1 |
| `parent_messages` | Two-way parent-teacher messaging | P2 |
| `backup_destinations` | School backup config (Google Drive OAuth) | P1 |
| `visitor_log` | Front desk visitor tracking | P2 |
| `inventory_items` | School inventory tracking | P3 |
| `library_catalog` | Book management | P3 |

---

## Part 3: Edge Function Gaps

### Existing (13 functions)
```
create-platform-admin, create-school-admin, get-schools-overview,
generate-report, generate-report-pdf, invite-user,
notify-marks-complete, release-report, send-absence-notification,
send-push, update-school, verify-report
```

### Missing Functions Needed
| Function | Purpose | Priority |
|----------|---------|----------|
| `send-email` | Email notification channel (Resend/SendGrid) | P0 |
| `export-school-data` | Dump school data → JSON/CSV → Google Drive | P0 |
| `generate-invoice` | Create invoice PDF per student | P0 |
| `sage-sync` | Bidirectional Sage Accounting API sync | P1 |
| `generate-transcript` | Multi-year academic transcript PDF | P2 |

---

## Part 4: Gap Analysis vs School Requirements

### 2.1 Academic & Curriculum
| Requirement | Status | Action |
|-------------|--------|--------|
| CAIE syllabus codes | ❌ MISSING | P1: `syllabus_codes` table + tag subjects |
| Resource repository (schemes/lessons/past papers) | ❌ MISSING | Defer to learn.escholr.com integration |

### 2.2 Assessment & Grading
| Requirement | Status | Action |
|-------------|--------|--------|
| Online homework + teacher feedback | ❌ MISSING | P2: Homework module |
| Automated report generation | ✅ EXISTS | `generate-report` + `generate-report-pdf` edge functions |
| Academic transcripts | ❌ MISSING | P2: Multi-year aggregate report |
| Predicted grades | ❌ MISSING | P2: Regression on prior marks + teacher override |

### 2.3 Scheduling
| Requirement | Status | Action |
|-------------|--------|--------|
| Automated timetable | ⚠️ PARTIAL | CSV/image upload only; no auto-generation or conflict resolver |

### 3.1 Centralized Profiles
| Requirement | Status | Action |
|-------------|--------|--------|
| Student biodata + medical + guardian + history | ⚠️ PARTIAL | `students` has `medical_notes`, `nationality`, `first_language`; `emergency_contacts` has guardian info; performance derivable from marks. Missing: detailed medical fields (allergies, blood type, conditions) |

### 3.2 Attendance & Behavior
| Requirement | Status | Action |
|-------------|--------|--------|
| Digital attendance | ✅ | Full implementation |
| Behavior records | ✅ | daybook + CREED |
| Auto alerts (SMS/app) | ⚠️ PARTIAL | Push notifications work; **email missing**; SMS excluded per user |

### 3.3 Admissions
| Requirement | Status | Action |
|-------------|--------|--------|
| Online application + tracking | ⚠️ PARTIAL | Frontdesk inquiries are internal; no public form or applicant portal |

### 4.1 Finance
| Requirement | Status | Action |
|-------------|--------|--------|
| Sage integration | ❌ MISSING | P1: Sage Business Cloud API connector |
| Fee mgmt (billing/tracking/reporting) | ⚠️ PARTIAL | Basic paid/unpaid tracking. No fee structure, no invoices, no receipt export, no parent view |

### 4.2 HR & Inventory
| Requirement | Status | Action |
|-------------|--------|--------|
| Staff payroll | ❌ MISSING | Delegate to Sage; app shows read-only mirror |
| Leave management | ❌ MISSING | P0: `leave_requests` table + HR screens |
| Inventory tracking | ❌ MISSING | P3 |
| Library cataloging | ❌ MISSING | P3: Could integrate with learn.escholr.com |

### 5. Technical
| Requirement | Status | Action |
|-------------|--------|--------|
| Cloud-based | ✅ | Supabase |
| Mobile-first | ✅ | Expo/React Native |
| Email integration | ❌ MISSING | P0: `send-email` edge function |
| SMS | N/A | Excluded per user decision |
| Low-bandwidth optimization | ⚠️ PARTIAL | React Query caching + staleTime; no full offline-first |
| RBAC | ✅ | JWT claims hook + per-screen role checks |
| Encryption | ✅ | Supabase TLS + at-rest encryption |
| Auto backups to Google Drive | ❌ MISSING | P0: `export-school-data` edge function + OAuth |

---

## Part 5: Full Implementation Plan

### Phase 0 — MVP Blockers (Weeks 1-3)
> **Goal:** Minimum viable product for first school deployment

#### 0.1 Student Role (P0 — Critical)
The school NEEDS students to access the system.

**Database:**
- Add `'student'` to `UserRole` type
- Add `auth_user_id` column to `students` table (nullable, references auth.users)
- Add RLS policies for student self-access

**App:**
- Create `app/(app)/(student)/` route group with layout
  - `home.tsx` — Personal dashboard (my attendance, marks, upcoming)
  - `marks.tsx` — Per-subject marks view
  - `attendance.tsx` — My attendance record
  - `reports.tsx` — Released report cards
  - `timetable.tsx` — My class timetable
  - `more.tsx` — Profile, announcements, notifications, sign out
- Update `index.tsx` switch with `case 'student'`
- Edge function: `invite-student` or extend `invite-user` to handle student accounts

**Estimated effort:** 3-4 days

#### 0.2 HR Role — Minimum (P0)
**Database (migration 024):**
```sql
CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  staff_id UUID NOT NULL REFERENCES staff(id),
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual','sick','maternity','paternity','compassionate','unpaid','other')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  approved_by UUID REFERENCES staff(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
- Add `'hr'` to `staff_roles` constraint
- Add `'hr'` to `UserRole` type

**App:**
- Create `app/(app)/(hr)/` route group
  - `home.tsx` — HR dashboard (staff count, pending leave, leave calendar)
  - `leave-requests.tsx` — View/approve/reject
  - `staff-directory.tsx` — Read-only staff list with contact info
  - `more.tsx` — Profile, settings, sign out
- Update `index.tsx` switch: `case 'hr': return <Redirect href="/(app)/(hr)/home" />`

**Estimated effort:** 2-3 days

#### 0.3 Fee Structure + Parent Fees View (P0)
**Database (migration 025):**
```sql
CREATE TABLE fee_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL, -- 'Tuition', 'Transport', 'Uniform', etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, name)
);

CREATE TABLE fee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  fee_category_id UUID NOT NULL REFERENCES fee_categories(id),
  grade_id UUID REFERENCES grades(id), -- null = all grades
  semester_id UUID NOT NULL REFERENCES semesters(id),
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE,
  UNIQUE(fee_category_id, grade_id, semester_id)
);
```

**App:**
- Admin: `fee-structure.tsx` — CRUD fee categories + amounts per grade
- Admin: `invoices.tsx` — Generate bulk invoices per semester
- Finance: Add fee structure read access
- Parent: Add `fees.tsx` tab — Outstanding balance, payment history, invoice download
- Update parent layout to add Fees tab

**Estimated effort:** 3-4 days

#### 0.4 Email Notification Channel (P0)
**Edge function:** `send-email/index.ts`
- Use Resend API (Deno-friendly, cheap)
- Add `RESEND_API_KEY` to Supabase secrets
- Refactor `send-push` → `send-notification` dispatcher (push + email)
- Add `email_templates` table or inline templates per `trigger_event`
- Key triggers: absence alert, report released, marks complete, announcement, leave approval

**Estimated effort:** 1-2 days

#### 0.5 School Data Backup to Google Drive (P0)
**Database (migration 026):**
```sql
CREATE TABLE backup_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),
  oauth_token_encrypted TEXT,
  folder_id TEXT,
  last_backup_at TIMESTAMPTZ,
  schedule TEXT DEFAULT 'weekly' CHECK (schedule IN ('daily','weekly','monthly','manual')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, provider)
);
```

**Edge function:** `export-school-data/index.ts`
- Dumps school's data (students, staff, marks, attendance, finance) to JSON/CSV
- Uploads to Google Drive via OAuth2
- Triggered manually from admin UI or via cron schedule

**App:**
- Admin More menu: "Backup to Google Drive" button
- Settings screen: Configure Google Drive connection, schedule

**Estimated effort:** 2-3 days

#### 0.6 School Super Admin Designation (P0)
**Resolution:** Add backup/export capability to `admin` role with config flag, rather than creating a new role. The school's primary admin (first admin created) gets this capability.

- Add `school_configs` key: `backup_admin_staff_id` — stores the staff_id who can trigger backups
- Admin More menu shows "Backup" only for this staff member
- Simpler than adding a whole new role

**Estimated effort:** 0.5 days

---

### Phase 1 — Integrations (Weeks 4-6)

#### 1.1 Sage Accounting Connector
**Research:** Sage Business Cloud Accounting REST API (OAuth2)

**Edge function:** `sage-sync/index.ts`
- Per-school Sage credentials stored encrypted in `school_configs`
- **App → Sage:** Push invoice data, payment confirmations
- **Sage → App:** Pull payment confirmations, payroll status
- HR payroll lives in Sage; app displays read-only mirror

**App:**
- Admin/Finance settings: "Connect Sage" OAuth flow
- Finance: Sync status indicator, manual sync button
- HR: Read-only payroll data from Sage

**Database:**
```sql
CREATE TABLE sage_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) UNIQUE,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  company_id TEXT,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'disconnected'
);
```

**Estimated effort:** 5-7 days

#### 1.2 learn.escholr.com Integration
**Approach:** WebView in app with SSO handoff

- Rename igaprep.com links throughout app to learn.escholr.com
- Create shared JWT handoff: app generates a signed token → learn.escholr.com validates
- Resource picker: Link lessons/past papers to subjects/streams in eScholr
- In-app WebView component for seamless experience

**App changes:**
- Replace all `Linking.openURL('https://igaprep.com')` with WebView navigation
- New shared component: `ResourceWebView.tsx`
- Add "Resources" tab to HRT/ST layouts

**Estimated effort:** 3-4 days

#### 1.3 CAIE Syllabus Support
**Database (migration 027):**
```sql
CREATE TABLE syllabus_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE, -- e.g., '0580' for IGCSE Mathematics
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('igcse','as','a2','checkpoint')),
  subject_group TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Link subjects to syllabus codes
ALTER TABLE subjects ADD COLUMN syllabus_code_id UUID REFERENCES syllabus_codes(id);
```

- Seed table from CAIE catalog
- Admin: Tag subjects with syllabus codes during setup
- Reports: Show syllabus code on transcripts

**Estimated effort:** 2 days

#### 1.4 Public Admissions Form
- Separate web page (Next.js or simple HTML form hosted on Supabase/Netlify)
- Posts to `admissions_applications` table via anon Supabase client
- Frontdesk reviews and converts to enrollment
- Email confirmation to applicant

**Database:**
```sql
CREATE TABLE admissions_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  student_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT,
  parent_name TEXT NOT NULL,
  parent_email TEXT,
  parent_phone TEXT,
  grade_applying_for TEXT,
  previous_school TEXT,
  documents_url TEXT,
  status TEXT DEFAULT 'submitted' CHECK (status IN ('submitted','reviewing','accepted','rejected','enrolled')),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_by UUID REFERENCES staff(id),
  notes TEXT
);
```

**Estimated effort:** 3-4 days

---

### Phase 2 — Academic Depth (Weeks 7-10)

#### 2.1 Homework Module
**Database:**
```sql
CREATE TABLE homework_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  stream_id UUID NOT NULL REFERENCES streams(id),
  semester_id UUID NOT NULL REFERENCES semesters(id),
  assigned_by UUID NOT NULL REFERENCES staff(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID NOT NULL REFERENCES homework_assignments(id),
  student_id UUID NOT NULL REFERENCES students(id),
  submission_text TEXT,
  attachment_url TEXT,
  grade TEXT,
  feedback TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  graded_by UUID REFERENCES staff(id),
  graded_at TIMESTAMPTZ,
  UNIQUE(homework_id, student_id)
);
```

**App screens:**
- HRT/ST: `homework.tsx` — Assign, view submissions, give feedback
- Student: `homework.tsx` — View assignments, submit work
- Parent: See homework status in child dashboard

**Estimated effort:** 5-6 days

#### 2.2 Academic Transcripts
**Edge function:** `generate-transcript/index.ts`
- Aggregates marks across multiple semesters/years
- Generates PDF with school letterhead, student details, multi-year results
- Stores PDF URL in new `transcripts` table

**Estimated effort:** 3-4 days

#### 2.3 Predicted Grades
- Linear regression on prior marks + teacher override
- New fields on `marks` or separate `grade_predictions` table
- Admin/HRT screen to view/edit predictions
- Include on transcripts

**Estimated effort:** 2-3 days

#### 2.4 Parent-Teacher Messaging
**Database:**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  sender_id UUID NOT NULL, -- staff_id or parent_id
  sender_type TEXT NOT NULL CHECK (sender_type IN ('staff','parent')),
  recipient_id UUID NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('staff','parent')),
  student_id UUID REFERENCES students(id), -- context
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**App:**
- Parent inbox → add "Messages" tab
- HRT/ST → message parent from daybook or student profile

**Estimated effort:** 3-4 days

---

### Phase 3 — Operations & Polish (Weeks 11-14)

#### 3.1 Principal/Coordinator/HOD Dashboards
- Separate home screen components per role within `(admin)` layout
- Principal: KPI overview, pending approvals, school-wide metrics
- Coordinator: Academic scheduling, exam period management
- HOD: Department marks analytics, teacher performance

**Estimated effort:** 4-5 days

#### 3.2 School Settings UI
- Admin screen to edit `school_configs` values
- School profile editor (name, logo, colors)
- Feature toggles (daybook, CREED, finance gate, etc.)

**Estimated effort:** 2 days

#### 3.3 Timetable Auto-Generation
- Constraint solver: subject-teacher-room-time
- Conflict detection and resolution
- Currently only CSV/image upload exists

**Estimated effort:** 7-10 days (complex)

#### 3.4 Inventory Management
```sql
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  category TEXT,
  quantity INTEGER DEFAULT 0,
  location TEXT,
  condition TEXT CHECK (condition IN ('good','fair','poor','damaged')),
  purchase_date DATE,
  purchase_price DECIMAL(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Estimated effort:** 3-4 days

#### 3.5 Library Cataloging
- Could integrate with learn.escholr.com
- Or standalone: books, loans, returns tracking

**Estimated effort:** 4-5 days

#### 3.6 Visitor Log (Front Desk)
```sql
CREATE TABLE visitor_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  visitor_name TEXT NOT NULL,
  purpose TEXT,
  contact_phone TEXT,
  visiting TEXT, -- who they're visiting
  sign_in_at TIMESTAMPTZ DEFAULT now(),
  sign_out_at TIMESTAMPTZ,
  recorded_by UUID NOT NULL REFERENCES staff(id)
);
```

**Estimated effort:** 1-2 days

#### 3.7 Offline-First Enhancement
- Implement offline queue for attendance, marks, daybook
- Use React Query's `persistQueryClient` with AsyncStorage
- Background sync when connection restores

**Estimated effort:** 3-4 days

---

## Part 6: Effort Summary

| Phase | Scope | Duration | Key Deliverables |
|-------|-------|----------|------------------|
| **Phase 0** | MVP Blockers | **Weeks 1-3** | Student role, HR minimum, fee structure, email, backup, school super admin |
| **Phase 1** | Integrations | **Weeks 4-6** | Sage connector, learn.escholr.com, CAIE syllabus, public admissions |
| **Phase 2** | Academic Depth | **Weeks 7-10** | Homework, transcripts, predicted grades, parent messaging |
| **Phase 3** | Operations | **Weeks 11-14** | Role dashboards, settings UI, timetable, inventory, library, visitor log, offline |

**Total estimated: ~14 weeks** for full feature parity with requirements.

---

## Part 7: Architecture Decisions

### Sage Integration
- **API:** Sage Business Cloud Accounting REST API (OAuth2)
- **Per-school credentials** stored encrypted in `sage_connections` table
- **Sync direction:** App → Sage for invoices/receipts; Sage → App for payment confirmations + payroll status
- **HR payroll** lives in Sage; app shows read-only mirror

### Email Channel
- **Provider:** Resend (cheapest, Deno-friendly, good DX)
- **Secret:** `RESEND_API_KEY` in Supabase vault
- **Templates:** Per `trigger_event` — inline for MVP, `email_templates` table later
- **Key events:** absence alert, report released, marks complete, announcement, leave status

### School Backup to Google Drive
- **OAuth2 flow:** Admin connects Google Drive from app settings
- **Token storage:** `backup_destinations.oauth_token_encrypted`
- **Trigger:** Manual (admin button) + optional cron (daily/weekly)
- **Format:** ZIP containing CSV files per table
- **Edge function:** `export-school-data` bundles + uploads via Google Drive API

### learn.escholr.com (formerly igaprep.com)
- Subdomain hosts LMS content
- **SSO:** Shared Supabase auth or signed JWT handoff
- **In-app:** WebView component with token passthrough
- **Resource linking:** Teachers can attach resources to subjects/streams

### Notifications
- **Primary:** Push (Expo push tokens — already implemented)
- **Secondary:** Email (Resend — to be added)
- **No SMS** — excluded per user decision
- **In-app:** Already implemented via `notification_logs` table

---

## Part 8: Priority Matrix

### 🔴 P0 — Must ship before APK 1.0
1. Student role (login + basic dashboard)
2. HR role (minimum: leave management)
3. Fee structure + parent fees view
4. Email notification channel
5. School backup to Google Drive
6. Fix ST students.tsx stub

### 🟡 P1 — Ship within 6 weeks post-launch
7. Sage Accounting connector
8. learn.escholr.com integration (rename igaprep links)
9. CAIE syllabus support
10. Public admissions form
11. School settings UI
12. Finance: receipt export, invoice generation

### 🟢 P2 — Ship within 10 weeks
13. Homework module
14. Academic transcripts
15. Predicted grades
16. Parent-teacher messaging
17. Principal/Coordinator/HOD dashboards

### 🔵 P3 — Ship within 14 weeks
18. Auto timetable generator
19. Inventory management
20. Library cataloging
21. Visitor log
22. Offline-first enhancement
23. Detailed medical profile fields

---

*This document serves as the single source of truth for the eScholr implementation roadmap.*
