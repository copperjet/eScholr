# EduCore — Session Prompts S09–S16
> Paste each block into a fresh Claude Code session. Each is self-contained.
> Stack: React Native (Expo), Supabase (Postgres + RLS), Zustand, React Query, Puppeteer, Expo Router

---

# SESSION S09: Report Generation — PDF + Workflow + Versioning

## Project Context
EduCore SMS — React Native (Expo) + Supabase. Marks + CREED complete.
Reports are generated server-side by Puppeteer as PDFs. Stored in Supabase Storage.
Report workflow: HRT Preview → HRT Approval → Finance Gate → Release → Parent Notification.
Each approval creates a new ReportVersion (immutable). Parent always sees is_current version.
DRAFT watermark on preview PDFs. Subject teacher names on report. QR verification code in footer.
Finance gate is configurable (finance_gate_enabled flag).

## Goal
Build PDF report generation Edge Function, report approval workflow screens, report versioning, and report viewer.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
supabase/functions/generate-report-pdf/index.ts   -- Puppeteer PDF Edge Function
supabase/functions/release-report/index.ts         -- Release + parent notification
supabase/functions/verify-report/index.ts          -- Public QR verification endpoint
app/(app)/(hrt)/reports/index.tsx                  -- HRT: stream reports overview
app/(app)/(hrt)/reports/[studentId]/preview.tsx    -- HRT: preview single report
app/(app)/(hrt)/reports/[studentId]/approve.tsx    -- HRT: approve report
app/(app)/(admin)/reports/index.tsx                -- Admin: all reports overview
app/(app)/(admin)/reports/release.tsx              -- Admin: bulk release
app/(app)/(parent)/reports/index.tsx               -- Parent: my child's reports
app/(app)/(parent)/reports/[reportId].tsx          -- Parent: view report PDF
components/modules/ReportCard.tsx                  -- Native report card renderer (fallback)
components/modules/ReportStatusPipeline.tsx        -- Status flow visual
components/modules/PDFViewer.tsx                   -- In-app PDF display
hooks/useReports.ts
```

## Specification

### Edge Function: generate-report-pdf
Runtime: Deno + Puppeteer.
Triggered by: HRT preview request OR report approval.

**Input**: `{ report_id, is_preview: boolean }`
**Process**:
1. Fetch all report data from Supabase:
   - Student info (name, photo_url, grade, stream, DOB, student_number)
   - Semester + academic year labels
   - School config (name, logo_url, primary_color, secondary_color, show_class_position, show_student_photo, hrt_signature_label, head_signature_label, footer_text)
   - All subject marks (FA1, FA2, Summative, Total, Grade, subject teacher name)
   - CREED values
   - Attendance summary (Present, Absent, Late, AP, Sick, Total days, %)
   - HRT comment
   - Class position (if enabled)
   - Overall average %
   - Verification token (from report_versions table, or generate new one)
2. Render HTML report card template with school branding
3. If `is_preview = true` OR report.status not 'released': apply DRAFT watermark (grey, 45°, 72pt, centered each page)
4. Generate QR code (`qrcode` npm/npm-compat package) pointing to `https://verify.educore.app/{verification_token}`
5. Run Puppeteer: `page.pdf({ format: 'A4', printBackground: true })`
6. Upload PDF to Supabase Storage: `school-reports/{school_id}/{semester_id}/{student_id}/v{version}.pdf`
7. Return: `{ pdf_url, verification_token }`

**HTML Report Template Structure**:
```html
<div class="report-card">
  <!-- Header -->
  <div class="header" style="border-top: 6px solid {primary_color}">
    <img src="{logo_url}" />
    <div>
      <h1>{school_name}</h1>
      <h2>STUDENT REPORT CARD</h2>
      <p>Academic Year: {year} | {semester_name}</p>
    </div>
    {if show_student_photo}: <img src="{student_photo}" class="student-photo" />
  </div>
  <!-- Student info row -->
  <div class="student-info">
    <span>Student: {full_name}</span>
    <span>ID: {student_number}</span>
    <span>Grade: {grade} | Stream: {stream}</span>
    {if show_class_position}: <span>Position: {rank} of {total}</span>
  </div>
  <!-- Academic table -->
  <table class="marks-table">
    <thead style="background: {primary_color}; color: white">
      <tr><th>Subject</th><th>FA1</th><th>FA2</th><th>Summative</th><th>Total</th><th>Grade</th><th>Teacher</th></tr>
    </thead>
    <tbody>
      {for each subject}: <tr>...</tr>
      <!-- IGCSE+ rows only show Summative + Grade -->
    </tbody>
    <tfoot>
      <tr><td colspan="4">Overall Average</td><td>{overall_avg}%</td><td>{overall_grade}</td><td></td></tr>
    </tfoot>
  </table>
  <!-- CREED section -->
  <div class="creed-section">
    <h3>Character Assessment (CREED)</h3>
    <table class="creed-table">
      <tr><th>Value</th><th>Grade</th></tr>
      {for each creed value}: <tr><td>{name}</td><td>{grade}</td></tr>
    </table>
  </div>
  <!-- Attendance -->
  <div class="attendance-section">
    <h3>Attendance Summary</h3>
    <p>Present: {present} | Absent: {absent} | Late: {late} | Total School Days: {total} | Attendance: {pct}%</p>
  </div>
  <!-- Teacher comment -->
  <div class="comment-section">
    <h3>Class Teacher's Comment</h3>
    <p>{hrt_comment}</p>
  </div>
  <!-- Signatures -->
  <div class="signatures">
    <div class="sig-line">______________________<br/>{hrt_signature_label}</div>
    <div class="sig-line">______________________<br/>{head_signature_label}</div>
  </div>
  <!-- Footer -->
  <div class="footer">
    <p>{footer_text}</p>
    <img src="{qr_code_data_url}" class="qr-code" />
    <p class="qr-label">Scan to verify authenticity</p>
  </div>
  <!-- DRAFT watermark (if applicable) -->
  {if is_draft}: <div class="watermark">DRAFT</div>
</div>
```
CSS: watermark = `position:fixed; color:#9CA3AF; font-size:72pt; opacity:0.3; transform:rotate(-45deg); top:40%; left:15%`
PDF: always generated in light mode regardless of user's dark mode setting.

### Edge Function: verify-report (public, no auth)
Path: `/functions/v1/verify-report?token={16-char-token}`
No JWT required — this is public.
Returns HTML page showing:
- School name + logo
- Student full name
- Academic year + semester
- Grade + stream
- Overall percentage + grade
- "This is an official document issued by {school_name}."
Does NOT show: individual subject marks, CREED, attendance, teacher comment.
If token not found: "This report could not be verified. Please contact the school."
If old token (report re-versioned): "This report has been updated. The original version shown here may differ from the current release."

