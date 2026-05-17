# Scholr — Roadmap to Pilot

**Pilot target:** Lusaka Oaktree / Cambridge International School
**Target date:** ~8 weeks from 2026-04-23 → **mid-June 2026** (well before August term start)
**Scope philosophy:** Internal school operations only. LMS-style features live on igaprep.com; admissions live on lusakaoaktree.school.

---

## 1. Confirmed Scope Decisions

From the needs-assessment review with Oaktree IT:

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Finance:** balance tracking + receipt PDFs only (no invoicing/financial reports) | Covers daily pain; invoicing is Year 2 |
| 2 | **Parent report card:** in-app download | No email friction, works offline once downloaded |
| 3 | **Announcement targeting:** school / grade / stream / role (all four) | Single targeting field, no cost difference |
| 4 | **Timetable upload:** PDF + image | One bucket, trivial to support both |
| 5 | **igaprep link:** browser (not WebView) | Simpler, avoids SSO complexity for v1 |
| 6 | **SMS delivery:** postponed | Cost model pending; push covers users with app |
| 7 | **Homework / syllabus / past papers / notes / chat:** bundled via igaprep.com | Leverage existing platform |
| 8 | **Online admissions:** lusakaoaktree.school handles it | Scholr is internal-only |
| 9 | **Timetable generation:** upload-only, no auto-generation | Too complex for v1 |
| 10 | **HR payroll / leave / staff attendance:** postponed | Oaktree likely has separate HR tool |

---

## 2. In-Scope for Pilot (Build Now)

### Must-ship
- **Production hardening:** Supabase type generation, Sentry, root ErrorBoundary, EAS CI
- **Push notification send path:** unified `send-push` edge function; triggers for absence alerts, report released, announcement, daybook-sent
- **Announcements module:** compose + target (school/grade/stream/role) + feed + push delivery
- **Academic calendar module:** term dates, holidays, exams, school events; shared across roles
- **Timetable viewer:** admin uploads PDF/image per grade/stream; teachers, parents, students view
- **Behavior module rebrand:** existing day book → explicit "Behavior" tab with per-student aggregates (positives vs concerns)
- **Biometric enrollment UX polish**
- **Finance receipt PDFs:** printable receipt per payment
- **Parent report download:** tighten in-app PDF viewer + local save
- **Super-admin onboarding (light):** UI to create schools + first admin user
- **igaprep link in "More" menu:** open in browser
- **Report approval audit trail UI**
- **Grade calculation helper:** extract letter-from-% logic as shared util

### Polish / catch-up
- Reduce `as any` casts by ≥70%
- 40% test coverage on critical flows (attendance submit, marks entry, report approval, announcement send)
- Low-bandwidth audit (image compression, React Query persistence, payload trim)
- Backup/export runbook + documented restore drill

---

## 3. Out of Scope for Pilot (Documented)

### Handled by adjacent platforms
- Homework, syllabus, past papers, notes, revision, chat → **igaprep.com** (deep link from Scholr More menu)
- Online admissions form + pipeline → **lusakaoaktree.school**

### Postponed to Year 1+ (after pilot feedback)
| Module | Trigger to revisit |
|--------|-------------------|
| SMS integration | Oaktree confirms SMS cost budget |
| Cumulative transcripts | First cohort has multi-semester data in Scholr |
| Predicted grades | IGCSE/A-Level class demands it |
| Library management | Oaktree requests it explicitly |
| Inventory / assets | Oaktree requests it explicitly |
| HR: staff attendance, leave, payroll | Audit Oaktree's existing HR tool first |
| Finance: invoicing, financial reports | Oaktree requests bulk invoice PDFs |
| Automated timetable generation | Schools complain about manual upload |
| Multi-language (i18n) | Non-English-primary school onboards |
| Offline-first sync | Field feedback shows connectivity pain |
| Messaging / chat in Scholr | If igaprep integration proves insufficient |
| Payment gateway | Oaktree / a school requests online fee payment |

---

## 4. Phased Plan

### Phase 0 — Foundations (Week 1)
**Goal:** make future work safer and more observable.

- [ ] Generate Supabase types (`supabase gen types typescript`) and commit `types/database.generated.ts`
- [ ] Replace top `as any` clusters with generated types in auth, attendance, marks, reports
- [ ] Install + configure Sentry (mobile SDK + source maps)
- [ ] Add root `ErrorBoundary` component in `app/_layout.tsx`
- [ ] EAS preview build profile verified; GitHub Actions workflow for type-check + lint on PR
- [ ] Unified `send-push` Supabase edge function
- [ ] Ban new `as any` via ESLint rule

**Deliverable:** clean build, one Sentry test event, one successful push via `send-push`.

### Phase 1 — Core Daily-Use Modules (Weeks 2–4)
**Goal:** ship the three new features Oaktree will touch every day.

- [ ] **Announcements**
  - Migration: `announcements` table + `announcement_recipients` audience table
  - Admin composer screen (target selector, body, optional attachment)
  - Recipient feed (per role home)
  - Push delivery via `send-push`
  - RLS: read by audience match, write by admin/principal/coordinator
