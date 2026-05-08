# EduCore SMS — Implementation Plan

> Version: 1.0 | Date: April 2026 | Status: Pre-development

---

## 1. Guiding Principles (Non-Negotiable)

| Law | Rule |
|-----|------|
| 3-Tap Rule | No common task > 3 taps. Governs every screen decision. |
| Optimistic UI | Show result immediately. Revert silently on failure. No spinners. |
| Skeleton screens | Every screen has a skeleton. No blank voids. |
| Dark mode | Light + dark tokens from day 1. No retrofit. |
| RLS | Every table has `school_id`. Supabase RLS enforces isolation. No exceptions. |
| Empty states | Every screen has an intentional, illustrated empty state. |
| Error states | Human-readable, actionable. Never technical. |

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native (Expo SDK 52+) |
| Navigation | Expo Router (file-based) |
| State | Zustand (local) + React Query / TanStack (server state) |
| Backend / DB | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (JWT with school_id + role claims) |
| Serverless | Supabase Edge Functions (Deno) |
| Push | Expo Push Notifications + FCM (Android) + APNs (iOS) |
| PDF | Puppeteer (server-side, Edge Function or Docker) |
| QR | `qrcode` npm package (server-side) |
| Storage | Supabase Storage (per-school bucket) |
| Biometric | `expo-local-authentication` |
| Haptics | `expo-haptics` |
| UI Library | Custom design system (no heavy library) |
| Icons | `@expo/vector-icons` (Ionicons) |
| Animation | `react-native-reanimated` + `react-native-gesture-handler` |

---

## 3. Project Structure

```
educore/
├── app/                        # Expo Router screens
│   ├── (auth)/                 # Login, onboarding
│   ├── (app)/                  # Authenticated shell
│   │   ├── (hrt)/              # Homeroom Teacher screens
│   │   ├── (st)/               # Subject Teacher screens
│   │   ├── (admin)/            # Admin screens
│   │   ├── (finance)/          # Finance screens
│   │   ├── (parent)/           # Parent screens
│   │   ├── (frontdesk)/        # Front desk screens
│   │   └── student/[id]/       # Unified student profile (tabbed)
├── components/                 # Shared UI components
│   ├── ui/                     # Design system primitives
│   └── modules/                # Feature-level components
├── lib/
│   ├── supabase.ts             # Client + typed helpers
│   ├── auth.ts                 # Auth logic + biometric
│   ├── notifications.ts        # Push + in-app
│   └── haptics.ts              # Haptic wrapper
├── stores/                     # Zustand stores
├── hooks/                      # React Query hooks per module
├── types/                      # DB types (generated from Supabase)
├── constants/                  # Colors, spacing, typography tokens
└── supabase/
    ├── migrations/             # DB migrations
    ├── functions/              # Edge Functions
    └── seed/                   # Demo school seed data
```

---

## 4. Design System Foundation (Build First)

Before any feature screen, build these primitives. Every screen uses them.

### 4.1 Color Tokens
```
// Light mode
background: #FFFFFF
surface: #F9FAFB
surface-secondary: #F3F4F6
border: #E5E7EB
text-primary: #1B2A4A
text-secondary: #374151
text-muted: #9CA3AF

// Dark mode
background: #111827
surface: #1F2937
surface-secondary: #374151
border: #374151
text-primary: #F9FAFB
text-secondary: #D1D5DB

// Brand (school-injected at runtime)
brand-primary: [from school config]
brand-secondary: [from school config]

// Semantic
success: #10B981
warning: #F59E0B
error: #EF4444
info: #3B82F6
```

### 4.2 Attendance Status Colors
```
Present:  #10B981 (green)
Late:     #F59E0B (amber)
Absent:   #EF4444 (red)
AP:       #3B82F6 (blue)
Sick:     #8B5CF6 (purple)
```

### 4.3 Core Components to Build
- `<Text>` — themed variants (h1–h4, body, caption, label)
- `<Card>` — surface with optional accent strip
- `<Button>` — primary / secondary / ghost / danger
- `<FAB>` — floating action button with brand color
- `<BottomSheet>` — reusable swipeable sheet
- `<Skeleton>` — animated loading placeholder
- `<Badge>` — status indicator
- `<Avatar>` — photo + fallback initials
- `<SearchBar>` — debounced global search input
- `<EmptyState>` — illustrated empty screen component
- `<ErrorState>` — retry-enabled error component
- `<ProgressBar>` — marks/attendance progress

---

## 5. Database Schema Strategy

### 5.1 Multi-Tenancy Pattern
Every table follows this pattern:
```sql
CREATE TABLE table_name (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  -- ... fields
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school_isolation" ON table_name
  USING (school_id = (auth.jwt() -> 'app_metadata' ->> 'school_id')::uuid);
```

### 5.2 Migration Order
Build migrations in this order (each depends on the prior):