### HRT Reports Overview (hrt/reports/index.tsx)
Header: "Reports — [Stream name]"
**Status pipeline visual** (ReportStatusPipeline): horizontal flow showing counts at each stage:
`Draft → Pending Approval → Approved → Finance Pending → Released`
(Finance Pending hidden if finance_gate_enabled = false)

Student list: each row shows name + current report status badge.
Filter chips: All | Pending Review | Approved | Released
FAB / action: "Approve All Ready" (batch approve students where marks are 100% complete)

Tap any student → preview screen.

Marks completion check banner:
If any subjects have incomplete marks: amber banner: "[N] subjects still have missing marks. Approval blocked until complete."
Show which subjects are incomplete (tappable → opens ST marks screen for that subject).

### HRT Report Preview + Approve (hrt/reports/[studentId]/)

**preview.tsx**: 
- Renders PDF in PDFViewer (WebView-based)
- DRAFT watermark visible
- "Approve This Report" button at bottom (only shown if all marks complete + CREED entered)
- "Edit CREED" shortcut if CREED not yet entered

**approve.tsx**:
- CREED entry (if not yet entered): grid as per S08
- Teacher comment text area:
  - 600-char limit (live counter: "[N] / 600")
  - Counter turns amber at 500
  - Min 10 chars required (inline error if less)
- Preview report button (shows PDF with DRAFT watermark)
- "Approve Report" button (primary)
- On approve:
  1. Lock all marks: `marks.is_locked = true` for all student's subjects in semester
  2. Lock CREED: `character_records.is_locked = true`
  3. Update `reports.status = 'approved'` (or 'finance_pending' if finance_gate_enabled)
  4. Create new ReportVersion: `{ version_number: 1, pdf_url: new_pdf, verification_token, is_current: true }`
  5. Trigger Edge Function to generate non-draft PDF
  6. Haptic: success (heavy)
  7. Navigate back to reports overview

### Admin Reports Overview (admin/reports/index.tsx)
School-wide pipeline view:
- Summary counts: Draft | Pending | Approved | Finance Pending | Released
- Section filter tabs (EYD | CP | LS | IGCSE | A-Level)
- Stream-level rows: each stream shows completion status
- "Bulk Release" button (releases all Approved + Finance-cleared in selected section)
- Download icon: "Download ZIP" → triggers Edge Function returning all PDFs as ZIP

### Finance Gate + Release
If finance_gate_enabled = true:
- Report sits at 'finance_pending' after HRT approval
- Finance sees list of students in this status (handled in S12 Finance module)
- After Finance marks paid: report moves to 'approved' (eligible for release)
If finance_gate_enabled = false:
- Report moves directly from HRT approval to 'approved' (eligible for release)
- Admin triggers release manually

**Report Release** (Edge Function: release-report):
Input: `{ student_ids: [], semester_id }`
For each student:
1. `reports.status = 'released'`, `released_at = now()`
2. Send push notification to all linked parents:
   - Title: "[Child name]'s Semester X report is ready"
   - Body: "Tap to view your child's report card."
   - Deep link: `educore://reports/{report_id}`
3. Create in-app notification_log (channel='in_app') — persists even if push fails
4. Log to audit_logs

### Report Versioning (on re-approval after mark correction)
On second+ approval:
1. Update existing ReportVersions: `is_current = false`
2. Insert new ReportVersion: `{ version_number: prev + 1, is_current: true, new pdf_url }`
3. Regenerate PDF (no DRAFT watermark — this is a real re-release)
4. Send parent notification: "[Child name]'s [Semester] report has been updated. The latest version is now available."
5. Report status changes: under_review → released (if was released); pending_approval → approved (if correction during approval flow)

### Parent Report View (parent/reports/)
**index.tsx**: list of all report cards for their child (all semesters)
Each row: semester label + academic year + status badge ("Available" or "Pending")
**[reportId].tsx**: PDFViewer showing the current (non-draft) PDF
Share button (top right): native share sheet for the PDF URL
No DRAFT watermark on released reports.

### PDFViewer component
Uses `expo-web-browser` or `react-native-pdf` (or WebView with PDF URL).
Loading state: skeleton (animated shimmer over placeholder).
Error state: "Couldn't load the report. Tap to retry."
Share icon: calls React Native Share API with PDF URL.

## Critical Rules
- PDF always generated server-side (Edge Function) — never on device
- PDF always in light mode — ignore user's dark mode setting
- DRAFT watermark on ALL preview PDFs and any PDF where status != 'released'
- verification_token: 16-char random hex string. Generate with `crypto.randomUUID().replace(/-/g,'').slice(0,16)` server-side
- Report approval is irreversible (except via admin mark unlock flow)
- ReportVersion: no UPDATE or DELETE ever — immutable snapshots
- Finance gate: if disabled, Admin manually releases. No Finance step in workflow.
- Notification on release: create in_app notification regardless of push success (parents check inbox)

## DO NOT
- Do not generate PDFs on device — server-side only
- Do not allow HRT to approve if any marks are missing (API + UI validation)
- Do not allow parents to see draft or pending reports
- Do not DELETE old ReportVersions — keep all versions for audit
- Do not expose individual marks on the public verification page

---

# SESSION S10: Finance Module + Day Book

## Project Context
EduCore SMS — React Native (Expo), Supabase. Reports module complete.
Finance controls report release via finance_gate_enabled flag.
Finance: Paid/Unpaid per student per semester. Bulk clear by grade/section. PaymentTransactions for partial payments.
Day Book: any teacher can create entries. 15-minute edit window. 8 categories. Send-to-parent toggle.

