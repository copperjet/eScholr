# Fixes Plan — 28 Apr 2026

Source: user-supplied bug list + 13 screenshots. Grouped by surface and ordered roughly by blast-radius (auth → routing → role model → dashboards → CRUD polish).

Legend: **P0** = blocking / data-integrity, **P1** = wrong UX, **P2** = polish.

---

## 1. Auth flow

### 1.1 [P2] School-code success screen needs school logo
**Symptom (img 1):** After entering school code, transition shows a white square placeholder where the school logo should be.
**Root cause:** `app/(auth)/school-code.tsx` lines 64–68 render the eScholr scholr-logo.png with `tintColor: '#fff'` regardless of whether `school.logo_url` exists.
**Fix:** When `foundSchool.logo_url` is set, render `<Image source={{ uri: logo_url }} />` (no tint). Fall back to current scholr mark only if null. Also pass `logo_url` through `setFoundSchool({...})`.
**Files:** `app/(auth)/school-code.tsx`.

---

## 2. Role model — Platform vs School Super Admin

This is the biggest correctness issue and is **P0** — it currently lets a school user reach the platform admin dashboard.

### 2.1 [P0] School staff can be assigned the *platform* `super_admin` role
**Cause:** `app/(app)/(admin)/staff.tsx:29` lists `super_admin` in the assignable role picker. School admins should only ever assign **`school_super_admin`**. `super_admin` is reserved for eScholr platform staff.
**Fix:**
- Remove `super_admin` from `ALL_ROLES`.
- Add `school_super_admin` with label "School Super Admin".
- Migration audit: any existing `staff_roles.role = 'super_admin'` rows that belong to a school (not the platform tenant) should be migrated to `school_super_admin`. Add `040_role_and_structure.sql`-style follow-up migration `044_school_super_admin_cleanup.sql`.

### 2.2 [P0] `school_super_admin` switch-role lands on platform dashboard
**Cause:** Either (a) the user was given `super_admin` by mistake (fixed by 2.1), or (b) `app/index.tsx:19` routes `super_admin` to `/(app)/(platform)/home`. Currently `school_super_admin` correctly drops into `(admin)`. After 2.1 there should be no school account with `super_admin`. Verify by:
- Adding a guard at the top of `app/(app)/(platform)/_layout.tsx`: if `user.activeRole !== 'super_admin' || user.schoolId !== null/PLATFORM_TENANT` → `<Redirect href="/" />`. (Platform users should not have a `school_id`.)
- Adding the same defensive check to `_layout.tsx` of every other group: when active role is `super_admin` and the user lands here by mistake, force-redirect.

### 2.3 [P1] Switch Role screen shows only "Administrator" for `school_super_admin`
**Cause (imgs 3, 4):** `switch-role.tsx` is fine; the user sees only one card because their roles array only has `admin`. After 2.1 the school super admin will have `['school_super_admin', 'admin', ...]`. Add `school_super_admin` ROLE_META entry (currently missing — only `super_admin` is in the map) so its card shows correctly.
**Files:** `app/(app)/switch-role.tsx`.