- [ ] **Academic calendar**
  - Migration: `calendar_events` (type, date_from, date_to, audience, title, description)
  - Admin CRUD screen
  - Shared calendar view (list + month) across roles
  - Integration with existing semester dates
- [ ] **Timetable viewer**
  - Migration: `timetable_documents` (school_id, grade_id, stream_id?, file_url, effective_from)
  - Storage bucket `timetables` with RLS
  - Admin upload screen (PDF/image)
  - Viewer screen per role (in-app PDF or image display)
- [ ] **Behavior module rebrand**
  - Rename HRT tab "Day Book" → "Behavior"
  - Per-student aggregate view (positive count, concern count, trend)
  - Parent visibility filter already exists; surface the aggregate in parent home

**Deliverable:** demo script covering announce → receive, upload timetable → view, enter behavior note → parent sees aggregate.

### Phase 2 — Polish & Fill Gaps (Weeks 5–6)
**Goal:** close the half-built items and remove paper cuts.

- [ ] Biometric enrollment screen + "enable Face ID" prompt after first login
- [ ] Finance receipt PDFs (edge fn `generate-receipt` + download button on finance screens)
- [ ] Parent report card: in-app PDF viewer polish + share sheet
- [ ] Report approval: visible audit trail on admin reports screen
- [ ] Grade calculation helper extracted to `lib/grading.ts`, used by marks screen + report edge fn
- [ ] Super-admin onboarding UI (create school + seed admin)
- [ ] "More" menu: igaprep.com browser link entry
- [ ] Report card screen: ensure all CREED values render cleanly

**Deliverable:** every screen in the app has a real empty state, error state, skeleton, and exit path.

### Phase 3 — Hardening & Handover (Weeks 7–8)
**Goal:** operational confidence.

- [ ] Jest + React Native Testing Library setup
- [ ] 40% test coverage on: auth flow, attendance submit, marks entry, report approval, announcement send, push delivery
- [ ] E2E smoke test via Detox or Maestro on the happy paths (login → attendance → marks → report)
- [ ] Low-bandwidth pass: image transform API for avatars, paginate all lists, audit bundle size
- [ ] Supabase backup + export runbook (documented restore drill)
- [ ] Pilot training materials: 1-page quick-start per role + short screencast per daily task
- [ ] Production EAS build; staged rollout to Oaktree admin team first

**Deliverable:** green CI, passing E2E smoke, documented runbook, signed-off training materials.

---

## 5. Architecture Decisions Being Locked

1. **Storage buckets** — `reports` (exists), add `timetables`, `receipts`, `announcement_attachments`. RLS per-bucket mirroring table-level policies.
2. **Push-only notifications for v1** — `notification_logs` already supports channel enum; keep for future SMS/email without schema change.
3. **igaprep integration** — browser link only; no SSO handshake. Deep link URL stored in `school_configs` so each school can override.
4. **Timetable viewer** — PDF or image render. No parsing, no structured slot storage. (If Phase 3+ adds generation, that's a migration away.)
5. **Super-admin flow** — single "create school" form seeding schools, first admin user, default grading scale, default semester.
6. **Type generation** — `types/database.generated.ts` committed to repo; CI fails if drift detected vs. migrations.

---

## 6. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Oaktree requests scope additions mid-build | High | High | Phase 3 is the buffer; defer there with written sign-off |
| `as any` debt compounds under pressure | Medium | High | Phase 0 type generation + ESLint rule blocks new casts |
| One-off regression kills pilot trust | Medium | High | E2E smoke tests on golden path before every release |
| Push token churn after app updates | Low | Medium | Re-register tokens on app launch; monitor delivery rates in Sentry |
| Puppeteer PDF generation flakiness | Medium | Medium | Fallback retry; surface clear error to admin approving report |
| Backup never tested | Medium | Critical | Phase 3 includes documented restore drill |
| igaprep link experience feels bolted-on | Medium | Low | Phase 2 UX review; if poor, consider in-app WebView with SSO in Year 1 |
| Low connectivity in some Lusaka areas | Medium | Medium | React Query cache + optimistic UI; defer explicit offline mode |

---

## 7. Success Criteria for Pilot

The pilot is successful if, on pilot day + 2 weeks:

- [ ] Attendance is being marked by HRTs daily without support tickets
- [ ] Marks entry works for at least one assessment window (FA1 or Summative)
- [ ] At least one cohort's report cards generate, approve, and release end-to-end
- [ ] Parents have viewed at least one report card + 5 behavior entries + 3 announcements
- [ ] Finance team can mark paid + issue receipt PDFs
- [ ] Sentry shows zero P0 crashes; <5 P1 errors
- [ ] No data isolation bug (zero cross-school data leakage in logs)
- [ ] Oaktree admin + principal have personally logged in and completed a daily task

---

## 8. What Happens After Pilot

Post-pilot (8-week feedback cycle, ~mid-August 2026):

- Prioritize the top 3 pain points from Oaktree feedback
- Decide on SMS integration based on parent adoption of push
- Begin Year 1 expansion: likely cumulative transcripts + admissions integration + HR module scoping
- Consider multi-school onboarding (second pilot school) as infrastructure validation