## Goal
Build Finance module (payment tracking, bulk actions, report gating) and Day Book (create, edit, view, archive, parent notification).

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
app/(app)/(finance)/index.tsx              -- Finance home dashboard
app/(app)/(finance)/payments/index.tsx     -- Student payment list
app/(app)/(finance)/payments/[studentId].tsx -- Student payment detail
app/(app)/(finance)/reports/index.tsx      -- Finance: reports awaiting clearance
app/(app)/(hrt)/daybook/index.tsx          -- HRT: day book for their stream
app/(app)/(st)/daybook/index.tsx           -- ST: day book (entries they created)
app/(app)/(admin)/daybook/index.tsx        -- Admin: all entries
app/(app)/(parent)/inbox/index.tsx         -- Parent: day book sent to them + notifications
components/modules/DayBookEntryCard.tsx
components/modules/DayBookCreateSheet.tsx  -- Create entry bottom sheet
components/modules/PaymentStatusRow.tsx
hooks/useFinance.ts
hooks/useDayBook.ts
supabase/functions/send-daybook-notification/index.ts
```

## Specification

### Finance Home Dashboard
**Payment summary card**:
- Title: "Semester 2 Payments"
- Stats row: "Total: 798 | Paid: 642 | Unpaid: 156"
- Visual indicator bar: green/red proportion
- Pending amount: "Outstanding: ZMW 234,500"

**Quick actions**: "View Unpaid" | "Bulk Clear Section" | "View Reports Awaiting"

**Reports awaiting Finance clearance card**:
- Count: "48 reports approved — awaiting payment clearance"
- Tap → finance/reports/index.tsx

### Student Payment List (finance/payments/index.tsx)
**Filter bar**: All | Paid | Unpaid | + Section dropdown + Grade dropdown
Sorted: Unpaid first, then alphabetically within each group.
Each row (PaymentStatusRow):
- Checkbox (for bulk select) + Avatar + Name + Grade/Stream + Status badge (Paid/Unpaid) + Balance (if any)
- Tap row → student payment detail

**Bulk action bar** (shows when 1+ checked):
- "Mark Selected as Paid" button (brand primary)
- Count: "3 selected"
- Confirm sheet: "Mark 3 students as Paid for Semester 2? This action will unlock their reports." → "Confirm"

**FAB**: "Bulk Clear Section" → BottomSheet: Section picker → Grade picker → Confirm count → Execute
Confirmation: "Clear 142 students in CP Section as Paid? This cannot be undone."
Haptic: success (heavy) on completion.

### Student Payment Detail (finance/payments/[studentId].tsx)
- Student header: Avatar + Name + Grade/Stream
- Current semester: status badge (Paid/Unpaid) + Outstanding balance input
- Mark as Paid / Mark as Unpaid toggle (Finance only)
- Balance field: numeric input for partial payment
- Add Payment Transaction:
  - Amount, Date (default today), Note (optional)
  - "Add Payment" → creates PaymentTransaction record
- Payment history: chronological list of PaymentTransactions: date | amount | recorded by | note
- Semester history: previous semesters (read-only)
- Report status: if finance_gate_enabled: shows "Report: Awaiting Payment" or "Report: Cleared"

### Finance Reports View (finance/reports/index.tsx)
List of students with reports in 'finance_pending' status.
Each row: Student name + Grade/Stream + HRT approval date + "Clear Payment" action button.
Bulk checkbox + "Clear All Selected" action.
On clearing: report status → 'approved' (eligible for release).

### Day Book — Create Entry (DayBookCreateSheet.tsx)
Bottom sheet, opens from FAB on any day book screen.
Fields:
1. **Student**: search field (type to search — same global search hook, debounced)
2. **Date**: today (default, editable, date picker)
3. **Category**: 8 options in a scrollable chip row:
   `Behaviour — Minor | Behaviour — Serious | Academic Concern | Achievement | Attendance Note | Health | Communication | Other`
4. **Description**: multi-line text input, no character limit
5. **Send to Parent**: toggle (default: OFF)
   - When toggled ON: amber notice "Parent will receive a push notification immediately on save."
6. "Save Entry" button (primary)

On save:
- Create DayBookEntry record with `edit_window_closes_at = now() + 15min`
- If send_to_parent = true: trigger Edge Function `send-daybook-notification` immediately
- Haptic: medium success

### Day Book Entry Detail
Shows full entry: student name + date + category badge + description + "Sent to parent" indicator (if yes)
Created by + time.
**Edit** (visible only if within 15-min window + same staff):
- Show time remaining: "10 min left to edit"
- Tap "Edit" → opens DayBookCreateSheet pre-filled
- After 15min: "Edit window closed" (grey text, no edit button)
**Archive** (Admin only): "Archive Entry" → confirmation → archived = true. Entry disappears from non-admin views.

### Day Book Views by Role

**HRT (hrt/daybook/index.tsx)**:
- Filter: All students in their stream | By category | Sent to Parent
- FAB (+): create entry for any student in their stream (or search for others)
- Each entry row: Student name + date + category badge + preview text + sent indicator

**ST (st/daybook/index.tsx)**:
- Shows only entries created by this ST
- FAB (+): create entry for any student (search)

**Admin (admin/daybook/index.tsx)**:
- All entries school-wide
- Search by student name
- Filter: category | date range | "Sent to parent" only
- Archive action visible on all entries

**Parent (parent/inbox/index.tsx)**:
- Shows day book entries where send_to_parent = true for their child
- Also shows all in-app notifications (report ready, absence alerts, day book)
- Tabs: "Messages" (day book entries) | "Notifications" (system notifications)
- Each notification row: icon + title + body + timestamp + unread dot
- Tap → navigates to deep link target (or entry detail)
- "Mark All Read" button in header
- Unread badge on bell icon in tab bar

### Notification Inbox (all roles)
Accessible via bell icon in top app bar on every screen.
Bell shows badge count of unread notifications.
List: newest first, 90-day retention.
Each row: icon (role-specific) + title + body preview + timestamp + unread blue dot.
Tap row: marks read + navigates to deep link.
"Mark All Read" action in header (right side).
Empty state: "You're all caught up." + illustrated bell.

### send-daybook-notification Edge Function
Input: `{ daybook_entry_id }`
Fetch: entry, student, parent auth_user_ids, school name, HRT name.
Push notification:
```
Title: "A message from [HRT First name + Last initial]"
Body: "About [Student name] — [Category]. Tap to read."
Deep link: educore://daybook/{entry_id}
```
Create in_app notification_log for all linked parents.
Log delivery status.

### React Query Hooks
```typescript
// Finance
useFinanceSummary(semesterId)
useFinanceList({ semesterId, status?, grade?, stream? })  // paginated + filterable
useStudentFinance(studentId, semesterId)
useUpdatePaymentStatus()    -- mutation
useAddPaymentTransaction()  -- mutation
useBulkClearPayments()      -- mutation

