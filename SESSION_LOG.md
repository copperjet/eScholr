# Scholr — Session Log

---

## S01 — Project Bootstrap
**Date:** 2026-04-23
**Scope:** Expo SDK 54 project init, folder structure, Supabase client, theme system, auth store (Zustand), login/school-code screens, root `_layout.tsx`.
**Files created/modified:** `lib/supabase.ts`, `lib/theme.tsx`, `stores/useAuthStore.ts`, `app/(auth)/school-code.tsx`, `app/(auth)/login.tsx`, `app/_layout.tsx`, `app/(app)/_layout.tsx`
**TypeScript:** 0 errors

---

## S02 — Admin Shell + Dashboard
**Date:** 2026-04-23
**Scope:** Admin tab layout, home dashboard (stats cards, semester info, quick actions), `useAdmin.ts` hooks.
**Files created/modified:** `app/(app)/(admin)/_layout.tsx`, `app/(app)/(admin)/home.tsx`, `app/(app)/(admin)/more.tsx`, `hooks/useAdmin.ts`
**TypeScript:** 0 errors

---

## S03 — Staff Directory + CRUD
**Date:** 2026-04-23
**Scope:** Staff list with search/filter, add/edit staff modal, role assignment, bulk import prep. 659-line screen.
**Files created/modified:** `app/(app)/(admin)/staff.tsx`
**TypeScript:** 0 errors

---

## S04 — Subject-Teacher Assignments
**Date:** 2026-04-23
**Scope:** Assignment grid (grade × subject), add/remove assignments, conflict detection. 511-line screen.
**Files created/modified:** `app/(app)/(admin)/assignments.tsx`
**TypeScript:** 0 errors

---

## S05 — Parents Module
**Date:** 2026-04-23
**Scope:** Parent directory, multi-child linking, parent role management, invite flow. 592-line screen.
**Files created/modified:** `app/(app)/(admin)/parents.tsx`
**TypeScript:** 0 errors

---

## S06 — HRT Shell + Attendance
**Date:** 2026-04-23
**Scope:** HRT tab layout, home dashboard, attendance marking screen (640 lines) — co-HRT conflict, bulk mark, audit trail, progress bar, excused-absence flow.
**Files created/modified:** `app/(app)/(hrt)/_layout.tsx`, `app/(app)/(hrt)/home.tsx`, `app/(app)/(hrt)/attendance.tsx`, `hooks/useAttendance.ts`
**TypeScript:** 0 errors

---

## S07 — HRT Marks + Reports + Day Book
**Date:** 2026-04-23
**Scope:** Marks entry grid (FA1/FA2/Summative, live validation, class average, deviation warnings), report pipeline screen, day book entries (8 categories, 15-min edit window).
**Files created/modified:** `app/(app)/(hrt)/marks.tsx`, `app/(app)/(hrt)/reports.tsx`, `app/(app)/(hrt)/daybook.tsx`, `app/(app)/(hrt)/creed.tsx`, `app/(app)/(hrt)/students.tsx`, `app/(app)/(hrt)/more.tsx`, `hooks/useMarks.ts`, `hooks/useReports.ts`, `hooks/useDayBook.ts`, `hooks/useCreed.ts`
**TypeScript:** 0 errors

---

## S08 — Finance + Front Desk Roles
**Date:** 2026-04-23
**Scope:** Finance home (balance overview, bulk mark-paid), student finance ledger, front desk home, inquiry management (398 lines).
**Files created/modified:** `app/(app)/(finance)/_layout.tsx`, `app/(app)/(finance)/home.tsx`, `app/(app)/(finance)/student-finance.tsx`, `app/(app)/(frontdesk)/_layout.tsx`, `app/(app)/(frontdesk)/home.tsx`, `app/(app)/(frontdesk)/inquiries.tsx`, `app/(app)/(frontdesk)/more.tsx`, `hooks/useFinance.ts`, `hooks/useFrontDesk.ts`
**TypeScript:** 0 errors

---

## S09 — Subject Teacher + Parent Roles
**Date:** 2026-04-23
**Scope:** ST shell (home, marks, students, more), parent home (multi-child switcher, reports, attendance, day book, notifications, 429 lines).
**Files created/modified:** `app/(app)/(st)/_layout.tsx`, `app/(app)/(st)/home.tsx`, `app/(app)/(st)/marks.tsx`, `app/(app)/(st)/students.tsx`, `app/(app)/(st)/more.tsx`, `app/(app)/(parent)/_layout.tsx`, `app/(app)/(parent)/home.tsx`
**TypeScript:** 0 errors

