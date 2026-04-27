# eScholr Dashboard Audit — April 2026

> Comprehensive audit of all 12 user roles, their screens, navigation, and user journey completeness.

---

## Role Summary

| # | Role | Route Group | Layout Guard | Tab Screens | Hidden Screens | More/Account | Status |
|---|------|-------------|-------------|-------------|----------------|--------------|--------|
| 1 | **Platform Admin** (`super_admin`) | `(platform)` | `super_admin` | 2 (Schools, Account) | 4 | ✅ | ✅ Complete |
| 2 | **School Admin** (`admin`) | `(admin)` | `admin,principal,coordinator,hod` | 4 (Home, Students, Staff, More) | 18 | ✅ | ✅ Complete |
| 3 | **Principal** (`principal`) | `(admin)` shared | via ADMIN_ROLES array | shared with Admin | role-scoped via `canAccess()` | ✅ | ✅ Complete |
| 4 | **Coordinator** (`coordinator`) | `(admin)` shared | via ADMIN_ROLES array | shared with Admin | role-scoped via `canAccess()` | ✅ | ✅ Complete |
| 5 | **HOD** (`hod`) | `(admin)` shared | via ADMIN_ROLES array | shared with Admin | role-scoped + dept filter | ✅ | ✅ Complete |
| 6 | **HRT (Class Teacher)** (`hrt`) | `(hrt)` | `hrt` | 6 (Home, Attendance, Marks, Homework, Students, More) | 6 | ✅ | ✅ Complete |
| 7 | **ST (Subject Teacher)** (`st`) | `(st)` | `st` | 5 (Home, Marks, Homework, Students, More) | 4 | ✅ | ✅ Complete |
| 8 | **Finance** (`finance`) | `(finance)` | `finance` | 3 (Home, Reports, **More**) | 1 | ✅ Fixed | ✅ Complete |
| 9 | **Front Desk** (`front_desk`) | `(frontdesk)` | `front_desk` | 3 (Home, Inquiries, More) | 3 | ✅ | ✅ Complete |
| 10 | **HR** (`hr`) | `(hr)` | `hr` | 4 (Home, Leave, Staff, More) | 3 | ✅ Fixed | ✅ Complete |
| 11 | **Parent** (`parent`) | `(parent)` | `parent` | 5 (Home, Homework, Reports, Fees, **More**) | 2 | ✅ Fixed | ✅ Complete |
| 12 | **Student** (`student`) | `(student)` | `student` | 5 (Home, Marks, Reports, Homework, More) | 3 | ✅ Fixed | ✅ Complete |

---

## Bugs Fixed in This Audit

### 🔴 Critical: Parent Reports — Wrong ID Passed
- **File:** `(parent)/reports.tsx:19-21`
- **Bug:** `useParentReports(user?.staffId, ...)` — was passing `staffId` instead of `parentId`
- **Impact:** Reports tab for parents **never loaded any data** because `staffId` is null for parent users
- **Fix:** Changed to `user?.parentId`

### 🟡 Missing: HR — No Switch Role Option
- **File:** `(hr)/more.tsx`
- **Bug:** Account section had no Switch Role menu item; users with multiple roles couldn't switch
- **Fix:** Added conditional Switch Role item + enhanced profile alert with role/school info

### 🟡 Missing: Student — No Switch Role Option
- **File:** `(student)/more.tsx`
- **Bug:** Same as HR — no Switch Role for students with multiple roles
- **Fix:** Added conditional Switch Role item + enhanced profile alert

### 🟡 Missing: Finance — No More/Account Tab
- **File:** `(finance)/_layout.tsx`
- **Bug:** Only 2 tabs (Home, Reports) — no way to sign out, switch roles, or view profile
- **Fix:** Created `(finance)/more.tsx` with full account menu, added More tab to layout

### 🟡 Missing: Parent — No More/Account Tab
- **File:** `(parent)/_layout.tsx`
- **Bug:** 5 tabs with Inbox but no account/sign out; Inbox moved to hidden, More tab added
- **Fix:** Created `(parent)/more.tsx` with communication links (Inbox, Messages), school links (Announcements, Timetable), and full account menu

---

## Detailed Screen Audit Per Role

### 1. Platform Admin (`super_admin`)

**Tab Bar:** Schools · Account