// Day Book
useDayBookEntries({ studentId?, streamId?, createdBy?, category?, semesterId? })
useCreateDayBookEntry()     -- mutation
useUpdateDayBookEntry()     -- mutation (within edit window only)
useArchiveDayBookEntry()    -- mutation (Admin only)
```

## Critical Rules
- Day book edit window: 15 minutes after creation. After that: read-only for creator. Admin-only archive.
- send_to_parent = true: push fires IMMEDIATELY on save, not in a queue.
- Finance bulk clear: ALWAYS show count + confirmation sheet before executing. No accidental bulk actions.
- No hard deletes on day book — archive = true is the only "removal" option.
- Day book entries: permanently timestamped (created_at immutable).
- Parent notification inbox: in_app notification created regardless of push delivery success.
- Finance: balance field is for outstanding amount — zero means fully paid.
- Report release: Finance clearance unlocks the report for Admin to release — Finance doesn't release directly.

## DO NOT
- Do not allow parents to create day book entries
- Do not delete day book entries — archive only (Admin)
- Do not auto-release reports after Finance clearance — Admin triggers release
- Do not require Finance confirmation to view reports (read-only for Finance)
- Do not allow editing day book after 15-minute window (enforce server-side too)

---

# SESSION S11: Admin Tools — Staff, Year-End, Front Desk, Calendar, Audit Trail

## Project Context
EduCore SMS — React Native (Expo), Supabase. All core modules (attendance, marks, reports, finance, day book) complete.
Admin = school's primary operator. Super Admin = school's highest role (no platform access).
Front Desk = enrollment, inquiries, calendar management.
Year-end: Admin promotes students (Promoted/Graduated/Repeat Year).

## Goal
Build admin staff management, year-end promotion wizard, front desk (inquiries + enrollment), academic calendar, and audit trail viewer.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
app/(app)/(admin)/staff/index.tsx          -- Staff list
app/(app)/(admin)/staff/add.tsx            -- Add staff form
app/(app)/(admin)/staff/[id]/index.tsx     -- Staff profile (read-only)
app/(app)/(admin)/staff/[id]/edit.tsx      -- Edit staff
app/(app)/(admin)/year-end/index.tsx       -- Year-end promotion wizard
app/(app)/(admin)/settings/index.tsx       -- School settings + marks window
app/(app)/(admin)/settings/marks-window.tsx
app/(app)/(admin)/audit/index.tsx          -- Audit trail viewer
app/(app)/(frontdesk)/index.tsx            -- Front desk home
app/(app)/(frontdesk)/inquiries/index.tsx
app/(app)/(frontdesk)/inquiries/add.tsx
app/(app)/(frontdesk)/inquiries/[id].tsx
app/(app)/(frontdesk)/inquiries/convert.tsx -- Inquiry → enrollment
app/(app)/(frontdesk)/calendar/index.tsx
app/(app)/(frontdesk)/calendar/add-event.tsx
components/modules/StaffListRow.tsx
components/modules/InquiryCard.tsx
components/modules/CalendarView.tsx
components/modules/AuditLogRow.tsx
hooks/useStaff.ts
hooks/useAuditLog.ts
hooks/useCalendar.ts
hooks/useInquiries.ts
supabase/functions/send-welcome-email/index.ts
```

## Specification

### Staff Management

**Staff List (admin/staff/index.tsx)**:
Search bar + filter chips: All | Active | Inactive | By Role | By Department
Each row: Avatar + Name + Staff ID + Roles (badge pills) + Department + Status chip
FAB (+): Add Staff

**Add Staff Form (admin/staff/add.tsx)**:
Fields: Full Name (required), Email (required), Phone, Department (dropdown), Status (default Active)
Role assignment: multi-select chip grid (all 9 roles)
Stream assignment (if HRT selected): multi-select stream picker + semester
Subject assignment (if ST/HOD selected): subject+stream+semester triples (add multiple)
Save → creates auth.users account via Supabase Admin API → triggers welcome email Edge Function.

**Staff Profile (admin/staff/[id]/index.tsx)** — Read-only:
Overview: Name, Staff ID, email, phone, department, roles, status, date joined
Assignments section:
- If HRT: assigned streams with semester
- If ST: Subject+Stream+Semester + marks completion % per assignment
- If HOD: department + subjects list
Activity (Admin only): last login, attendance registers submitted, day book entries (this semester)
Edit button top right → edit screen

**Edit Staff**: same form, pre-filled. Role changes take effect on next login.
Deactivate: changes status to 'inactive', invalidates auth session.

### Year-End Promotion Wizard (admin/year-end/index.tsx)
Step 1: Select Academic Year to close + target year to promote into.
Step 2: Section-by-section promotion:
- Table: each student row with checkbox + Name + Current Grade/Stream + Outcome picker
- Outcome: "Promote" (auto-fills target grade) | "Graduate" | "Repeat Year"
- Repeat Year: requires reason text (modal input)
- Promote: shows target grade/stream (auto-calculated, editable)
- "Select All → Promote" shortcut button

Step 3: Review + Confirm:
- Summary: "Promoting 645 students | Graduating 42 | Repeating 3"
- Scrollable list of exceptions (Repeat Year students with reasons)
- "Execute Year-End" button (red, requires typing "CONFIRM" in text field — destructive action)

On execute:
- Updates student.grade_id, stream_id for promoted students
- Creates new StudentYearRecord for new semester
- IGCSE subject selections carried from IGCSE 1 → IGCSE 2 automatically
- Writes audit_log: { event_type: 'student_promoted', count, actor }
- HRTs notified of any Repeat Year in their stream

### Marks Window Management (admin/settings/marks-window.tsx)
Current semester card: name, start date, end date.
Marks window: current open/close dates + status badge (Open/Closed).
"Open Window": date picker for open date + close date → saves to semester.marks_open_date/close_date
"Close Window": confirmation → sets close date to now()
"Extend Window": date picker for new close date
Banner visible to all Subject Teachers when window is open: "Marks window closes [date]"

### Academic Calendar (frontdesk/calendar/)

**Calendar view**: monthly grid with event dots.
Color coding: holiday (red dot) | exam_period (amber) | parent_evening (blue) | other (grey).
Tap day → shows events list for that day.

**Add Event (frontdesk/calendar/add-event.tsx)**:
Fields: Title, Start Date (date picker), End Date (date picker), Type (picker), Description (optional).
Event type 'exam_period': triggers register pre-mark behavior (S07).
Recurring events: RRULE support (weekly/monthly simple options in UI — complex RRULE stored).
Save → creates CalendarEvent record.

### Inquiry Management (frontdesk/inquiries/)

**Inquiry list (index.tsx)**:
Filter tabs: New | In Progress | Enrolled | Closed
Each row: Name + contact + date + status badge + age ("2 days ago")
FAB (+): New Inquiry
Tap → detail

**Add Inquiry (add.tsx)**:
Fields: Name, Contact Phone, Contact Email, Nature of Inquiry, Date (default today), Notes.
Save → status = 'new'.

**Inquiry Detail ([id].tsx)**:
Show all fields. Status picker (New → In Progress → Closed).
"Convert to Enrollment" button (primary, only when status = new/in_progress).
On convert → navigate to convert.tsx

**Inquiry → Enrollment Conversion (convert.tsx)**:
Pre-filled form from inquiry data:
- Full Name (pre-filled from inquiry name, editable)
- Parent record: Phone + Email pre-filled from contact, editable
- Nature of inquiry → archived on inquiry (not mapped to student)
- Date → Enrollment Date (default today, editable)
- Section / Grade / Stream: REQUIRED (must select before save)
- Emergency Contact: REQUIRED (must enter before save)
Review screen shows all values before save.
On confirm:
- Creates student record
- Creates parent record (if new)
- Triggers send-welcome-email for parent
- Updates inquiry.status = 'enrolled', inquiry.converted_student_id = new student id
- Navigates to new student's profile

