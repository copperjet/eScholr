# eScholr — Role & Dashboard Audit

**Date:** 27 Apr 2026
**Scope:** All 12 user roles, all 9 route groups, every screen, every user journey end-to-end.
**Method:** Direct codebase walk-through (`app/`, `supabase/migrations/`, `supabase/functions/`, `types/database.ts`).

---

## 1. Role Inventory

`types/database.ts` defines **12 roles**:

| # | Role            | Login Route          | Route Group         | Layout Type | Notes |
|---|-----------------|----------------------|---------------------|-------------|-------|
| 1 | `super_admin`   | `/platform-login`    | `(platform)`        | Tabs (2)    | Platform owner |
| 2 | `admin`         | `/login`             | `(admin)`           | Tabs (4)    | School admin |
| 3 | `principal`     | `/login`             | `(admin)` *shared*  | Tabs (4)    | **No differentiation** from admin |
| 4 | `coordinator`   | `/login`             | `(admin)` *shared*  | Tabs (4)    | **No differentiation** from admin |
| 5 | `hod`           | `/login`             | `(admin)` *shared*  | Tabs (4)    | **No differentiation** from admin |
| 6 | `hr`            | `/login`             | `(hr)`              | Tabs (4)    | Light feature set |
| 7 | `finance`       | `/login`             | `(finance)`         | **Stack ❌**| **Bug: no tab bar** |
| 8 | `front_desk`    | `/login`             | `(frontdesk)`       | Tabs (3)    | OK |
| 9 | `hrt`           | `/login`             | `(hrt)`             | Tabs (6)    | Most feature-rich teacher role |
| 10 | `st`           | `/login`             | `(st)`              | Tabs (5)    | Subject teacher |
| 11 | `parent`       | `/login`             | `(parent)`          | Tabs (5)    | OK |
| 12 | `student`      | `/login`             | `(student)`         | Tabs (5)    | OK with 2 stubs |

---

## 2. Per-Role Screen Audit

Legend: ✅ implemented · ⚠️ partial · ❌ stub or missing · 🐛 bug

### 2.1 Platform Admin (`super_admin`) — `(platform)/`

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` (Schools) | ✅ | Fetches via `get-schools-overview` edge fn; shows totals + list |
| `school-detail.tsx` | ✅ | Tabbed (Info / Usage / Notes); 27 KB — comprehensive |
| `onboard.tsx` | ✅ | Calls `create-school-admin` edge fn |
| `metrics.tsx` | ✅ | MRR, ARR, churn — uses `get-platform-metrics` |
| `impersonation-log.tsx` | ✅ | Audit trail viewer |
| `more.tsx` | ✅ | Navigation hub |

**User journey: Onboard → Manage → Impersonate → Metrics — COMPLETE.**

**Gaps:**
- No way to **suspend/cancel** a school subscription from the UI (DB has the field but no action button).
- No **renewal reminders** view (renewal_date column exists, no UI surfacing).
- No **billing/invoice management** for the SaaS subscription itself.

### 2.2 School Admin (`admin` + principal/coordinator/hod) — `(admin)/`

**Tabs visible:** Home, Students, Staff, More.

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` | ✅ | Stats + quick actions |
| `students.tsx` | ✅ | Search/filter/import — *previously a stub, now fully built* |
| `staff.tsx` | ✅ | 30 KB — large |
| `parents.tsx` | ✅ | 26 KB |
| `more.tsx` | ✅ | Navigation hub (15 KB) |
| `assignments.tsx` | ✅ | Subject teacher assignment matrix |
| `attendance-overview.tsx` | ✅ | School-wide |
| `attendance-correct.tsx` | ✅ | Late corrections |
| `audit-log.tsx` | ✅ | Read-only |
| `backup-settings.tsx` | ⚠️ | Google Drive backup — needs OAuth flow check |
| `calendar.tsx` | ✅ | School events |
| `daybook.tsx` | ✅ | Day book overview |
| `fee-structure.tsx` | ⚠️ | CRUD exists; verify invoice generation flow |
| `marks-matrix.tsx` | ✅ | |
| `marks-unlock.tsx` | ✅ | 27 KB |
| `marks-windows.tsx` | ✅ | |
| `notification-log.tsx` | ✅ | |
| `promotion-wizard.tsx` | ✅ | 27 KB — end-of-year flow |
| `reports.tsx` | ✅ | Approval workflow |
| `school-onboarding.tsx` | ✅ | First-run setup wizard (26 KB) |
| `semesters.tsx` | ✅ | |
| `student-add/edit/import/credentials.tsx` | ✅ | |
| `timetable-upload.tsx` | ✅ | |
| `announcements.tsx` | ✅ | |