1. `001_schools` — School, SchoolConfig, SubscriptionPlan
2. `002_academic_structure` — SchoolSection, Grade, Stream, Subject, GradeSubjectAssignment
3. `003_academic_year` — AcademicYear, Semester, CalendarEvent
4. `004_grading` — GradingScale, AssessmentTemplate, CharacterFramework
5. `005_users` — Staff, Parent, BiometricSession
6. `006_students` — Student, StudentYearRecord, EmergencyContact, SubjectEnrollment
7. `007_assignments` — SubjectTeacherAssignment, HRTAssignment
8. `008_attendance` — AttendanceRecord, ExcusedAbsenceRequest
9. `009_marks` — Mark, MarkAuditLog, MarkNote, BiweeklyRecord
10. `010_character` — CharacterRecord
11. `011_reports` — Report, ReportVersion, ReportTemplate
12. `012_daybook` — DayBookEntry
13. `013_finance` — FinanceRecord, PaymentTransaction
14. `014_notifications` — NotificationLog
15. `015_audit` — AuditLog
16. `016_inquiry` — Inquiry
17. `017_rls_policies` — All RLS policies (separate migration for clarity)
18. `018_demo_seed` — Pre-seeded demo school tenant

### 5.3 JWT Claims Strategy
JWT `app_metadata` must contain:
```json
{
  "school_id": "uuid",
  "roles": ["hrt", "st"],
  "active_role": "hrt"
}
```
RLS reads `school_id` from JWT — not from a session variable. This is the security foundation.

---

## 6. Build Phases

### Phase 0 — Foundation (Week 1-2)
**Goal:** Infrastructure is live. CI/CD works. Design system exists.

- [ ] Supabase project created, migrations 001–018 applied
- [ ] RLS policies verified with role-specific test users
- [ ] Expo project initialized with Expo Router
- [ ] Design system tokens + core components built
- [ ] Auth flow: School code → branding → login → JWT
- [ ] Biometric auth wired (`expo-local-authentication`)
- [ ] Navigation shell: role-based tab bar
- [ ] Theme provider: light/dark + brand color injection
- [ ] Demo school seeded with realistic data

### Phase 1 — Board Demo Build (Week 3-4)
**Goal:** Polished 20-minute board demo. Ship this first.

Screens needed (pre-seeded data, no real CRUD required):

1. **Login screen** — School code entry → branding loads → email/password
2. **HRT Home dashboard** — Attendance status card, marks progress, reports status
3. **Attendance Register** — Student list with FAB "Mark All Present", bottom-sheet status picker, haptics
4. **Attendance submitted** — Success confirmation with animation
5. **Student report card PDF** — Full PDF with branding, CREED, subject teacher names, QR code
6. **Parent Home** — Child switcher, report notification card, attendance bar, Day Book entries
7. **Report viewer** — PDF rendered in-app

Demo deliverable: demo.apk + demo.ipa (or Expo Go link)

### Phase 2 — MVP Core (Week 5-12)
Build modules in dependency order:

#### Sprint 1 (Week 5-6): Auth + Students + Search
- Full auth flow with role switcher, biometric, rate limiting
- Student CRUD + bulk CSV import + photo upload
- Global search (debounced, <300ms, all roles)
- Unified Student Profile (tabbed: Overview, Marks, Reports, Attendance, Day Book, Fees, History)
- Emergency contact (required at enrollment)