### Welcome Email Edge Function (send-welcome-email)
Input: `{ parent_id }`
Sends email to parent.email:
```
Subject: Welcome to EduCore — [School Name]
Body: 
"Dear [Parent Name],

Your child's school uses EduCore to share reports, attendance, and updates.

To get started:
1. Download the EduCore app
2. Enter school code: [school.code]
3. Sign in with your email: [parent.email]
4. Use this temporary password: [temp_password]

You will be asked to set a new password on first login.

Best regards,
[School Name] Administration"
```
Generate temp_password: 8-char random alphanumeric. Set via Supabase Admin Auth API.
Flag user: requires password change on first login (custom claim in app_metadata).

### Audit Trail Viewer (admin/audit/index.tsx)
Filter row: Event Type (dropdown) | Actor (staff search) | Student (search) | Date Range (date pickers)
Each row: timestamp + event type badge + actor name + student name (if applicable) + summary text
Tap row → detail sheet: full JSON data displayed as key-value pairs in readable format.
"Export CSV" button: triggers download of filtered audit logs as CSV.
Retention note: "Audit logs retained for 7 years."

## Critical Rules
- Year-end: IGCSE 1 → IGCSE 2 subject selections auto-carry. Cannot be bypassed.
- Year-end: destructive action requires typing "CONFIRM". No accidental execution.
- Welcome email: temp password set via Supabase Admin Auth API (not user-facing API). Never log temp password.
- Repeat Year: reason note required. Stored in StudentYearRecord. Never visible to parent.
- Calendar events with type 'exam_period': automatically trigger register pre-mark behavior in S07.
- Audit logs: read-only view. No edit, no delete. Export CSV only.
- Staff deactivation: invalidates auth session immediately (Supabase Admin API: deleteUser or disableUser).

## DO NOT
- Do not allow staff to edit their own roles or permissions
- Do not show platform admin functions in school app
- Do not hard-delete inquiries — status = 'closed' only
- Do not skip the "CONFIRM" step on year-end execution
- Do not email temp passwords in plaintext in logs

---

# SESSION S12: Notifications + Push System + App Version Enforcement

## Project Context
EduCore SMS — React Native (Expo), Supabase. All modules complete.
Push: Expo Push + FCM (Android) + APNs (iOS).
In-app inbox persists all notifications 90 days.
Safeguarding: absence notifications get admin delivery log + failed-push flag.
Deep linking: each notification type opens a specific screen.

## Goal
Build the complete notification system: push delivery, in-app inbox, delivery log, deep linking, and app version enforcement.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
lib/notifications.ts                               -- Push token registration + send helpers
lib/deeplinks.ts                                   -- Deep link URL scheme + handler
app/(app)/notifications/index.tsx                  -- In-app notification inbox (all roles)
app/update-required.tsx                            -- Blocking app update screen
app/+native-intent.tsx                             -- Expo Router deep link handler
components/modules/NotificationRow.tsx
hooks/useNotifications.ts
supabase/functions/send-push-notification/index.ts -- Reusable push sender
supabase/functions/check-app-version/index.ts
```

## Specification

### Push Token Registration (lib/notifications.ts)
On app startup (after auth):
```typescript
// 1. Request permission
const { status } = await Notifications.requestPermissionsAsync();
// 2. Get Expo push token
const token = await Notifications.getExpoPushTokenAsync({ projectId: Constants.expoConfig.extra.eas.projectId });
// 3. Upsert to biometric_sessions or a dedicated push_tokens table:
//    { user_id, device_id, push_token, platform: 'ios'|'android' }
//    This enables delivery status tracking
// 4. Handle foreground notifications: show as in-app banner (not system notification)
// 5. Handle background tap: extract deep_link_url, navigate on app open
```

Add to DB (migration addition): `push_tokens` table:
```sql
push_tokens:
  id UUID PK
  school_id UUID FK NOT NULL
  user_id UUID NOT NULL REFERENCES auth.users(id)
  device_id TEXT NOT NULL
  push_token TEXT NOT NULL
  platform TEXT CHECK IN ('ios','android','web')
  created_at TIMESTAMPTZ DEFAULT now()
  UNIQUE(user_id, device_id)
```

### send-push-notification Edge Function
Reusable function called by all other Edge Functions that send notifications.
Input:
```typescript
{
  recipient_user_id: string,
  school_id: string,
  trigger_event: string,
  title: string,
  body: string,
  deep_link_url: string,
  is_safeguarding: boolean,
  related_student_id?: string,
}
```
Process:
1. Lookup push_token for recipient (latest device)
2. Send via Expo Push API: `https://exp.host/--/api/v2/push/send`
3. Create notification_log record with delivery_status
4. If push fails AND is_safeguarding = true: flag in notification_log with delivery_status = 'failed'
   - Admin can see red flag in student's notification delivery log
5. ALWAYS create in_app notification_log (channel='in_app') regardless of push success

### Deep Link Specification (lib/deeplinks.ts)
URL scheme: `educore://`

| Notification Trigger | Deep Link |
|---------------------|-----------|
| Student absent | `educore://attendance/{stream_id}/{date}` |
| Report released | `educore://reports/{report_id}` |
| Report updated | `educore://reports/{report_id}` |
| Day book sent to parent | `educore://daybook/{entry_id}` |
| Marks unlocked (HRT) | `educore://reports/approve/{student_id}` |
| Marks complete (HRT) | `educore://reports/stream/{stream_id}` |
| Threshold alert | `educore://student/{student_id}/attendance` |
| Force update | External: App Store / Play Store |

Expo Router handler (app/+native-intent.tsx or useURL hook):
- Parse incoming deep link
- Check auth state — if not logged in: store pending deep link, redirect to auth, navigate after login
- Navigate to target screen with params
- Mark notification as read in notification_logs

### In-App Notification Inbox (app/(app)/notifications/index.tsx)
Accessible from bell icon in top app bar (every screen, all roles).
Bell badge: count of `notification_logs WHERE recipient = me AND is_read = false AND channel = 'in_app' AND expires_at > now()`

Inbox screen:
- "Mark All Read" button (right of header)
- Section headers: "Today" | "This Week" | "Earlier"
- Each NotificationRow: colored icon (per event type) + title + body preview + timestamp + unread dot
- Tap: marks is_read = true + navigates to deep_link_url
- Swipe left on row: "Mark Read" shortcut
- Empty state: "You're all caught up." + illustrated bell

NotificationRow icons by type:
- attendance_absent: red person-remove icon
- report_released: green document icon
- daybook_sent: blue chat-bubble icon
- marks_unlocked: amber unlock icon
- threshold_alert: red warning icon
- marks_complete: green checkmark icon

### Admin Notification Delivery Log
In Admin's student profile → dedicated "Notifications" section (or tab within student profile Attendance tab):
Shows all notification_logs WHERE related_student_id = student AND school_id = school.
Each row: trigger_event + channel + delivery_status + timestamp.
Failed push + safeguarding = red indicator badge + "Parent may not have been notified"
Admin can tap to see parent's registered contact details for manual follow-up.