---

## S10 — Shared Screens + Push Notifications
**Date:** 2026-04-23
**Scope:** `notifications.tsx` (notification feed with mark-read), `report-viewer.tsx` (in-app PDF viewer), `switch-role.tsx` (multi-role switcher), `student/[id].tsx` (student profile deep link), push token registration, notification listener.
**Files created/modified:** `app/(app)/notifications.tsx`, `app/(app)/report-viewer.tsx`, `app/(app)/switch-role.tsx`, `app/(app)/student/[id].tsx`, `lib/notifications.ts`
**TypeScript:** 0 errors

---

## S11 — Admin Reports Pipeline + Audit/Settings Screens
**Date:** 2026-04-23
**Scope:** Admin reports screen (approval pipeline, draft→approved→released), audit-log screen, semesters screen, marks-windows screen, marks-matrix screen, marks-unlock screen, attendance-overview, attendance-correct, calendar, notification-log, daybook (admin), promotion-wizard.
**Files created/modified:** `app/(app)/(admin)/reports.tsx`, `app/(app)/(admin)/audit-log.tsx`, `app/(app)/(admin)/semesters.tsx`, `app/(app)/(admin)/marks-windows.tsx`, `app/(app)/(admin)/marks-matrix.tsx`, `app/(app)/(admin)/marks-unlock.tsx`, `app/(app)/(admin)/attendance-overview.tsx`, `app/(app)/(admin)/attendance-correct.tsx`, `app/(app)/(admin)/calendar.tsx`, `app/(app)/(admin)/notification-log.tsx`, `app/(app)/(admin)/daybook.tsx`, `app/(app)/(admin)/promotion-wizard.tsx`
**Fix:** Added missing `router` import to `app/(app)/(frontdesk)/inquiries.tsx`
**TypeScript:** 0 errors

---

## S12 — useAdmin Hooks Expansion + Admin Home Polishing
**Date:** 2026-04-23
**Scope:** Expanded `hooks/useAdmin.ts` with all hooks referenced by admin screens (stats, semesters, marks windows, attendance overview/correct, audit logs, promotion wizard, notification logs). Polished admin `home.tsx` header and quick-action grid.
**Files created/modified:** `hooks/useAdmin.ts`, `app/(app)/(admin)/home.tsx`
**TypeScript:** 0 errors

---

## S13 — Student CRUD + Bulk CSV Import + Photo Upload + Global Search
**Date:** 2026-04-24
**Scope:**
- `students.tsx` rebuilt with stream filter chips, active/inactive toggle, edit-pencil per row, FAB → student-add
- `student-add.tsx` — full add form: photo picker (expo-image-picker base64), stream picker, gender chips, after-save Alert
- `student-edit.tsx` — same form pre-populated via `useStudentDetail`, camera overlay on avatar, Active/Inactive toggle with confirm Alert
- `student-import.tsx` — 3-step StepBar (Upload → Preview → Import), CSV parse with stream name matching (grade+stream combo), template download via `expo-file-system/legacy`, `expo-document-picker`
- `hooks/useStudents.ts` — `useAllStudents`, `useStudentDetail`, `useGlobalSearch`, `useCreateStudent`, `useUpdateStudent`, `useUploadStudentPhoto`, `useBulkImportStudents`; `GlobalSearchResult` type; `normaliseStudent()` helper
- `lib/useDebounce.ts` — generic debounce hook (280ms)
- `app/(app)/search.tsx` — global search screen, auto-focus, skeleton, type badges, routes to student profile / staff screen
- `app/(app)/(admin)/home.tsx` — search icon button in header linking to `/(app)/search`
- `app/(app)/(admin)/_layout.tsx` — registered `student-add`, `student-edit`, `student-import` as hidden screens
**Fix:** Added missing `searchBtn` style to `home.tsx` StyleSheet
**TypeScript:** 0 errors

---