### 2.4 [P1] Misleading "switch multiple rows" copy when only one role
The Switch Role description always says "You have access to multiple roles." Change to render this only when `roles.length > 1`. When only one role, show "This is your only role." Or skip the screen entirely (the avatar tap should open profile/account if there's nothing to switch). Cleanest: in every dashboard, route the avatar tap to `switch-role` only when `roles.length > 1`, otherwise to `more`.

---

## 3. Bottom-tab structure

### 3.1 [P1] Super-admin tabs: keep only Home + More (img 5)
**Current:** `(admin)/_layout.tsx` shows Home, Users, More for super.
**Fix:** When `isSuper`, hide the Users tab too — it becomes a Quick Action card on Home. Move Users target into Quick Actions.
**Files:** `app/(app)/(admin)/_layout.tsx`, `app/(app)/(admin)/home.tsx`.

### 3.2 [P1] Super-admin Home overview stats wrong (img 5, img 11)
**Current:** Hero shows "Students enrolled"; Overview cards show Staff / Reports Pending / Present Today.
**Required:** For super_admin / school_super_admin only:
- Overview cards = **Staff**, **Students**, **Teachers** (count of staff with role `hrt` or `st`).
- Hide "Students enrolled" hero (or replace with school health summary).
- Quick Actions = **Staff**, **Students**, **Parents** (the three cards from the old Users hub).
- Hide Reports / Attendance / Marks Matrix / Day Book quick actions for super (they belong to admin).
**Implementation:** Branch on `isSuper` inside `home.tsx` — render two layouts. RPC `get_admin_dashboard` already returns `staffCount` & `studentCount`; add `teacherCount` (count of staff with hrt/st role) to the RPC.
**Files:** `app/(app)/(admin)/home.tsx`, `supabase/migrations/036_dashboard_rpcs.sql` → new migration `045_admin_dashboard_teacher_count.sql` updating the function.

### 3.3 [P1] Admin Home quick actions: drop Reports / Day Book / Marks Matrix
For non-super admin (`admin`, `principal`, `coordinator`, `hod`): keep Students, Staff, Attendance only. Move Reports / Day Book / Marks Matrix exclusively into More (they already exist there, so just remove the QuickActionCard blocks for those three).
**Files:** `app/(app)/(admin)/home.tsx`.

### 3.4 [P1] Front-desk Home: drop Today's Inquiries hero + All Time row (img — front desk)
**Current:** `(frontdesk)/home.tsx` renders Today hero + All-Time stat row + Quick Actions.
**Fix:** Remove the green hero ("Today's Inquiries") and the "All Time" `STATUS_META` stat row. Quick Actions become full-width cards: **Parents**, **Students**, **Applications**. (The "Visitors In" + "New Applications" stat-like cards stay only if they're now styled as quick actions.)
**Files:** `app/(app)/(frontdesk)/home.tsx`.

### 3.5 [P1] Front-desk needs Student Records access
Front desk should be able to filter students by section/class and view records (read-only). Add `front_desk` to `ROLE_ACCESS.students` in `lib/roleScope.ts`, add a "Students" Quick Action card on FrontDesk Home that pushes a **read-only** version of the existing students list (`/(app)/(admin)/students`). Block edit/add buttons via role gate inside that screen.
**Files:** `lib/roleScope.ts`, `app/(app)/(frontdesk)/home.tsx`, `app/(app)/(admin)/students.tsx` (add role gate on FAB/edit), and add a route alias `app/(app)/(frontdesk)/students.tsx` that re-uses the component or pushes to admin route.

---

## 4. Add Student / Import Students

### 4.1 [P1] "Save" button label wraps to "Sa\nve" (img 7)
**Cause:** `student-add.tsx:144` button is too narrow; ScreenHeader right-slot collapses width.
**Fix:** Set `minWidth: 64`, remove dynamic `flex` on right slot, or change copy to a checkmark icon button. Also add a sticky bottom **Save Student** primary button (full-width) so users don't miss it — fixes the user complaint that "there is no way to confirm or submit".
**Files:** `app/(app)/(admin)/student-add.tsx` (header right + new bottom CTA).

### 4.2 [P1] Student number should auto-assign
**Cause:** Student-add forces manual entry of `studentNumber` and marks it required.
**Fix:**
- Create RPC `next_student_number(p_school_id uuid)` that returns max(numeric_part)+1 padded to 4 digits. Migration `046_next_student_number.sql`.
- On screen mount, call RPC and pre-fill `studentNumber`. Allow override (admin can still type a different one) but no longer required for save (`canSave` keeps the trim check but the field is auto-populated).
- Same auto-fill should run inside `student-import.tsx` for any rows where `student_number` is blank.

### 4.3 [P1] CSV template — change copy and behaviour
**Cause (img 6):** `student-import.tsx:153` writes file to `FileSystem.cacheDirectory` then alerts "Template saved to device cache". Users expect a real download / share.
**Fix:** After writing, call `Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Save student template' })` so they get the OS share/save sheet. Remove the device-cache alert. Add fallback: if Sharing unavailable, show success snackbar with the file path.
**Files:** `app/(app)/(admin)/student-import.tsx`. Add `expo-sharing` import (already in deps; verify in `package.json`).

---

## 5. Teacher dashboards (HRT / ST)

### 5.1 [P0] HRT shows "Could not load dashboard" (img 12, 13)
**Cause:** `useHRTDashboard` throws `'No HRT assignment found'` if `payload.assignment` is null. This is a *data* state, not a network error, but it's surfaced as a generic error screen.
**Fix:** Replace the error path: when `assignment` is null, render an `EmptyState` instead — "You haven't been assigned to a class yet. Ask your administrator to assign you in HRT/ST Assignments." Keep the network error path for `error.message` cases.
**Files:** `app/(app)/(hrt)/home.tsx`, `app/(app)/(st)/home.tsx`.

### 5.2 [P1] HRT/ST Assignments screen shows "Could not load…"
**Cause:** `assignments.tsx` `useAssignmentData` calls `.from('semesters')…single()` which throws `PGRST116` if no active semester exists. Also fails if RLS hides the row.
**Fix:** Use `.maybeSingle()`; when null, render an empty state with a CTA "No active semester. Create one in Calendar & Events." Same pattern for any teacher-side screen that depends on the active semester.
**Files:** `app/(app)/(admin)/assignments.tsx`, audit `app/(app)/(hrt)/marks.tsx`, `app/(app)/(st)/marks.tsx`, `app/(app)/(hrt)/reports.tsx`, etc.

### 5.3 [P1] HRT Quick Actions: should be Attendance, Day Book, Marks
**Current:** Marks, Students, Reports, Day Book.
**Fix:** Replace with three actions — Attendance (links to `/(hrt)/attendance`), Day Book, Marks. Drop Students+Reports cards (still available via More tab).
**Files:** `app/(app)/(hrt)/home.tsx`.

### 5.4 [P1] Notifications screen "Could not load" (img 8) and Assignments empty state (imgs 9, 10)
**Cause:** Same root cause class as 5.2 — queries throw when there's nothing to show, instead of returning `[]`.
**Fix:** Audit `useNotifications` hook and `assignments` query: convert `single()`→`maybeSingle()`; treat empty data as success with empty array; only show error UI on real network/RLS errors.
**Files:** `hooks/useNotifications.ts` (verify), `app/(app)/notifications.tsx`, `app/(app)/(hrt)/homework.tsx` / `(st)/homework.tsx`.

---

## 6. Staff invites & deactivation

### 6.1 [P1] Relabel "Send Invite" → "Generate Login Password"
The edge function `invite-user` already creates the user with a temp password and returns it. Relabel the UI: button "Generate Login Password", confirm dialog "Generate a login for {name}?", success modal "Password generated — share this with the user: `<code>{temp_password}</code>` (must change on first sign-in)".
**Files:** `app/(app)/(admin)/staff.tsx` lines 489–500 + 211–217.

### 6.2 [P1] Hard-delete user vs soft deactivate
**Current:** Toggle status flips `active`/`inactive`. There is no hard delete and no clear reactivation affordance (it works but the user didn't notice).
**Fix:**
- Keep `Deactivate ↔ Reactivate` (already works) — just make the icon/label always show the inverse state (already does).
- Add a **separate** destructive action **only visible to super_admin / school_super_admin** in the staff detail sheet: "Delete account permanently". This:
  1. Calls a new edge function `delete-user` that:
     - Reassigns or nulls FK references in dependent tables (audit_log, daybook_entries, etc.) — most already are `ON DELETE SET NULL`. Verify in `043_parent_access_and_integrity.sql`.
     - Deletes the `staff` / `parents` / `students` row.
     - Deletes the auth user via `admin.auth.admin.deleteUser()`.
  2. Shows confirm dialog with typed-name verification.
- Same option for parents and students rows.
**Files:** new `supabase/functions/delete-user/index.ts`, `app/(app)/(admin)/staff.tsx`, `app/(app)/(admin)/parents.tsx`, `app/(app)/(admin)/students.tsx`. New migration `047_cascade_audit.sql` if any FK still uses RESTRICT.

---

## 7. Admin/Principal/Coordinator/HOD = the same dashboard?

The user wants:
- **Subject teacher (st)** sees only the *one* class+subject combos they teach.
- **HRT** sees only the one homeroom class they own. Inside that class they should be able to filter by subject and access subject-specific marks/students.
- **HOD / coordinator / principal** see *multiple* classes — they pick a class from a list, then see the same per-class views.
- HOD should be just an HRT-with-tag, but with multi-class scope.

### 7.1 [P1] Build a shared "Class View" screen
Create `app/(app)/(shared)/class/[streamId].tsx` that shows: Students | Subjects (filterable) | Marks | Attendance | Day Book — for one class. This is the *unit* view all four roles share.
- HRT lands directly on their assigned stream's class view.
- HOD / coordinator / principal land on a **class picker** first (list of streams scoped to their access). Tapping a stream pushes the class view.
- Subject teacher is unchanged — they keep their existing per-subject screens.

### 7.2 [P1] Class picker for HOD/coord/principal
New screen `app/(app)/(admin)/classes.tsx` that lists all streams (filterable by section/grade). HOD = restricted to streams whose subjects are in their department; coordinator/principal = all streams in the school. Add to admin Home Quick Actions for these roles only.

### 7.3 [P1] Calendar / Events / Settings missing for school admin
**Cause:** `(admin)/more.tsx` already exposes "Calendar & Events" gated by `calendar_events` access, which currently allows only `super_admin` and `school_super_admin`. The user wants school admin to see these too in their **own** dashboard.
**Fix:** Either grant `calendar_events` to `admin` in `roleScope.ts`, or add a separate read-only entry. Same for "School Structure" (sections/classes) — admin should see this if super hasn't yet configured it. Decision: extend `school_structure` and `calendar_events` to include `admin`. (HOD/coord/principal stay read-only via in-screen gate.)
**Files:** `lib/roleScope.ts`, plus per-screen role checks for write actions.

---

## 8. Cross-cutting / nice-to-haves

- [P2] Make the avatar tap in dashboards open `switch-role` only when `roles.length > 1`, else open `more`.
- [P2] Tag HOD users with a small "HOD · {department}" pill on their Home next to the greeting.

---

## Suggested execution order

1. **2.1 + 2.2** — close the platform-admin escalation hole.
2. **5.1 + 5.2 + 5.4** — quick wins: turn "Could not load" empty-states into helpful copy.
3. **3.1 → 3.5** — tab/quick-action restructure (purely UI).
4. **6.1 + 6.2** — relabel invite + add hard delete.
5. **4.1 + 4.2 + 4.3** — student add/import polish + RPC.
6. **5.3** — HRT quick actions.
7. **7.1 → 7.3** — biggest scope: shared class view + class picker. Last.
8. **1.1, 2.3, 2.4** — auth/switch-role polish.
9. **8.\*** — nice-to-haves.

## New migrations / edge functions to create

- `supabase/migrations/044_school_super_admin_cleanup.sql` — migrate any school-tenant `super_admin` rows to `school_super_admin`.
- `supabase/migrations/045_admin_dashboard_teacher_count.sql` — add `teacherCount` to `get_admin_dashboard`.
- `supabase/migrations/046_next_student_number.sql` — RPC for auto student numbers.
- `supabase/migrations/047_cascade_audit.sql` — verify ON DELETE SET NULL across dependents (only if 6.2 audit finds RESTRICT FKs).
- `supabase/functions/delete-user/index.ts` — hard delete.

## Open questions for the user

1. Should "Generate Login Password" send the temp password by email automatically, or **only** show it on screen for the admin to copy?
2. For hard delete, do we want a 30-day soft-delete window (recoverable) or true immediate deletion?
3. Should `school_super_admin` be able to onboard a new school, or is that platform-only? (Currently `onboard_school` is platform-only — good.)
4. For class view (7.1), do you want subject teachers to land on the class view too (filtered to their subject only) for consistency, or keep their current per-subject UI?