### App Version Enforcement (check-app-version Edge Function)
Input: `{ installed_version: string }` (from app on cold start)
DB table (in schools or platform level): `app_versions { min_version, current_version, ios_store_url, android_store_url }`
Returns: `{ is_supported: boolean, is_latest: boolean, store_url: string }`

**app/_layout.tsx** (root): on cold start, before rendering any screen:
1. Call `check-app-version` with `Constants.expoConfig.version`
2. If `!is_supported`: render `<Stack.Screen name="update-required" />` as only screen
3. If `!is_latest` (within 7-day grace): show dismissible banner on home screen

**update-required.tsx** (blocking screen):
- EduCore logo
- "A required update is available"
- Body: "Please update EduCore to continue using the app."
- "Update Now" button → `Linking.openURL(store_url)` — opens App Store / Play Store
- No back button, no skip — fully blocking

## Critical Rules
- In-app notification: ALWAYS created, regardless of push delivery success
- Safeguarding (absence) failed push: admin MUST be able to see this in notification delivery log
- Deep links: tested on both iOS + Android (URL scheme must be registered in app.json)
- Bell badge: real-time via Supabase realtime subscription on notification_logs table
- Notification retention: 90 days. Expired notifications hidden from inbox (filter by expires_at).
- Version check: happens on EVERY cold start. Cannot be bypassed.
- Push token: re-register on every app start in case token changed (Expo Push tokens can rotate).

## DO NOT
- Do not show system notification for foreground push — show in-app banner instead
- Do not skip creating in_app notification_log even if push succeeds
- Do not hard-delete notification logs — they expire (90 days) and are then hidden
- Do not block the app with a spinner during version check — skeleton screen only

---

# SESSION S13: Empty States, Error States, Polish, Haptics, Accessibility

## Project Context
EduCore SMS — React Native (Expo). All functional modules complete. This session adds the final polish layer.
Every screen needs an intentional empty state and error state. Haptic feedback is a design requirement.
Performance: <500ms screen loads, <2s cold start. Accessibility: AA contrast, 48dp tap targets.

## Goal
Implement all empty states, all error states per spec, haptic feedback on all required interactions, accessibility pass, performance audit, and dark mode verification across all screens.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
constants/emptyStates.ts    -- All empty state copy strings
constants/errorStates.ts    -- All error state messages
components/ui/EmptyState.tsx -- UPDATE: add all illustration variants
components/ui/ErrorState.tsx -- UPDATE: all error scenarios
lib/haptics.ts              -- Centralized haptic wrapper
lib/performance.ts          -- Screen load time tracker
```

## Specification

### Empty States (per spec Section 4.4)
Implement in `constants/emptyStates.ts` and wire into each screen:

```typescript
export const emptyStates = {
  attendanceDay1: {
    title: "No attendance marked yet today.",
    body: "Tap Mark All Present to begin.",
    illustration: 'register',
    actionLabel: "Mark All Present",
  },
  marksNotEntered: {
    title: "No marks entered yet.",
    body: "The marks window is open until {date}.",
    illustration: 'gradebook',
  },
  parentNoReports: {
    title: "Your child's first report will appear here once it's released.",
    body: null,
    illustration: 'document',
  },
  dayBookNoEntries: {
    title: "No entries for this student yet.",
    body: null,
    illustration: 'notebook',
  },
  notificationInbox: {
    title: "You're all caught up.",
    body: null,
    illustration: 'bell',
  },
  searchNoResults: {
    title: "No results for '{query}'.",
    body: "Try a different name or ID.",
    illustration: 'search',
  },
  financeAllPaid: {
    title: "All students are cleared for this semester.",
    body: "Well done.",
    illustration: 'checkmark',
  },
};
```

Illustration style: simple line art SVG illustrations in school primary color. Each one unique.
Create SVG illustrations for: register (clipboard), gradebook (book), document (with star), notebook (pen + book), bell, search (magnifying glass), checkmark (circle check).
Store in `assets/illustrations/`.

### Error States (per spec Section 4.5)
Wire into all screens with network-dependent data:

```typescript
export const errorMessages = {
  offline: {
    message: "You're offline. Check your connection and try again.",
    action: "retry",
  },
  saveFailed: {
    message: "Couldn't save your changes. Try again in a moment.",
    action: "retry",
  },
  sessionExpired: {
    message: "You've been logged out for security. Please log in again.",
    action: "login",
  },
  markOutOfRange: {
    message: "Marks must be between 0 and 100.",
    type: "inline_field",
  },
  wrongSchoolCode: {
    message: "School not found. Check your school code and try again.",
    type: "inline_field",
  },
  approvalBlockedMarksMissing: {
    message: "{N} subject marks are missing. Approval is blocked until all marks are entered.",
    action: "show_missing_subjects",
  },
  forceUpdate: {
    message: "A required update is available. Please update EduCore to continue.",
    action: "update_now",
  },
};
```

Each error displayed as:
- Inline field errors: red text below input, 400ms fade in
- Screen-level errors: ErrorState component (icon + message + retry button)
- Toast for transient errors: `expo-toast` or custom top banner (300ms slide down, auto-dismiss 4s)

### Haptic Feedback (lib/haptics.ts)
Centralized wrapper using `expo-haptics`:

```typescript
export const haptics = {
  markAllPresent: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  reportApproved: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  markSaved: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  dayBookSentToParent: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), // medium
  errorOccurred: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  attendanceStatusChanged: () => Haptics.selectionAsync(),
  bottomSheetDismissed: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  buttonTapped: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
};
```

Wire into all interaction points per spec Section U6:
- Mark All Present confirmed → `haptics.markAllPresent()`
- Report approved → `haptics.reportApproved()`
- Individual mark saved → `haptics.markSaved()`
- Day Book sent to parent → `haptics.dayBookSentToParent()`
- Error save failed → `haptics.errorOccurred()`
- Attendance status changed → `haptics.attendanceStatusChanged()`
- Bottom sheet dismissed → `haptics.bottomSheetDismissed()`

### Accessibility Pass
All interactive elements: minimum 48×48dp tap target. Audit every Icon button.
Text contrast: verify AA ratio (4.5:1 for normal text, 3:1 for large text).
All images: `accessibilityLabel` prop required.
Screen reader: `accessibilityRole` on buttons, lists, headings.
`accessibilityHint` on non-obvious actions (e.g., FAB: "Double tap to mark all students present").

### Dark Mode Verification
For every screen, verify in dark mode:
- No white text on white background
- No dark text on dark background
- Brand colors (primary, secondary) unchanged — they're already high-contrast accents
- Report PDF still opens in light mode (WebView with forced light background)
- Table borders: `#E5E7EB` → `#374151` in dark
- Card shadows: reduce opacity in dark (0.3 → 0.1)