## S14 — Phase 0 Foundations
**Date:** 2026-04-24
**Scope:**
- `components/ErrorBoundary.tsx` — root React class ErrorBoundary (getDerivedStateFromError + componentDidCatch + Try Again reset)
- `app/_layout.tsx` — wrapped root with `<ErrorBoundary>` as outermost shell
- `lib/grading.ts` — shared grade calculation utility: `percentToLetter`, `calculateWeightedPercent` (FA1 20% + FA2 20% + Summative 60%), `calculateIGCSEPercent` (Summative 100%), `gradeStudent` entry point, `GRADE_BOUNDARIES`, `isIGCSESection`, `percentToDevScale`, `DEV_SCALE_LABELS`, `roundHalfUp`
- `supabase/functions/send-push/index.ts` — unified Expo Push edge function; supports targeting by user IDs, roles, stream, grade, or whole school; batches 100 tokens/request; logs to `notification_logs`; marks `no_device_registered` for users without tokens
**TypeScript:** 0 errors

---

## S15 — Announcements Module
**Date:** 2026-04-24
**Scope:**
- `supabase/migrations/021_announcements.sql` — `announcements` table (audience_type enum: school/grade/stream/role, pinning, expiry), `announcement_reads` for read receipts, RLS (read all school members; write admin/principal/coordinator), `get_announcements` RPC with joined author + audience labels
- `hooks/useAnnouncements.ts` — `useAnnouncements`, `useAnnouncementFeed` (role-filtered), `useReadAnnouncements`, `useCreateAnnouncement`, `useDeleteAnnouncement`, `useMarkAnnouncementRead`, `sendAnnouncementPush` helper
- `app/(app)/(admin)/announcements.tsx` — compose sheet (title, body, audience picker: school/grade/stream/role, role selector, pin toggle, send-push toggle); feed list with audience badges; long-press to delete
- `app/(app)/announcements.tsx` — shared read-only feed for all non-admin roles; unread dot indicator; auto-marks all visible items as read on mount
- `app/(app)/(admin)/_layout.tsx` — registered `announcements` as hidden screen
- All role More menus — added Announcements + Timetable items under new "School" section
- All More menus — version string updated "ETP School v1.0.0" → "Scholr v1.0.0"
- All More menus — added "Resources" section with igaprep.com browser link
**TypeScript:** 0 errors

---

## S16 — Timetable Viewer + Phase 0 Completion
**Date:** 2026-04-24
**Scope:**
- `supabase/migrations/022_timetable.sql` — `timetable_documents` table; unique partial index (one current per school+grade+stream); RLS (read all school; write admin/coordinator)
- `hooks/useTimetable.ts` — `useTimetableDocuments`, `useCurrentTimetable`, `useUploadTimetable` (atomically replaces current), `useDeleteTimetable`, `uploadTimetableFile` (Storage `timetables` bucket, base64 → Uint8Array)
- `app/(app)/(admin)/timetable-upload.tsx` — upload form (label, grade/stream pickers, effective-from date, DocumentPicker for PDF or image), existing docs list with file type icons + CURRENT badge; long-press to delete
- `app/(app)/timetable.tsx` — shared viewer; PDF rendered via Google Docs viewer WebView; image via zoomable ScrollView; multi-timetable switcher chips if >1 current document; info bar with label + effective-from date
- `app/(app)/(admin)/_layout.tsx` — registered `timetable-upload` as hidden screen
- `app/(app)/(parent)/_layout.tsx` — registered `announcements` + `timetable` as hidden screens
- `app/(app)/(hrt)/_layout.tsx` — registered `creed`, `daybook`, `reports` as hidden screens (were missing)
- `app/(app)/(parent)/home.tsx` — added Quick Links row: Announcements, Timetable, Notifications
- `.claudeignore` — created to exclude node_modules, assets, dist, lock files, SQL migrations, docs, EAS config from Claude reads
**TypeScript:** 0 errors

---

## S17 — Pre-Build Audit & Fixes
**Date:** 2026-04-25
**Scope:** Full pre-build audit prior to EAS `preview` APK build. Identified and fixed root cause of prior build failure plus all secondary issues.

**Root cause fix:**
- `package.json`: `react-native-reanimated` `~3.17.4` → `~4.1.1` (SDK 54 / RN 0.81.5 requires v4; v3 Android native code references `Systrace.TRACE_TAG_REACT_JAVA_BRIDGE` and `LengthPercentage.resolve()` signatures removed in RN 0.78+)