| Screen | File | Status | Notes |
|--------|------|--------|-------|
| Home / School List | `(platform)/home.tsx` | ✅ | Lists all schools, tap → detail |
| School Detail | `(platform)/school-detail.tsx` | ✅ | Full school management, impersonate |
| Onboard School | `(platform)/onboard.tsx` | ✅ | Create new school tenant wizard |
| Platform Metrics | `(platform)/metrics.tsx` | ✅ | MRR, ARR, churn, growth charts |
| Impersonation Log | `(platform)/impersonation-log.tsx` | ✅ | Audit trail of support sessions |
| More / Account | `(platform)/more.tsx` | ✅ | Profile, sign out |

**User Journey:** ✅ Complete — Schools list → Detail → Impersonate or Manage → Metrics → Sign out

---

### 2–5. Admin / Principal / Coordinator / HOD (shared `(admin)` group)

**Tab Bar:** Home · Students · Staff · More

All 4 roles share the same dashboard with **feature gating** via `lib/roleScope.ts`:
- `canAccess(role, feature)` checks the ROLE_ACCESS matrix
- HOD additionally gets `useDepartmentScope()` for department-level filtering

| Screen | File | Access | Status |
|--------|------|--------|--------|
| Home Dashboard | `(admin)/home.tsx` | all | ✅ |
| Students List | `(admin)/students.tsx` | admin | ✅ |
| Student Add | `(admin)/student-add.tsx` | admin | ✅ |
| Student Edit | `(admin)/student-edit.tsx` | admin | ✅ |
| Student Import | `(admin)/student-import.tsx` | admin | ✅ |
| Student Credentials | `(admin)/student-credentials.tsx` | admin | ✅ |
| Staff Manage | `(admin)/staff.tsx` | admin | ✅ |
| Parents | `(admin)/parents.tsx` | admin | ✅ |
| HRT/ST Assignments | `(admin)/assignments.tsx` | admin | ✅ |
| Attendance Overview | `(admin)/attendance-overview.tsx` | admin, principal, coordinator | ✅ |
| Attendance Correction | `(admin)/attendance-correct.tsx` | admin, principal, coordinator | ✅ |
| Marks Matrix | `(admin)/marks-matrix.tsx` | admin, principal, coordinator, hod | ✅ |
| Marks Windows | `(admin)/marks-windows.tsx` | admin, hod | ✅ |
| Marks Unlock | `(admin)/marks-unlock.tsx` | admin | ✅ |
| Reports Approval | `(admin)/reports.tsx` | all admin roles | ✅ |
| Announcements | `(admin)/announcements.tsx` | admin, principal, coordinator | ✅ |
| Day Book | `(admin)/daybook.tsx` | admin, principal, coordinator, hod | ✅ |
| Calendar | `(admin)/calendar.tsx` | admin, principal, coordinator | ✅ |
| Semesters | `(admin)/semesters.tsx` | admin | ✅ |
| Promotion Wizard | `(admin)/promotion-wizard.tsx` | admin | ✅ |
| Fee Structure | `(admin)/fee-structure.tsx` | admin | ✅ |
| Timetable Upload | `(admin)/timetable-upload.tsx` | admin | ✅ |
| Notification Log | `(admin)/notification-log.tsx` | admin, principal | ✅ |
| Audit Log | `(admin)/audit-log.tsx` | admin | ✅ |
| Backup Settings | `(admin)/backup-settings.tsx` | admin | ✅ |
| School Onboarding | `(admin)/school-onboarding.tsx` | super_admin | ✅ |
| More / Account | `(admin)/more.tsx` | all | ✅ Switch role, sign out |

**User Journey:** ✅ Complete — Dashboard stats → Student/Staff management → Marks windows → Reports pipeline → Fees → Calendar → Settings → Sign out

---

### 6. HRT — Class Teacher

**Tab Bar:** Home · Attendance · Marks · Homework · Students · More

| Screen | File | Status | Notes |
|--------|------|--------|-------|
| Home Dashboard | `(hrt)/home.tsx` | ✅ | Class stats, pending tasks |
| Attendance | `(hrt)/attendance.tsx` | ✅ | Full register (43KB — very complete) |
| Attendance History | `(hrt)/attendance-history.tsx` | ✅ | Past registers & stats |
| Marks Entry | `(hrt)/marks.tsx` | ✅ | By subject/assessment type |
| Homework | `(hrt)/homework.tsx` | ✅ | Create, view submissions |
| Students | `(hrt)/students.tsx` | ✅ | Class roster with student detail link |
| Day Book | `(hrt)/daybook.tsx` | ✅ | Add/view student notes |
| CREED Ratings | `(hrt)/creed.tsx` | ✅ | Character assessment |
| Reports | `(hrt)/reports.tsx` | ✅ | View/generate reports |
| Reports Approve | `(hrt)/reports-approve.tsx` | ✅ | Comment + submit for approval |
| Parent Messages | `(hrt)/messages.tsx` | ✅ | Direct messaging |
| More | `(hrt)/more.tsx` | ✅ | Profile, switch role, sign out, links |