**Gaps:**
- 🐛 **`principal`, `coordinator`, `hod` redirect to `(admin)`** with no role-specific filtering. They see *every* admin tool. Likely undesired — e.g., HOD should be scoped to their department's subjects.
- ❌ No **teacher performance dashboard** for principals.
- ❌ No **department view** for HODs.
- ❌ No **academic calendar** beyond `calendar.tsx` for coordinators.

### 2.3 HR (`hr`) — `(hr)/`

**Tabs visible:** Home, Leave, Staff, More.

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` | ✅ | Pending leave count, staff count |
| `staff.tsx` | ⚠️ | 3 KB — likely **read-only listing**, no CRUD |
| `leave.tsx` | ✅ | List of requests |
| `leave-request.tsx` | ✅ | Submit form |
| `leave-approve.tsx` | ✅ | Approve/reject |
| `more.tsx` | ✅ | |

**Gaps:**
- ❌ **No payroll / salary / contracts** module.
- ❌ **No employee onboarding** flow.
- ❌ **No leave-balance management UI** (table exists in DB, no editor).
- ❌ **No HR reports** (turnover, leave trends).
- ⚠️ HR `staff.tsx` is small — verify it can actually edit employment fields, not just admin's `staff.tsx`.

### 2.4 Finance (`finance`) — `(finance)/`

| Screen | Status | Notes |
|--------|--------|-------|
| Layout | 🐛 | **Uses `<Stack>` instead of `<Tabs>` — no bottom tab bar.** Users can only navigate via deep links / back button. |
| `home.tsx` | ✅ | Finance dashboard, search, bulk-pay |
| `student-finance.tsx` | ✅ | 19 KB — payment recording |
| `finance-reports.tsx` | ✅ | |

**Gaps:**
- 🐛 **Critical layout bug** — change `<Stack>` to `<Tabs>` and define tabs.
- ❌ **No fee structure UI** here (lives in admin only — Finance cannot adjust fees).
- ❌ **No invoice generation UI** (only payment against existing records).
- ❌ **No receipts list / re-print** (edge fn `generate-receipt` exists; no UI list).
- ❌ **No Sage / accounting export** (was P1 in old plan).

### 2.5 Front Desk (`front_desk`) — `(frontdesk)/`

**Tabs visible:** Home, Inquiries, More.

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` | ✅ | Status counts |
| `inquiries.tsx` | ✅ | List |
| `inquiry-detail.tsx` | ✅ | 18 KB — full lifecycle |
| `more.tsx` | ✅ | |

**Gaps:**
- ❌ **No visitor log** (sign-in/out at gate).
- ❌ **No public admissions form** (parent-facing inquiry submission via web link).
- ❌ **No quick contact-parent** action (call/SMS/email).
- ❌ **No daily attendance summary** quick view (parents calling about absent kids).

### 2.6 Home Room Teacher (`hrt`) — `(hrt)/`

**Tabs visible:** Home, Attendance, Marks, Homework, Students, More.

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` | ✅ | 15 KB |
| `attendance.tsx` | ✅ | 43 KB — flagship feature |
| `attendance-history.tsx` | ✅ | |
| `marks.tsx` | ✅ | 22 KB |
| `homework.tsx` | ✅ | 21 KB |
| `students.tsx` | ✅ | |
| `daybook.tsx` | ✅ | 21 KB |
| `creed.tsx` | ✅ | Character education entries |
| `messages.tsx` | ✅ | 18 KB |
| `reports.tsx` | ✅ | |
| `reports-approve.tsx` | ✅ | |
| `more.tsx` | ✅ | |

**This role is the most complete — minor gaps only:**
- ⚠️ **No CAIE-aware marking** (was P1 in old plan).
- ⚠️ **No timetable view** for HRT (uses shared `/timetable`).

### 2.7 Subject Teacher (`st`) — `(st)/`

**Tabs visible:** Home, Marks, Homework, Students, More.

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` | ✅ | |
| `marks.tsx` | ✅ | |
| `marks-entry.tsx` | ✅ | 22 KB |
| `marks-import.tsx` | ✅ | 28 KB — CSV import |
| `homework.tsx` | ✅ | 19 KB |
| `students.tsx` | ✅ | *previously a stub, now built* |
| `daybook.tsx` | ✅ | |
| `messages.tsx` | ✅ | |
| `more.tsx` | ✅ | |

**Gaps:**
- ❌ **No attendance** for subject lessons (only HRT marks attendance — but ST should mark per-period attendance for their classes if school requires it).
- ❌ **No lesson planner / scheme of work**.
- ❌ **No subject-level analytics** (mean, distribution per class).