### Performance Checks
- React Query: enable `staleTime: 5 * 60 * 1000` (5 min) for data that doesn't change often (subjects, grades, streams)
- Pre-fetch on tab focus: each tab navigator triggers `queryClient.prefetchQuery` for its primary data
- `FlashList` (from @shopify/flash-list): use instead of FlatList for all large lists (student list, marks list, attendance register)
- Image loading: use `expo-image` (not Image from RN) — it has built-in caching + blurhash placeholders
- Bundle size: audit and tree-shake — target < 10MB install size

## Critical Rules
- Every screen (not just the main ones) needs empty + error state — no blank voids anywhere
- Haptic feedback must not fire if haptic APIs are unavailable (guard with try/catch)
- Dark mode: store user preference in Zustand + AsyncStorage. Default: system.
- Empty state illustrations: use school primary color for illustration strokes/fills
- Accessibility: screen reader users must be able to complete all core tasks

## DO NOT
- Do not use generic "Something went wrong" error messages — be specific and human
- Do not skip haptics to save time — they are a design requirement
- Do not add ActivityIndicator anywhere during this polish pass
- Do not use FlatList for lists with > 50 items — use FlashList

---

# SESSION S14: Platform Admin Panel (Web — Internal Tool)

## Project Context
EduCore SMS — the mobile app is complete. This session builds the internal web-based Platform Admin panel.
This is NOT visible to schools. Only the EduCore internal team uses it.
Built as a web app (Next.js or plain React + Supabase). Separate deployment from the mobile app.
Capabilities: school management, onboarding wizard, subscription, feature flags, impersonation (audit-logged), usage metrics.

## Goal
Build the EduCore Platform Admin web panel: school CRUD, 10-step onboarding wizard, feature flag control, subscription management, impersonation, and usage metrics.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore\platform-admin`

## Initialize Project
```bash
npx create-next-app@latest platform-admin --typescript --tailwind --app
cd platform-admin
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
```

## Create These Files
```
platform-admin/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    -- Dashboard overview
│   ├── schools/
│   │   ├── page.tsx                -- School list
│   │   ├── [id]/page.tsx           -- School detail
│   │   ├── [id]/edit/page.tsx      -- Edit school
│   │   ├── new/page.tsx            -- Onboarding wizard
│   │   └── [id]/impersonate/page.tsx  -- Impersonation
│   ├── subscriptions/page.tsx
│   ├── metrics/page.tsx
│   └── audit/page.tsx
├── components/
│   ├── OnboardingWizard.tsx        -- 10-step wizard
│   ├── FeatureFlagGrid.tsx
│   └── SchoolCard.tsx
└── lib/
    ├── supabase-platform.ts        -- Privileged Supabase client
    └── auth.ts