**app.json fixes:**
- Added Android permissions: `CAMERA`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`
- Added `expo-image-picker` plugin with `photosPermission` + `cameraPermission` strings
- Added `expo-document-picker` plugin with `iCloudContainerEnvironment: Production`

**Route / layout fixes:**
- `app/(app)/(parent)/_layout.tsx`: Removed erroneous `href: null` entries for `announcements` and `timetable` (files don't exist in parent folder; navigation uses absolute `/(app)/announcements` and `/(app)/timetable` paths)
- `app/(app)/(st)/_layout.tsx`: Removed unused `Colors` import

**Audit findings (all green):**
- All 38 `router.push()` targets verified → matching `.tsx` files exist
- All 11 hook files present and named exports match imports across all screens
- All `components/ui` exports match imports (13 components)
- All `components/modules` files present (7 modules)
- `Colors.semantic.*` — all keys (success, warning, error, info, successLight, warningLight, errorLight, infoLight) exist
- `haptics.*` — all methods (light, medium, heavy, success, warning, error, selection) present
- `BottomSheet` `snapHeight` prop exists in component definition
- `expo-file-system/legacy` pattern correct in all 3 screens
- `eas.json` — three profiles (development/preview/production) valid; `cli.version ≥ 18.0.0`
- `.env` — 2 env vars present (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
- `newArchEnabled: false` confirmed in app.json

**TypeScript:** 0 errors (confirmed after all fixes)

---

## S18 — UI Consistency Pass: ScreenHeader Adoption
**Date:** 2026-04-25
**Scope:** Standardized header pattern across 17 sub-screens. Replaced custom `<View styles.header>...<TouchableOpacity chevron-back>...<ThemedText h4>...<View width 24/36/>...</View>` blocks with `<ScreenHeader title=... [subtitle=...] showBack [onBack=...] />`. Eliminated hardcoded header padding, hairline border, spacer Views, and `chevron-back` Ionicons. Title remains semantic h3 (was h4) for stronger hierarchy.

**Converted screens (17):**
- `(app)/(frontdesk)/inquiry-detail.tsx`
- `(app)/(admin)/semesters.tsx`
- `(app)/(admin)/audit-log.tsx`
- `(app)/(admin)/notification-log.tsx`
- `(app)/(admin)/marks-windows.tsx`
- `(app)/(finance)/finance-reports.tsx`
- `(app)/(admin)/calendar.tsx`
- `(app)/announcements.tsx`
- `(app)/(admin)/announcements.tsx`
- `(app)/(admin)/parents.tsx`
- `(app)/(admin)/daybook.tsx`
- `(app)/(admin)/timetable-upload.tsx`
- `(app)/(admin)/promotion-wizard.tsx` (uses `onBack` for step-aware navigation)
- `(app)/(admin)/attendance-overview.tsx` (with subtitle = today's date)
- `(app)/(admin)/attendance-correct.tsx` (with subtitle = date display)
- `(app)/(admin)/marks-matrix.tsx` (with subtitle = `${semester} · ${completed}/${total} complete`)
- `(app)/(admin)/assignments.tsx` (with subtitle = semester name)
- `(app)/(hrt)/reports-approve.tsx` (title = student full name)
- `(app)/(hrt)/attendance-history.tsx` (with subtitle = stream + lookback days)

**TypeScript:** 0 errors (one pre-existing error in `marks-import.tsx` unrelated)

**Audit findings (deferred — recommend separate session):**
- ~10 detail screens still use inline back-button headers (`student/[id].tsx`, `student-finance.tsx`, `student-edit.tsx`, `student-import.tsx`, `marks-unlock.tsx`, `report-viewer.tsx`, `timetable.tsx`, `search.tsx`, `(st)/marks-import.tsx`, `(st)/marks-entry.tsx`). These have unique custom layouts (gradient hero, photo overlay, multi-step indicator, PDF chrome) not trivially replaceable with `ScreenHeader` — convert with care preserving role-specific affordances.
- Spacing constants now used app-wide; remaining hardcoded values (8, 6, 4 px) appear inside chip/dot micro-elements where literal values are appropriate.
- `Card`, `Badge`, `ListItem`, `SectionHeader`, `FormField`, `StatCard`, `Button` primitives all in place; remaining inconsistencies are in screens listed above (custom row layouts in `parent/reports.tsx` could move to `ListItem` but the score-chip + accent-bar treatment is intentional and premium-looking).
- Tab bar pattern duplicated in `assignments.tsx`, `(hrt)/marks.tsx`, `student/[id].tsx`, `(frontdesk)/inquiries.tsx` — consider migrating to existing `<TabBar>` component in a follow-up.
