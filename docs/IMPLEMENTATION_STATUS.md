# Scholr — Implementation Status

**Last updated:** 2026-04-24
**Pilot target:** Lusaka Oaktree / Cambridge International School
**Current branch:** SDK 54, reanimated 4.x, aligned dependencies, rebranded from "ETP School" → "Scholr"

---

## 1. Overview

Scholr is a mobile-first school management app built for international private schools. Primary role coverage spans 10 user types (super_admin, admin, front_desk, finance, principal, coordinator, HOD, homeroom teacher, subject teacher, parent).

**Product positioning:** Internal school operations (attendance, marks, reports, behavior, finance, communication). Resource/LMS features (homework, past papers, notes, revision, chat) are handled by the separate **igaprep.com** platform which will be bundled. Admissions are handled by the **lusakaoaktree.school** website.

---

## 2. Tech Stack

| Layer | Choice |
|-------|--------|
| Mobile framework | Expo SDK 54 · React Native 0.81.5 · expo-router 6 |
| Language | TypeScript |
| State | Zustand (auth) + React Query (server state) |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Auth | JWT with app_metadata claims (school_id, roles, active_role) |
| Push | Expo Push (FCM/APNs via Expo) |
| PDF | Puppeteer edge function with remote Chrome |
| Biometric | expo-local-authentication |
| Animation | react-native-reanimated 4.x |

Bundle IDs: `com.scholr.app` (iOS + Android). Scheme: `scholr://`.

---

## 3. Feature Status Matrix

Legend: ✅ Production-quality · 🟡 Partial/needs polish · 🔴 Not built

### Academic
| Feature | Status | Notes |
|---------|--------|-------|
| Attendance marking (HRT) | ✅ | 640-line screen, co-HRT conflict, bulk mark, audit trail, progress bar |
| Attendance summary (parent/admin) | ✅ | `get_attendance_summary()` RPC with holiday calendar |
| Marks entry (HRT + ST) | ✅ | FA1/FA2/Summative, live validation, class average, deviation warnings |
| Grading scale conversion | 🟡 | Scales + boundaries modeled; letter-from-% helper needs finalizing |
| Report cards (term) | ✅ | Draft → approval → finance-gate → released pipeline with versioning |
| Report PDF generation | ✅ | Puppeteer edge function, stored in `reports` bucket |
| Parent report download | 🟡 | Report viewer screen exists; in-app download UX to polish |
| CREED character records | ✅ | Per-student per-semester, A\*–U + developmental scale |
| Day book / behavior notes | ✅ | 8 categories, 15-min edit window enforced by DB trigger |
| Cumulative transcripts | 🔴 | Postponed (see ROADMAP) |
| Predicted grades | 🔴 | Postponed |
| Timetable viewer | ✅ | Admin upload (PDF/image per grade/stream); all roles view via WebView/Image |

### Students / Staff / Parents
| Feature | Status | Notes |
|---------|--------|-------|
| Student directory + profile | ✅ | Full CRUD, year records, parent links |
| Staff directory + CRUD | ✅ | 659-line screen, bulk import prep, role modal |
| Parent linking | ✅ | Multi-child support, parent can switch between children |
| Emergency contacts | ✅ | Required safeguarding field |
| Teacher qualifications/workload fields | 🟡 | Table exists; UI surface minimal |

### Communication
| Feature | Status | Notes |
|---------|--------|-------|
| Push notifications (receive + deep-link) | ✅ | Token registration, listener, routing |
| Push notifications (send) | 🟡 | Infrastructure ready; no unified send-push edge function yet |
| Announcements | ✅ | Admin compose + target (school/grade/stream/role) + feed + push delivery + read receipts |
| SMS delivery | 🔴 | Postponed (cost decision pending) |
| Inquiry management (front desk) | ✅ | [inquiries.tsx](../app/(app)/(frontdesk)/inquiries.tsx), 398 lines |
| Parent ↔ teacher chat | 🔴 | Out of scope (handled by igaprep) |

### Finance
| Feature | Status | Notes |
|---------|--------|-------|
| Fee balance tracking | ✅ | `finance_records` per student per semester |
| Bulk mark-paid | ✅ | Finance home screen |
| Receipt PDFs | 🔴 | Planned Phase 2 |
| Invoice generation | 🔴 | Postponed |
| Financial reports | 🔴 | Postponed |
| Payment gateway | 🔴 | Postponed |

### Operations
| Feature | Status | Notes |
|---------|--------|-------|
| Multi-role switching | ✅ | [switch-role.tsx](../app/(app)/switch-role.tsx) |
| Biometric auth (Face ID / fingerprint) | 🟡 | Wired on login screen; enrollment flow minimal |
| Dark mode | ✅ | System-preference driven, all screens |
| School-specific branding (colors) | ✅ | Per-tenant `primary_color` / `secondary_color` |
| Audit logs | ✅ | `audit_logs` table, fire-and-forget writes |
| Academic calendar | ✅ | Admin CRUD (events/holidays/exam periods/marks windows), filter chips, upcoming/past split |
| Super-admin school onboarding | 🔴 | Planned Phase 2 (currently SQL-seeded) |

### Modules explicitly out of scope for Scholr core
(Handled by igaprep.com or lusakaoaktree.school or postponed)

| Module | Destination |
|--------|-------------|
| Homework distribution / submission | igaprep.com |
| Syllabus & resources repository | igaprep.com |
| Past papers, notes, revision | igaprep.com |
| Messaging / chat | igaprep.com |
| Online admissions application | lusakaoaktree.school |
| Library management | Postponed (Year 2) |
| Inventory / asset tracking | Postponed (Year 2) |
| HR: staff attendance / leave / payroll | Postponed (Year 2) |
| Automated timetable generation | Postponed (manual upload in v1) |
| Multi-language (i18n) | Postponed (Year 2) |
| Offline-first sync | Postponed (push + cache sufficient) |