#### Sprint 2 (Week 7-8): Attendance
- Daily register (HRT view)
- Mark All... FAB with bottom sheet (all 5 statuses)
- Status bottom sheet (replaces cycling — U1 spec)
- Attendance submission + lock
- Two-HRT conflict resolution (C3 spec)
- Admin override + correction with note
- Absence push notification → parent (enriched F5 format)
- Deep link: notification → register screen
- Attendance threshold alert (Feature #9)
- Exam period register behaviour (F6)

#### Sprint 3 (Week 9-10): Marks + CREED
- Marks entry window enforcement (banner + read-only outside window)
- Subject teacher mark entry (FA1, FA2, Summative per section)
- Live class average banner (UX Gap #29)
- Out-of-range input prevention (F7)
- Mark save micro-interaction (U3)
- Keyboard navigation Next/Done (U5)
- N/A mark status (excused — S3)
- Marks bulk import with column-mapping wizard + preview diff
- CREED entry by HRT
- Marks progress indicator (dashboard + report workflow)
- Mark correction flow (admin unlock → report reverts → re-approval)

#### Sprint 4 (Week 11-12): Reports + Finance + Day Book
- Report generation (Puppeteer Edge Function)
  - Header, subject table, CREED, attendance, teacher comment, QR code
  - DRAFT watermark on preview (Feature #11)
  - Subject teacher names on report (Feature #21)
  - ReportVersion entity on re-approval
  - Parent notification on release (deep link)
- Report workflow: Preview → Approve → Finance Gate → Release
- Finance module: paid/unpaid per student, bulk clear, payment history (U2)
- Day Book: create, 15-min edit window, send-to-parent, expanded categories (F2)
- In-app notification inbox (bell icon, badge, 90-day retention)
- Notification delivery log (admin view)

#### Sprint 5 (Week 13-14): Admin Tools + Front Desk + Polish
- Academic year + semester management
- Marks window open/close
- Staff management (CRUD, role assignment, stream/subject assignment)
- Parent management (welcome email trigger)
- Year-end promotion wizard (Promote / Graduate / Repeat Year)
- IGCSE subject selection + lock rules
- Front desk: Inquiry CRM, inquiry → enrollment conversion (S4)
- Academic calendar (events, holidays, exam periods)
- Audit trail viewer (filterable, CSV export)
- App version enforcement (cold start check)
- All empty states + error states per spec Sections 4.4/4.5

### Phase 3 — Multi-School & Platform Admin (Post-Launch)
- Platform Super Admin panel (web, not mobile)
- School onboarding wizard (10-step)
- Subscription management
- Usage metrics per school
- Support impersonation (audit-logged)
- White-label app bundle option

---

## 7. Critical Path Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Puppeteer cold start in Edge Function | Pre-warm the function; consider Docker sidecar if latency > 5s |
| RLS policy bugs silently leaking data | Write automated tests per role for every table |
| Optimistic UI revert UX surprise | Implement silent revert + retry with amber indicator (U3) |
| Biometric session state on app update | Store `BiometricSession` in DB, validate on cold start |
| Two-HRT conflict on attendance | First-submit wins; second sees read-only + propose amendment flow |
| Report PDF layout overflow | 600-char comment limit (S2); test with all subject combos |
| Push notification deep link failures | Test all 6 deep link targets on both iOS + Android |
| Mid-semester enrollment marks weights | `StudentYearRecord.fa1_weight_override` auto-set by enrollment date vs FA window |

---

## 8. Performance Targets & How to Hit Them

| Target | Strategy |
|--------|---------|
| <2s cold start | Preload school config + user data during auth. Cache in Zustand. |
| <500ms screen loads | React Query prefetch on tab focus. Skeleton during fetch. |
| <300ms search | Debounce 200ms. Full-text search index on student name + ID in Postgres. |
| No loading spinners | Optimistic UI + skeletons everywhere. Spinner = bug. |
| Offline graceful | Detect connectivity. Show offline banner. Queue failed writes. |

---

## 9. Token Efficiency Strategy

This project will span many Claude sessions. These rules minimize waste.

### 9.1 Session Rules
| Rule | Practice |
|------|---------|
| One module per session | Start each session with `/clear`. Don't let context drift. |
| Caveman prompts | Short, direct. "Build attendance register screen. Spec: [2 bullet rules]. Stack: RN + Supabase." |
| No re-explaining stack | Stack is in MEMORY.md. Reference it, don't repeat it. |
| Smaller model default | Use Sonnet for all feature builds. Only use Opus for architecture decisions. |
| Focused .md files | Each module gets one tight spec file (<100 lines). Not a mega-doc. |
| No commentary code | Zero comments unless WHY is non-obvious. Short functions > over-engineered abstractions. |
| Reuse component list | Reference the design system component list above. Don't reinvent. |

### 9.2 Per-Session Prompt Template
```
SESSION: [Module Name]
GOAL: [1 sentence]
FILES: [list of files to create/edit]
RULES:
- [2-3 hard constraints from spec]
STACK: RN/Expo, Supabase, React Query, Zustand
DO NOT: [what to avoid]
```

### 9.3 Module-Specific Sessions (Recommended Split)
Each session below is a full `/clear` restart:

| Session | Scope |
|---------|-------|
| S01 | DB migrations 001–010 + RLS policies |
| S02 | DB migrations 011–018 + demo seed data |
| S03 | Design system (tokens, core components) |
| S04 | Auth flow + biometric + navigation shell |
| S05 | Board Demo screens (read-only, pre-seeded) |
| S06 | Student CRUD + search + unified profile |
| S07 | Attendance register + conflict resolution |
| S08 | Marks entry + class average + bulk import |
| S09 | CREED + mark correction + audit trail |
| S10 | PDF report generation (Puppeteer Edge Fn) |
| S11 | Report workflow + versioning |
| S12 | Finance module + payment transactions |
| S13 | Day Book + notification system |
| S14 | Admin tools + year-end + front desk |
| S15 | Empty/error states + polish + haptics |
| S16 | Platform admin panel (web) |

### 9.4 What to Pass Between Sessions
At end of each session, note in a one-paragraph handoff:
- What was built
- What files were created
- Any decisions made that differ from spec
- Blockers for the next session

Keep handoffs in `SESSION_LOG.md` (one line per session, ~50 words max).

---

## 10. Quality Checklist (Per Module)

Before marking any module done:
- [ ] 3-tap rule verified for every workflow in the module
- [ ] Skeleton screen exists
- [ ] Empty state exists (with copy from spec Section 4.4)
- [ ] Error state exists (with copy from spec Section 4.5)
- [ ] Dark mode tokens applied (no hardcoded colors)
- [ ] Haptic feedback added where spec requires
- [ ] RLS policy covers this module's tables
- [ ] AuditLog entries fire for all relevant events
- [ ] Deep links work (if module receives notifications)
- [ ] Optimistic UI: no spinners on primary actions

---

*EduCore SMS — Confidential. Internal use only.*