### 2.8 Parent (`parent`) — `(parent)/`

**Tabs visible:** Home, Homework, Reports, Fees, Inbox.

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` | ✅ | 19 KB — multi-child switcher, attendance, day book, latest report |
| `homework.tsx` | ✅ | 12 KB |
| `reports.tsx` | ✅ | |
| `fees.tsx` | ✅ | Reads invoices + finance_records |
| `inbox.tsx` | ✅ | 8 KB |
| `messages.tsx` | ⚠️ | 18 KB — **hidden from tabs**, but exists. Redundant with inbox? |

**Gaps:**
- ❌ **No payment** — parent can view invoices but can't pay (no Mobile Money / card flow).
- ❌ **No download receipt** action.
- ❌ **No parent-teacher meeting scheduling**.
- ❌ **No leave / absence request** ("My child will be absent tomorrow").
- ⚠️ **inbox vs messages** — clarify which is canonical and remove the other or merge.

### 2.9 Student (`student`) — `(student)/`

**Tabs visible:** Home, Marks, Reports, Homework, More.

| Screen | Status | Notes |
|--------|--------|-------|
| `home.tsx` | ✅ | 15 KB — strong dashboard |
| `marks.tsx` | ✅ | |
| `reports.tsx` | ✅ | |
| `homework.tsx` | ✅ | 10 KB |
| `attendance.tsx` | ✅ | hidden tab |
| `more.tsx` | ✅ | |
| `announcements.tsx` | ❌ | **Stub — 30 lines, EmptyState only.** Doesn't query `announcements` table. |
| `timetable.tsx` | ❌ | **Stub — 30 lines, EmptyState only.** Doesn't query `timetable_entries`. |

**Gaps:**
- ❌ Two stubs above must be implemented.
- ❌ **No homework submission** (student can see homework but not submit).
- ❌ **No predicted grades view** (DB exists; user explicitly deferred — *not urgent*).
- ❌ **No leave request from student**.

---

## 3. Shared / Cross-role Screens — `(app)/`

| Screen | Status | Notes |
|--------|--------|-------|
| `announcements.tsx` | ✅ | 6 KB |
| `notifications.tsx` | ✅ | 9 KB |
| `report-viewer.tsx` | ✅ | PDF viewer |
| `search.tsx` | ✅ | Universal search |
| `switch-role.tsx` | ✅ | Multi-role switcher |
| `timetable.tsx` | ✅ | 7 KB — generic; not exposed for student role |
| `student/[id]` | ✅ | Student detail (used by HRT/ST/Admin) |

---

## 4. Backend Audit

### 4.1 Database (33 migrations)

All core tables present: schools, users, students, parents, staff, staff_roles, semesters, attendance, marks, reports, finance_records, invoices, fee_structures, day_book_entries, leave_requests, inquiries, announcements, timetable_entries, push_tokens, audit_log, plus platform_admin tables (impersonation_log, school_notes, platform_plans).

**Migration 034** (just applied): Hardened `custom_access_token_hook` with EXCEPTION handler.

### 4.2 Edge Functions (20 deployed)

| Function | Used By | Status |
|----------|---------|--------|
| `create-platform-admin` | one-time bootstrap | ✅ |
| `create-school-admin` | platform onboard | ✅ |
| `update-school` | platform | ✅ |
| `get-schools-overview` | platform home | ✅ |
| `get-platform-metrics` | platform metrics | ✅ |
| `get-impersonation-log` | platform | ✅ |
| `impersonate-school` | platform | ✅ |
| `manage-school-notes` | platform | ✅ |
| `export-school-data` | admin backup | ⚠️ verify |
| `invite-user` | admin staff | ✅ |
| `generate-receipt` | finance | ✅ |
| `generate-report` / `generate-report-pdf` | reports flow | ✅ |
| `generate-transcript` | admin | ✅ |
| `release-report` / `verify-report` | reports flow | ✅ |
| `notify-marks-complete` | mark workflow | ✅ |
| `send-absence-notification` | attendance | ✅ |
| `send-email` / `send-push` | notifications | ✅ |

**Gaps:**
- ❌ **No payment-processing function** (Mobile Money / Stripe webhook).
- ❌ **No Google Drive backup function** (table exists; uploader missing).
- ❌ **No public-admissions function** (anonymous inquiry submission).

---

## 5. Critical Bugs Discovered

| # | Severity | File | Issue |
|---|----------|------|-------|
| B1 | 🐛 P0 | `app/(app)/(finance)/_layout.tsx` | Uses `<Stack>` not `<Tabs>` — finance has no nav |
| B2 | 🐛 P0 | `app/(app)/(student)/announcements.tsx` | EmptyState stub — no data query |
| B3 | 🐛 P0 | `app/(app)/(student)/timetable.tsx` | EmptyState stub — no data query |
| B4 | 🐛 P1 | `app/index.tsx` | principal/coordinator/hod fall through to `(admin)` with no role-based UI scoping |
| B5 | ⚠️ P1 | `app/(app)/(parent)/{inbox,messages}.tsx` | Redundant — keep one |

---

## 6. Major Feature Gaps (by priority)

### P0 — Blocks core journeys
1. **Finance tab navigation** (B1).
2. **Student `announcements` and `timetable`** (B2, B3).
3. **Parent payment flow** — fees are visible but can't be paid in-app.
4. **HR payroll/contracts** — currently HR is just leave management.

### P1 — Important features
5. **Role-scoped views for principal / coordinator / HOD**.
6. **Subscription suspend/cancel + renewal reminders** (platform admin).
7. **Public admissions form** (front desk) — unauthenticated parents need a way to inquire.
8. **Visitor log** (front desk).
9. **Homework submission** (student).
10. **Parent-initiated leave / absence request**.
11. **Receipts list & re-print** (finance).
12. **Subject-teacher attendance per period** (st).

### P2 — Nice to have
13. **Sage/accounting export** (finance).
14. **CAIE syllabus support** (marks).
15. **Lesson planner / scheme of work** (st).
16. **Teacher performance / department dashboards** (principal/HOD).
17. **Predicted grades UI** — *deferred per user instruction*.
18. **Mobile push for important notifications** (table + edge fn exist, verify wiring).

### P3 — Polish
19. Merge inbox/messages on parent.
20. CAIE-aware marking flow.
21. learn.escholr.com integration.

---

## 7. Recommended Next Steps (Phase Plan)

### Phase A — Bug fixes (1 day)
- B1: Convert `(finance)` to Tabs layout.
- B2/B3: Implement student announcements + timetable using existing tables.
- B4: Either branch the redirect, or add role-scoped queries inside `(admin)` screens.
- B5: Decide canonical inbox name; remove the other.

### Phase B — Parent payments (3–5 days)
- Pick provider (Airtel/MTN MoMo for Zambia? Stripe?).
- Edge fn `initiate-payment` + webhook `record-payment`.
- UI on parent `fees.tsx` and student `home.tsx`.

### Phase C — Role scoping (2–3 days)
- Build principal home (school-wide academic KPIs).
- Build HOD home (department-scoped marks/reports).
- Build coordinator home (timetable & calendar focus).

### Phase D — Public surfaces (3 days)
- Public admissions form (web `/admissions/[code]`).
- Visitor log app (front-desk inside, optional kiosk mode).

### Phase E — HR depth (5 days)
- Contracts.
- Payroll runs (calc → pdf payslips → email via existing `send-email`).
- Leave-balance editor.

### Phase F — Polish (ongoing)
- Subject-teacher per-period attendance.
- Homework submission + grading by ST.
- Receipts re-print list.

---

## 8. Files To Touch (mapped)

### Phase A (immediate)
- `app/(app)/(finance)/_layout.tsx` — rewrite as Tabs.
- `app/(app)/(student)/announcements.tsx` — replace stub with query against `announcements`.
- `app/(app)/(student)/timetable.tsx` — replace stub with query against `timetable_entries`.
- `app/index.tsx` — branch `principal/coordinator/hod` to dedicated layouts (when ready), or document the shared-admin decision.
- `app/(app)/(parent)/inbox.tsx` vs `messages.tsx` — pick one.

### Phase B (payments)
- `supabase/functions/initiate-payment/index.ts` — new.
- `supabase/functions/payment-webhook/index.ts` — new.
- `supabase/migrations/035_payments.sql` — new (transactions, references).
- `app/(app)/(parent)/fees.tsx` — add Pay button.
- `app/(app)/(student)/home.tsx` — add Pay link in fees card.

---

## 9. Verification Checklist (post-fix)

- [ ] Login: super_admin, admin, hrt, st, parent, student, finance, hr, front_desk all reach their home screens.
- [ ] Each role's tab bar renders with all tabs reachable.
- [ ] No screen shows the React Native error overlay.
- [ ] Each Home dashboard loads data (no infinite skeletons).
- [ ] Cross-role screens (notifications, search, switch-role) accessible.
- [ ] Edge functions return 200 for: get-schools-overview, get-platform-metrics, generate-report, send-absence-notification.

---

*End of audit.*