```

## Specification

### Platform Admin Auth
Separate auth from school app. PlatformAdmin users in a separate `platform_admins` table (no school_id).
Login: email + password via Supabase Auth.
JWT must contain: `{ is_platform_admin: true }`.
All school data queries use a service_role client (bypasses RLS — platform admins need cross-school access).

### Dashboard (app/page.tsx)
- Total schools: count by subscription status
- New schools (last 30 days)
- Monthly active users (approximate from auth.users last_sign_in_at)
- Reports generated (last 30 days from report_versions)
- Revenue summary (subscription tiers × school counts)

### School List (schools/page.tsx)
Table: School Name | Code | Country | Plan | Status | Students | Created | Actions
Filter: by plan, by status, by country
Search: by name or code
Actions per row: View | Edit | Suspend | Impersonate

### School Onboarding Wizard (OnboardingWizard.tsx)
10 steps (per spec Section 12.2):

**Step 1: School Profile**
Name, Code (unique, validate on blur), Country, Timezone, Currency, Logo upload, Primary color picker, Secondary color picker.

**Step 2: Academic Calendar**
Academic year start + end dates. Semester count (1 or 2). Semester labels (Semester 1/2 or Term 1/2/3).

**Step 3: Academic Structure**
For each section: Section name + Code + Grades (add/remove) + Streams per grade (add labels).
Pre-fill with Cambridge structure: EYD (Nursery/Middle/Reception), CP (CP1-6), LS (LS1-3), IGCSE (1-2), AS/AL. Editable.

**Step 4: Grading System**
Grade boundary table: 9 rows (A* through U). Min % + Max % + Label + Description. Editable.
Pre-filled with Cambridge defaults.

**Step 5: Assessment Structure**
Per section: add assessment types. Pre-fill: FA1(20%), FA2(20%), Summative(60%) for EYD-LS. Summative(100%) for IGCSE+. Biweekly (no weight, internal only) for EYD-LS.

**Step 6: Subject Catalogue**
Add subjects + Department. Assign to grades (multi-select checkboxes). Pre-fill Cambridge subjects.

**Step 7: Character Framework**
Toggle CREED on/off. If on: value names (editable, default: Creativity/Respect/Excellence/Empathy/Discipline). Rating scale: Cambridge (A*-U) or Developmental (Emerging/Developing/Secure/Exceeding). EYD scale configurable separately.

**Step 8: Report Card Template**
Preview iframe showing sample report with school branding.
Toggles: Show student photo (on/off) | Show class position (on/off) | Show subject teacher name (on/off).
Text fields: HRT signature label | Head signature label | Footer text.

**Step 9: Feature Flags**
Grid of all flags (per spec Section 11.4) with on/off toggles.
Descriptions for each flag. Show impact: "Turning off Finance Gate removes the payment step from report release."

**Step 10: Admin Account**
Admin full name + email. "Create Account & Send Welcome Email" button.
On complete: creates school + all config + first admin + triggers welcome email.
Shows: "School [Name] successfully onboarded. School code: [CODE]"

### Feature Flag Control ([id]/page.tsx)
In school detail: feature flag grid showing current state.
Toggle any flag → immediate save → push notification to school's Super Admin: "EduCore has updated your [module] settings."
Show impact warning before disabling: "Disabling Finance Gate means reports can be released without payment confirmation."

### Subscription Management (subscriptions/page.tsx)
Table: School | Plan | Status | Students | Renewal Date | MRR
Actions: Upgrade Plan | Downgrade | Suspend | Reactivate | Cancel
Plan change: immediate (feature flags auto-adjust for new plan).

### Impersonation ([id]/impersonate/page.tsx)
Select school → select role → "Impersonate".
This creates a scoped JWT with the school's school_id + selected role.
ALWAYS writes to audit_logs: { event_type: 'platform_impersonation', platform_admin_id, school_id, role, timestamp }
Show persistent banner in impersonation session: "[Platform Admin name] — Viewing as [School Name] [Role]. Exit Impersonation."
Exit: clears impersonation JWT + logs exit event.

### Usage Metrics (metrics/page.tsx)
Per school: active users (last 7/30 days) | login count | reports generated | attendance records submitted | storage used.
Charts: use recharts or chart.js.
Export: CSV download.

## Critical Rules
- Platform admin uses service_role Supabase client (bypasses RLS) — never expose this key to mobile app
- Impersonation MUST be logged. No exceptions. Log both start and end of session.
- Platform admin has no visible presence in the school-facing mobile app
- Feature flag changes: immediate effect + notify school Super Admin
- Onboarding wizard: validate each step before allowing "Next". No partial schools.

## DO NOT
- Do not build this in React Native — it's a web panel (Next.js)
- Do not use the same Supabase anon key as the mobile app — use service_role for platform admin
- Do not show cross-school student data to any school user — platform admin only
- Do not allow school users to access the platform admin URL

---

# SESSION S15: Final Integration — Testing, Security Audit, App Store Prep

## Project Context
EduCore SMS — all modules complete (S01–S14). This final session runs integration testing, security checks, performance verification, and prepares app store submissions.

## Goal
Integration tests for critical paths, security audit of RLS policies, Expo EAS build configuration, app store assets, and final checklist verification.

## Working Directory
`C:\Users\Denny\3D Objects\APPS\EduCore`

## Create These Files
```
__tests__/rls/school-isolation.test.ts   -- RLS policy tests
__tests__/rls/role-permissions.test.ts   -- Role-based access tests
__tests__/integration/attendance.test.ts
__tests__/integration/marks-calculation.test.ts
__tests__/integration/report-workflow.test.ts
eas.json                                  -- EAS Build config
app.json                                  -- Final app.json with deep links, scheme
assets/icon.png                           -- App icon (1024x1024)
assets/splash.png                         -- Splash screen
assets/adaptive-icon.png                  -- Android adaptive icon
store/play-store-description.txt          -- Google Play Store listing
store/app-store-description.txt           -- Apple App Store listing
store/screenshots/                        -- Required store screenshots
```

## Test Specifications

### RLS Tests (rls/school-isolation.test.ts)
For every table, test:
- User from School A cannot SELECT data from School B
- User from School A cannot INSERT data into School B
- User from School A cannot UPDATE data in School B
- Platform admin (service_role) can access all schools

```typescript
// Pattern for each table:
it('students: school A user cannot see school B students', async () => {
  const schoolAClient = createClient(url, anonKey, { headers: { Authorization: `Bearer ${schoolAToken}` } });
  const { data } = await schoolAClient.from('students').select('*').eq('school_id', schoolBId);
  expect(data).toHaveLength(0); // RLS filters out all results
});
```

### Role Permission Tests (role-permissions.test.ts)
Test each role can only access what they're permitted:
- Parent: cannot see other students, cannot see medical notes
- ST: can only edit marks for their assigned subject+stream+semester
- Finance: cannot see marks or medical notes
- HRT: can see all students in their stream but not other streams (marks visibility)
- Admin: can see everything in their school

### Marks Calculation Tests (marks-calculation.test.ts)
Test the `calculate_student_total` DB function:
```
FA1=18, FA2=16, Summative=55 → raw=39.8 → rounded=40 → Grade E ✓
FA1=15, FA2=14, Summative=52 → raw=39.4 → rounded=39 → Grade F ✓
FA1=20, FA2=20, Summative=60 → raw=52.0 → rounded=52 → Grade D ✓
Mid-semester joiner (FA1=N/A): FA2 weight 40%, Summative 60% ✓
```

### Attendance Percentage Tests
```
Present=72, Late=4, AP=2, Absent=2, Total=80 → 97.5% → display 98% ✓
Student enrolled week 8 → denominator = days from enrollment, not semester start ✓
```

### Report Workflow Integration Test
Full pipeline: marks entered → window closed → HRT preview → HRT approve → Finance clear → Admin release → parent notification created.

### EAS Build Config (eas.json)
```json
{
  "cli": { "version": ">= 5.9.1" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "ios": { "credentialsSource": "remote" }
    }
  },
  "submit": {
    "production": {
      "android": { "serviceAccountKeyPath": "./service-account.json", "track": "production" },
      "ios": { "appleId": "...", "ascAppId": "..." }
    }
  }
}
```

### app.json Final Config
Must include:
```json
{
  "expo": {
    "name": "EduCore",
    "slug": "educore",
    "version": "1.0.0",
    "scheme": "educore",
    "plugins": [
      "expo-router",
      ["expo-notifications", { "sounds": [] }],
      "expo-local-authentication",
      ["expo-image-picker", { "photosPermission": "..." }]
    ],
    "android": {
      "package": "app.educore.sms",
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [{ "scheme": "educore" }],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    "ios": {
      "bundleIdentifier": "app.educore.sms",
      "associatedDomains": ["applinks:verify.educore.app"]
    }
  }
}
```

### Final Checklist Verification
Run through every item in IMPLEMENTATION_PLAN.md Section 10 for every module.
Create a `LAUNCH_CHECKLIST.md` with results.

### 3-Tap Rule Audit
Document every user task and count the taps required:
```
| Task | Role | Taps | Compliant |
|------|------|------|-----------|
| Mark attendance (all present) | HRT | 3 | ✓ |
| Submit register | HRT | 1 (after marking) | ✓ |
| Enter a mark | ST | 2 | ✓ |
| Approve a report | HRT | 3 | ✓ |
| View child's report | Parent | 2 | ✓ |
| Mark student as paid | Finance | 2 | ✓ |
| View student profile | Admin | 2 | ✓ |
```

## Critical Rules
- RLS tests must pass before any production build
- 3-tap rule: if ANY task takes > 3 taps, it must be fixed before launch
- `scheme: "educore"` in app.json: required for deep links to work
- EAS production build: requires Apple Developer + Google Play Console accounts
- Never commit service-account.json or .env files — add to .gitignore

## DO NOT
- Do not launch without passing RLS tests — data isolation is non-negotiable
- Do not use Expo Go for production builds — use EAS Build
- Do not skip the 3-tap audit — it's the core product law
- Do not include demo school data in production build

---

# QUICK REFERENCE — Session Startup Checklist

Before starting any session after S03:
1. Run `/clear` to start fresh
2. Copy the full session prompt block above
3. Verify previous session's files exist (spot-check 2-3 key files)
4. Update `SESSION_LOG.md` with what this session will build
5. Paste prompt → start building

## Stack reminder (include in every session if needed):
```
React Native (Expo SDK 52+) | Expo Router (file-based) | Supabase (Postgres + RLS)
Zustand (local state) | React Query / TanStack (server state)
Supabase Auth (JWT) | Supabase Edge Functions (Deno)
expo-haptics | expo-local-authentication | react-native-reanimated
react-native-gesture-handler | @shopify/flash-list | expo-image
```

## Key file locations:
```
components/ui/          → Design system primitives (S03)
stores/authStore.ts     → Auth state
lib/supabase.ts         → Supabase client
supabase/migrations/    → DB schema (S01/S02)
supabase/functions/     → Edge Functions
supabase/types/         → Generated TypeScript types
constants/colors.ts     → Color tokens (light + dark)
```