**User Journey:** ✅ Complete — Take attendance → Enter marks → Manage homework → Write CREED → Write day book → Generate reports → Submit for approval → Message parents

---

### 7. ST — Subject Teacher

**Tab Bar:** Home · Marks · Homework · Students · More

| Screen | File | Status | Notes |
|--------|------|--------|-------|
| Home Dashboard | `(st)/home.tsx` | ✅ | Teaching summary stats |
| Marks Entry | `(st)/marks.tsx` | ✅ | Select subject → enter marks |
| Marks Detail Entry | `(st)/marks-entry.tsx` | ✅ | Per-student mark entry |
| Marks Import | `(st)/marks-import.tsx` | ✅ | CSV bulk import (28KB) |
| Homework | `(st)/homework.tsx` | ✅ | Create assignments, view submissions |
| Students | `(st)/students.tsx` | ✅ | Students from assigned streams |
| Day Book | `(st)/daybook.tsx` | ✅ | Student notes |
| Parent Messages | `(st)/messages.tsx` | ✅ | Direct messaging |
| More | `(st)/more.tsx` | ✅ | Profile, switch role, sign out |

**User Journey:** ✅ Complete — View assigned classes → Enter/import marks → Create homework → View submissions → Day book → Message parents

---

### 8. Finance

**Tab Bar:** Home · Reports · More

| Screen | File | Status | Notes |
|--------|------|--------|-------|
| Home (Clearance) | `(finance)/home.tsx` | ✅ | Student fee status list, bulk clear |
| Student Finance Detail | `(finance)/student-finance.tsx` | ✅ | Invoices, payments, clearance toggle |
| Finance Reports | `(finance)/finance-reports.tsx` | ✅ | Revenue & collection reports |
| More | `(finance)/more.tsx` | ✅ **NEW** | Profile, switch role, sign out |

**User Journey:** ✅ Complete — View unpaid students → Clear individually or bulk → Generate reports → Sign out

---

### 9. Front Desk

**Tab Bar:** Home · Inquiries · More

| Screen | File | Status | Notes |
|--------|------|--------|-------|
| Home Dashboard | `(frontdesk)/home.tsx` | ✅ | Inquiry counts, visitors, apps stats |
| Inquiries List | `(frontdesk)/inquiries.tsx` | ✅ | Full inquiry management |
| Inquiry Detail | `(frontdesk)/inquiry-detail.tsx` | ✅ | Status updates, notes |
| Visitor Log | `(frontdesk)/visitors.tsx` | ✅ | Sign in/out visitors |
| Applications | `(frontdesk)/applications.tsx` | ✅ | Review online admissions |
| More | `(frontdesk)/more.tsx` | ✅ | Profile, switch role, sign out |

**User Journey:** ✅ Complete — Log inquiries → Track status → Sign in visitors → Review online applications → Sign out

**Public Admissions Portal:** `(public)/admissions.tsx` ✅ — Online application form, linked via admin share link

---

### 10. HR — Human Resources

**Tab Bar:** Home · Leave · Staff · More

| Screen | File | Status | Notes |
|--------|------|--------|-------|
| Home Dashboard | `(hr)/home.tsx` | ✅ | Staff count, pending leave stats |
| Leave List | `(hr)/leave.tsx` | ✅ | Pending + history, links to request/approve |
| Leave Request | `(hr)/leave-request.tsx` | ✅ | Submit own leave request |
| Leave Approve | `(hr)/leave-approve.tsx` | ✅ | Approve/reject with reason |
| Leave Balances | `(hr)/leave-balances.tsx` | ✅ | Per-staff balance tracking (265 lines) |
| Staff Directory | `(hr)/staff.tsx` | ✅ | Read-only staff listing |
| More | `(hr)/more.tsx` | ✅ Fixed | Profile, **switch role**, sign out |

**User Journey:** ✅ Complete — Dashboard → View/approve leave → Check balances → Browse staff directory → Sign out

---

### 11. Parent

