# Performance Optimisation Plan — eScholr

**Date:** April 27, 2026  
**Goal:** Fastest possible response time, no perceptible loading states, smooth concurrent multi-user usage.

---

## Diagnosis — Root Causes of Loading States

| # | Cause | Where |
|---|---|---|
| 1 | No persisted query cache — every cold start refetches everything | `app/_layout.tsx` QueryClient is memory-only |
| 2 | 0 / 80+ mutations use optimistic updates (`onMutate`) | All hooks in `hooks/` |
| 3 | No `placeholderData: keepPreviousData` — filter/tab switches show skeletons | All queries |
| 4 | Dashboard waterfalls — 5 parallel queries per home (Admin, HRT, Parent) | All `home.tsx` files |
| 5 | Repeated heavy nested joins — `streams→grades→school_sections` in 40+ queries | All list queries |
| 6 | No realtime subscriptions — stale data for concurrent users | Entire app |
| 7 | `count: 'exact'` on dashboards — locks and slow under concurrency | Admin/Finance home |
| 8 | FlashList installed but unused — FlatList everywhere | ~20 list screens |
| 9 | Auth bootstrap waterfall: getSession → school fetch blocks splash | `app/_layout.tsx` |

---

## Phase 1 — Perceived Speed (Zero Schema Changes)

**ETA:** 1-2 days  
**Impact:** ~80% of user-visible "loading states" disappear.

### 1.1 Persist Query Cache
- Install `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` + `@react-native-async-storage/async-storage`
- Wrap `QueryClientProvider` with `PersistQueryClientProvider` in `app/_layout.tsx`
- `maxAge: 24h`, `buster: app-version`

### 1.2 QueryClient Defaults
```ts
defaultOptions: {
  queries: {
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60 * 24,      // 24h so persisted cache survives
    retry: 2,
    placeholderData: (prev) => prev,   // keepPreviousData
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    networkMode: 'offlineFirst',
  },
}
```

### 1.3 Persist Last School
- `authStore.persistSchool()` on setSchool — already partially done
- Load from storage BEFORE `getSession()` so splash hides in <200ms even on cold start

### 1.4 Optimistic Mutations (top 10)
Target hottest user actions — each gets `onMutate`, `onError` rollback, `onSettled` invalidate:
1. `useAttendance.useSubmitAttendance` — teachers mark register
2. `useMarks.useSaveMarks` — marks entry
3. `useReports.useApproveReport` — admin approves
4. `useDayBook.useCreateEntry` — daybook notes
5. `useHomework.useCreateHomework` + `useToggleComplete`
6. `useAnnouncements.useCreateAnnouncement`
7. `useLeave.useSubmitLeave` + `useApproveLeave`
8. `useStudents.useCreateStudent` + `useUpdateStudent`
9. `useFinance.useMarkPaid`
10. `useFrontDesk.useCreateInquiry`

### 1.5 FlashList Migration
Replace `FlatList` with `FlashList` + `estimatedItemSize` in:
- `(admin)/students.tsx`, `staff.tsx`, `parents.tsx`, `audit-log.tsx`, `notification-log.tsx`
- `(hrt)/attendance.tsx`, `attendance-history.tsx`, `students.tsx`
- `(parent)/reports.tsx`, `homework.tsx`, `inbox.tsx`
- `(st)/students.tsx`, `marks-entry.tsx` (if list-based)
- `(finance)/home.tsx`, `finance-reports.tsx`
- `(frontdesk)/inquiries.tsx`, `visitors.tsx`, `applications.tsx`
- `(hr)/leave.tsx`, `staff.tsx`
- `notifications.tsx`, `search.tsx`

---

## Phase 2 — Real Speed (Schema + RPC)

**ETA:** 2-3 days  
**Impact:** Server latency down 60-80%. Handles 10× more concurrent users.

### 2.1 Migration 036 — Dashboard RPCs
Replace 5-query waterfalls with single SQL call each:

- `get_admin_dashboard(p_school_id UUID)` → `{ student_count, staff_count, pending_reports, present_today, total_att_today, active_semester }`
- `get_hrt_dashboard(p_staff_id UUID, p_school_id UUID)` → `{ assignment, attendance_stats, marks_entered, total_students, day_book_recent }`
- `get_parent_dashboard(p_parent_id UUID)` → `{ children[], active_semester }`
- `get_parent_child_dashboard(p_parent_id UUID, p_child_id UUID)` → `{ report, attendance, day_book, fees }`
- `get_student_dashboard(p_student_id UUID)` → `{ attendance, marks_summary, recent_homework, released_report }`
- `get_finance_dashboard(p_school_id UUID)` → `{ outstanding_total, paid_this_month, overdue_count, recent_payments }`

All `SECURITY DEFINER` with school_id check inside.