---

## 4. Screens by Role

Root: `app/(app)/...`

### Admin (8 screens, ~2,267 lines)
- `home.tsx` — dashboard (students, staff, pending reports, semester, attendance)
- `staff.tsx` (659) — full CRUD + bulk import + role modal
- `students.tsx` — directory
- `parents.tsx` (592) — parent linking + role management
- `reports.tsx` — approval pipeline
- `assignments.tsx` (511) — subject-teacher assignments
- `more.tsx` — settings/navigation
- `_layout.tsx` — tab navigation

### Homeroom Teacher / HRT (8 screens, ~2,700 lines)
- `home.tsx` (366) — class metrics
- `attendance.tsx` (640) — **standout screen**
- `marks.tsx` (511) — marks grid with live validation
- `reports.tsx` (405) — class report pipeline
- `daybook.tsx` (511) — behavior / day book entries
- `creed.tsx` — character framework
- `students.tsx` — class roster
- `more.tsx`, `_layout.tsx`

### Subject Teacher / ST (5 screens)
- `home.tsx` (190), `marks.tsx` (390), `students.tsx`, `more.tsx`, `_layout.tsx`
- Lighter than HRT; coverage adequate for subject-scoped marks entry

### Parent (1 primary screen, 429 lines)
- `home.tsx` — multi-child switcher, reports, attendance, day book, notifications

### Finance (3 screens, ~800 lines)
- `home.tsx` (392) — balance overview + bulk mark-paid
- `student-finance.tsx` (408) — individual student ledger
- `_layout.tsx`

### Front Desk (4 screens)
- `home.tsx`, `inquiries.tsx` (398), `more.tsx`, `_layout.tsx`

### Shared (auth + app-level)
- `(auth)/school-code.tsx`, `(auth)/login.tsx` — rebranded with Scholr logo
- `(app)/notifications.tsx`, `(app)/report-viewer.tsx`, `(app)/switch-role.tsx`, `(app)/student/[id].tsx`

---

## 5. Backend

### Migrations (19 files, ~1,653 lines)
```
001_schools.sql              schools, school_configs, app_versions
002_academic_structure.sql   school_sections, grades, streams
003_academic_year.sql        academic_years, semesters
004_grading.sql              grading_scales, grade_boundaries
005_users.sql                staff, staff_roles, parents, push_tokens, biometric_sessions
006_students.sql             students, student_parent_links, student_year_records
007_assignments.sql          hrt_assignments, subject_teacher_assignments
008_attendance.sql           attendance_records, excused_absence_requests
009_marks.sql                marks, mark_notes
010_character.sql            character_records (CREED)
011_reports.sql              reports, report_templates, report_versions
012_daybook.sql              day_book_entries
013_finance.sql              finance_records
014_notifications.sql        notification_logs
015_audit.sql                audit_logs
016_inquiry.sql              inquiries
017_search_functions.sql     full-text search RPCs
018_demo_seed.sql            demo data
019_jwt_claims_hook.sql      JWT app_metadata enrichment
```

**RLS:** enabled on all 14+ data tables. School isolation enforced via `(auth.jwt()->'app_metadata'->>'school_id')::uuid`. Own-device policies on push_tokens and biometric_sessions.

### Edge Functions
- `generate-report` — Puppeteer-based report PDF
- `invite-user` — user invitation workflow

### Storage buckets
- `reports` — generated report PDFs
- (Planned) `timetables`, `announcements_attachments`, `receipts`

---

## 6. Assets & Branding

- Logo assets: `assets/scholr-main-logo.png` (horizontal lockup), `assets/scholr-logo.png` (S mark)
- App icon / adaptive icon / favicon: existing navy placeholders (to refresh with Scholr marks later)
- Splash: Scholr main logo on white background
- Brand color: `#1B2A4A` (navy) primary, `#E8A020` (amber) secondary; per-school override supported

---

## 7. Known Limitations & Technical Debt

| Item | Severity | Notes |
|------|----------|-------|
| 172 `as any` casts across `app/` | High | Supabase types not generated; planned for Phase 0 |
| Zero tests | High | No jest, no RNTL; planned for Phase 3 |
| No root ErrorBoundary | ~~High~~ Done | `components/ErrorBoundary.tsx` wraps root layout |
| No observability (Sentry / analytics) | High | Planned Phase 0 |
| Push notification send path | ~~Medium~~ Done | `send-push` edge fn ships; supports user/role/stream/grade/school targeting |
| Biometric enrollment UX | Medium | Functional but minimal |
| No CI pipeline | Medium | EAS config exists; GitHub Actions / pre-submit hooks planned |
| Grade calculation helper scattered | ~~Low~~ Done | Extracted to `lib/grading.ts` with full WeightedPercent, IGCSE, letter-from-%, dev scale |
| No soft-delete pattern | Low | Hard cascades; acceptable for v1 |
| No data export / backup runbook | Medium | Supabase auto-backups exist; need documented restore drill |

---

## 8. Build / Release

- `eas.json` configured with three profiles: development (APK), preview (APK), production (app-bundle)
- `.env.example` present; Supabase URL + anon key via `EXPO_PUBLIC_*`
- EAS project ID: `63d5dd9e-63b7-4446-a611-54294c935128`
- Owner: `acecode10`