**Tab Bar:** Home · Homework · Reports · Fees · More

| Screen | File | Status | Notes |
|--------|------|--------|-------|
| Home Dashboard | `(parent)/home.tsx` | ✅ | Multi-child selector, attendance, report, day book |
| Homework | `(parent)/homework.tsx` | ✅ | Per-child homework list |
| Reports | `(parent)/reports.tsx` | ✅ **Bug fixed** | Was passing `staffId` → now `parentId` |
| Fees | `(parent)/fees.tsx` | ✅ | Invoices, outstanding amounts |
| More | `(parent)/more.tsx` | ✅ **NEW** | Inbox, Messages, Announcements, Timetable, Profile, Switch Role, Sign out |
| Inbox | `(parent)/inbox.tsx` | ✅ (hidden) | Day book notes + notifications (accessible from More) |
| Messages | `(parent)/messages.tsx` | ✅ (hidden) | Chat with teachers (accessible from More) |

**User Journey:** ✅ Complete — View child dashboard → Check homework → View reports → Check fees → Read inbox → Message teachers → Sign out

---

### 12. Student

**Tab Bar:** Home · Marks · Reports · Homework · More

| Screen | File | Status | Notes |
|--------|------|--------|-------|
| Home Dashboard | `(student)/home.tsx` | ✅ | Profile card, stats, report, fees, day book notes |
| Marks | `(student)/marks.tsx` | ✅ | Grouped by subject |
| Reports | `(student)/reports.tsx` | ✅ | List with PDF viewer link |
| Homework | `(student)/homework.tsx` | ✅ | View + submit with text input |
| Attendance | `(student)/attendance.tsx` | ✅ (hidden) | Rate + records list, linked from home |
| Timetable | `(student)/timetable.tsx` | ✅ (hidden) | Re-exports shared timetable |
| Announcements | `(student)/announcements.tsx` | ✅ (hidden) | Re-exports shared announcements |
| More | `(student)/more.tsx` | ✅ Fixed | Announcements, Timetable, Profile, **Switch Role**, Sign out |

**User Journey:** ✅ Complete — View dashboard → Check marks → View reports/PDFs → Submit homework → View attendance → Read announcements → Sign out

---

## Shared / Cross-Role Screens

| Screen | File | Used By |
|--------|------|---------|
| Announcements Feed | `(app)/announcements.tsx` | All roles via re-export or link |
| Timetable Viewer | `(app)/timetable.tsx` | All roles |
| Notifications Inbox | `(app)/notifications.tsx` | All roles |
| Report PDF Viewer | `(app)/report-viewer.tsx` | Student, Parent, Admin, HRT |
| Search | `(app)/search.tsx` | Admin |
| Switch Role | `(app)/switch-role.tsx` | All multi-role users |
| Student Detail | `(app)/student/[id].tsx` | Admin, HRT, ST, Parent |

---

## Auth Flow

| Screen | File | Purpose |
|--------|------|---------|
| School Code Entry | `(auth)/school-code.tsx` | First-time school selection |
| Login | `(auth)/login.tsx` | Email/password for school users |
| Platform Login | `(auth)/platform-login.tsx` | Super admin login |

**Root Router** (`app/index.tsx`): Routes by `user.activeRole` → correct `(role)/home` screen.

---

## Consistency Checklist

| Feature | Platform | Admin | HRT | ST | Finance | FrontDesk | HR | Parent | Student |
|---------|----------|-------|-----|----|---------|-----------|----|--------|---------|
| Home dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| More/Account tab | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Profile display | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Switch Role | N/A | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sign Out | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notifications link | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Announcements link | N/A | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Timetable link | N/A | ✅ | ✅ | ✅ | N/A | ✅ | N/A | ✅ | ✅ |
| Pull-to-refresh | N/A | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Error state | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Empty state | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Loading state | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Architecture Notes

- **Role Hierarchy:** `lib/roleScope.ts` — 12 levels from student(10) to super_admin(100)
- **Feature Access Matrix:** 16 features gated by role
- **Tab Bar:** Custom `AppTabBar` component used across all layouts
- **State:** Zustand `authStore` with `switchRole()`, `signOut()`, persisted school
- **Data:** React Query with `staleTime` tuning per screen
- **Push Notifications:** Registered on app load, deep-link on tap
- **Biometric Auth:** Optional enrollment modal on app load

---

*Audit completed: April 27, 2026*
*All 12 roles now have complete user journeys with consistent navigation patterns.*