### 2.2 Migration 037 — Denormalised Student Columns
- `ALTER TABLE students ADD COLUMN grade_name TEXT, section_name TEXT, stream_name TEXT;`
- Trigger `sync_student_names_on_stream_change()`
- Trigger `sync_student_names_on_stream_update()` (updates students when stream renamed)
- Backfill existing rows
- Remove the `streams ( name, grades ( name, school_sections ( name ) ) )` join from 40+ queries

### 2.3 Migration 038 — Composite Indexes + Materialised Stats
```sql
CREATE INDEX idx_att_school_date_status ON attendance_records(school_id, date, status);
CREATE INDEX idx_att_stream_date ON attendance_records(stream_id, date);
CREATE INDEX idx_marks_stream_sem_assess ON marks(stream_id, semester_id, assessment_type, subject_id);
CREATE INDEX idx_reports_school_status ON reports(school_id, status, semester_id);
CREATE INDEX idx_daybook_school_date ON day_book_entries(school_id, date DESC);
CREATE INDEX idx_students_school_active_stream ON students(school_id, is_active, stream_id);

-- Materialised stats (refreshed every 5 min via pg_cron if available, else edge function)
CREATE MATERIALIZED VIEW school_stats AS
  SELECT school_id, 
         COUNT(*) FILTER (WHERE status='active') as active_students,
         ...;
```

### 2.4 Wire RPCs into Dashboard Hooks
Update `useAdminDashboard`, `useHRTDashboard`, `useParentDashboard`, `useStudentDashboard`, `useFinanceDashboard` to call `.rpc(...)` once instead of `Promise.all(5)`.

---

## Phase 3 — Realtime & Concurrency

**ETA:** 1-2 days

### 3.1 Realtime Subscriptions
- `lib/realtime.ts` helper: `subscribeTable(table, filter, onChange)` that pushes into `queryClient.setQueryData`
- Subscribe in:
  - HRT attendance.tsx — listen for `attendance_records` changes on stream
  - Admin reports.tsx — listen for `reports` changes on school
  - ST marks-entry.tsx — listen for `marks` changes on assignment
  - Parent home.tsx — listen for `day_book_entries` + `reports` releases
  - Messages screens — listen for new `messages`

### 3.2 NetInfo + focusManager
- `lib/networkManager.ts` wires `@react-native-community/netinfo` to React Query `onlineManager`
- `AppState` listener → `focusManager.setFocused(...)` — refetch on app foreground

### 3.3 Auth Bootstrap Parallelism
- Start `getSession()` and `AsyncStorage.getItem('last_school')` in parallel
- Hide splash as soon as persisted school + user are loaded; refresh in background

### 3.4 expo-image Cache Policy
- Audit `Avatar.tsx` and any other `Image` usage → ensure `cachePolicy="memory-disk"`
- Add `recyclingKey` for FlashList-hosted images

---

## Phase 4 — Bundle & Rendering

**ETA:** 1 day

### 4.1 React.memo on Row Components
- `StudentRow`, `StaffRow`, `ReportRow`, `AttendanceRow`, `InquiryRow`, etc.
- Prevent re-render when parent state changes but row props don't

### 4.2 FlatList Tuning (for any that stay)
- `getItemLayout` where item height is known
- `removeClippedSubviews`, `windowSize={5}`, `initialNumToRender={10}`

### 4.3 Bundle Audit
- Verify role-group lazy loading works out-of-box with Expo Router
- Strip unused date-fns locales, unused Ionicons subsets if feasible

### 4.4 Final Smoke Test
- Measure TTI on cold start (Android mid-tier device)
- Measure tab-switch latency
- Measure mutation perceived time
- Document wins in `docs/PERFORMANCE_RESULTS.md`

---

## Concurrency Under Load — Architecture Checklist

| Risk | Mitigation | Phase |
|---|---|---|
| `count: 'exact'` lock contention | Materialised `school_stats` | 2 |
| Mass-insert stampede on attendance submit | Batch `UPSERT` in one call | 1 |
| Polling stampede every staleTime | Realtime push + longer staleTime | 3 |
| 50 concurrent admins refreshing at once | RPC consolidation + cache persistence | 1+2 |
| RLS policy evaluation per query | Fewer queries via RPC consolidation | 2 |

---

## Success Metrics

| Metric | Current (est) | Target |
|---|---|---|
| Cold start TTI | 2-4s | <1s (cached) / <1.5s (fresh) |
| Tab switch with stale data | 300-800ms skeleton | <16ms (instant) |
| Admin home dashboard load | 800-1500ms | <300ms (cached instant) |
| Attendance submit perceived time | 500-1500ms | <50ms (optimistic) |
| Scroll FPS on 500-row list | ~45 | 60 |
| Concurrent users per school supported | ~50 | 500+ |

---

## Progress Tracking
See `todo_list` in Cascade session. All 4 phases are queued.
