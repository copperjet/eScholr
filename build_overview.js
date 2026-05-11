const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, Footer, AlignmentType, PageOrientation, LevelFormat,
        TabStopType, TabStopPosition, HeadingLevel, BorderStyle, WidthType,
        ShadingType, PageNumber, PageBreak } = require('docx');
const fs = require('fs');

const BRAND = "1E5AA8";       // eScholr deep blue
const BRAND_LIGHT = "E6EEF8"; // light blue tint
const ACCENT = "2E86DE";      // bright blue
const TEXT = "1F2937";        // near-black
const MUTED = "6B7280";

// ---------- helpers ----------
const P = (text, opts = {}) => new Paragraph({
  spacing: { before: 60, after: 60 },
  ...opts,
  children: [new TextRun({ text, color: TEXT, ...(opts.run || {}) })],
});

const H1 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 180 },
  children: [new TextRun({ text, color: BRAND, bold: true, size: 36 })],
  border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 4 } },
});

const H2 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 240, after: 120 },
  children: [new TextRun({ text, color: ACCENT, bold: true, size: 28 })],
});

const H3 = (text) => new Paragraph({
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 160, after: 80 },
  children: [new TextRun({ text, color: TEXT, bold: true, size: 24 })],
});

const Body = (text, opts = {}) => new Paragraph({
  spacing: { before: 60, after: 60, line: 300 },
  children: [new TextRun({ text, color: TEXT, size: 22, ...opts })],
});

const Bullet = (text) => new Paragraph({
  numbering: { reference: "bullets", level: 0 },
  spacing: { before: 30, after: 30 },
  children: [new TextRun({ text, color: TEXT, size: 22 })],
});

const BulletBold = (lead, rest) => new Paragraph({
  numbering: { reference: "bullets", level: 0 },
  spacing: { before: 30, after: 30 },
  children: [
    new TextRun({ text: lead, color: TEXT, size: 22, bold: true }),
    new TextRun({ text: rest, color: TEXT, size: 22 }),
  ],
});

const Spacer = (size = 120) => new Paragraph({ spacing: { before: size, after: 0 }, children: [] });

// Callout box (single-cell table with brand-light fill, brand left border)
const Callout = (title, body) => {
  const border = { style: BorderStyle.SINGLE, size: 4, color: BRAND_LIGHT };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        width: { size: 9360, type: WidthType.DXA },
        shading: { fill: BRAND_LIGHT, type: ShadingType.CLEAR },
        margins: { top: 160, bottom: 160, left: 240, right: 240 },
        borders: {
          top: border, bottom: border, right: border,
          left: { style: BorderStyle.SINGLE, size: 24, color: BRAND },
        },
        children: [
          new Paragraph({
            spacing: { before: 0, after: 60 },
            children: [new TextRun({ text: title, color: BRAND, bold: true, size: 24 })],
          }),
          new Paragraph({
            spacing: { before: 0, after: 0, line: 300 },
            children: [new TextRun({ text: body, color: TEXT, size: 22 })],
          }),
        ],
      })],
    })],
  });
};

// Two-column key/value style table for role experiences
const RoleTable = (rows) => {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2600, 6760],
    rows: rows.map((r, i) => new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: 2600, type: WidthType.DXA },
          shading: { fill: i === 0 ? BRAND : BRAND_LIGHT, type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
          children: [new Paragraph({
            children: [new TextRun({
              text: r[0], bold: true, size: 22,
              color: i === 0 ? "FFFFFF" : TEXT,
            })],
          })],
        }),
        new TableCell({
          borders,
          width: { size: 6760, type: WidthType.DXA },
          shading: { fill: i === 0 ? BRAND : "FFFFFF", type: ShadingType.CLEAR },
          margins: { top: 100, bottom: 100, left: 140, right: 140 },
          children: [new Paragraph({
            children: [new TextRun({
              text: r[1], size: 22,
              color: i === 0 ? "FFFFFF" : TEXT,
              bold: i === 0,
            })],
          })],
        }),
      ],
    })),
  });
};

// ---------- content ----------
const children = [];

// Cover
children.push(new Paragraph({
  spacing: { before: 1800, after: 120 },
  alignment: AlignmentType.LEFT,
  children: [new TextRun({ text: "eScholr", color: BRAND, bold: true, size: 96 })],
}));
children.push(new Paragraph({
  spacing: { before: 0, after: 240 },
  children: [new TextRun({ text: "Complete School Management, Reimagined.", color: ACCENT, size: 36, italics: true })],
}));
children.push(new Paragraph({
  spacing: { before: 0, after: 120 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 6 } },
  children: [new TextRun({ text: " ", size: 8 })],
}));
children.push(new Paragraph({
  spacing: { before: 240, after: 60 },
  children: [new TextRun({ text: "Product Overview for Marketing & Partner Engagement", color: TEXT, size: 26, bold: true })],
}));
children.push(new Paragraph({
  spacing: { before: 60, after: 60 },
  children: [new TextRun({ text: "An end-to-end school management platform built mobile-first for modern, multi-campus and international schools.", color: MUTED, size: 22 })],
}));
children.push(new Paragraph({ children: [new PageBreak()] }));

// 1. Introduction
children.push(H1("1. Introduction"));
children.push(Body("eScholr is a complete school management system that brings every part of running a school — academics, finance, admissions, HR, library, extracurriculars, and parent communication — into one cohesive platform. It works seamlessly across iOS, Android, and the web, with a mobile-first design that respects the way teachers, parents, and students actually use technology today."));
children.push(Body("Built for multi-tenant deployment, eScholr can power a single school or an entire network of schools from one secure platform. Each school operates in its own isolated workspace, with its own staff, students, branding, and configuration — all managed from one elegant interface."));
children.push(Spacer(120));
children.push(Callout(
  "The eScholr Promise",
  "No common task should take more than three taps. No screen should ever say \"Loading…\". Every workflow should feel as polished as the consumer apps your community already loves."
));

// 2. Who It Serves
children.push(H1("2. Who It Serves"));
children.push(Body("eScholr is purpose-built for the people inside a school community — not just administrators. Every role gets its own tailored experience."));

children.push(H3("Schools & School Networks"));
children.push(Bullet("International schools, private schools, and academies"));
children.push(Bullet("Multi-campus groups and education networks"));
children.push(Bullet("Schools transitioning from paper-based or fragmented digital systems"));
children.push(Bullet("Institutions that need granular role-based control across academic, finance, and HR functions"));

children.push(H3("People Inside the School"));
children.push(Bullet("Principals, coordinators, and heads of department"));
children.push(Bullet("Homeroom teachers and subject teachers"));
children.push(Bullet("Finance officers, HR officers, and front desk staff"));
children.push(Bullet("Librarians and ECA (extracurricular activity) coordinators"));
children.push(Bullet("Parents and students — fully integrated, not afterthoughts"));

children.push(H3("Education Operators"));
children.push(Bullet("Platform administrators managing multiple schools"));
children.push(Bullet("Regional partners onboarding new schools at scale"));

// 3. Core Modules
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("3. Core Modules"));
children.push(Body("eScholr is organized into modules that map directly to how a school actually operates. Each module can be enabled or disabled per school, so institutions only see what they use."));

children.push(H2("3.1 Academic Foundation"));
children.push(Body("The structural backbone of every school year."));
children.push(BulletBold("School Structure: ", "configure year groups, classes, sections, and subjects in a single visual editor."));
children.push(BulletBold("Academic Years & Semesters: ", "set up terms, semesters, and academic calendars with clear start and end dates."));
children.push(BulletBold("Calendar & Events: ", "school-wide calendar with holidays, exam windows, parent-teacher conferences, and custom events."));
children.push(BulletBold("Timetable: ", "upload or build class timetables, with automatic distribution to teachers, students, and parents."));
children.push(BulletBold("Promotion Wizard: ", "year-end promotion of entire cohorts to the next grade in one guided workflow."));

children.push(H2("3.2 Students & Admissions"));
children.push(BulletBold("Student Records: ", "comprehensive profiles with personal details, parents/guardians, medical notes, and academic history."));
children.push(BulletBold("Bulk Import: ", "spreadsheet-based onboarding for entire student rolls, with validation and error reporting."));
children.push(BulletBold("Student Credentials: ", "automated generation of student login accounts, ready for distribution."));
children.push(BulletBold("Inquiries: ", "front desk captures prospective family inquiries with assignment, notes, and follow-up tracking."));
children.push(BulletBold("Admissions Pipeline: ", "online application intake with document uploads, configurable requirements per school, and a one-click \"convert to enrolled student\" workflow."));
children.push(BulletBold("Visitor Log: ", "daily visitor sign-in and sign-out at the front desk."));
children.push(BulletBold("Parent Linking & Import: ", "connect parents to one or many children with bulk import support."));

children.push(H2("3.3 Attendance"));
children.push(BulletBold("Daily Attendance: ", "homeroom teachers mark attendance in seconds on mobile."));
children.push(BulletBold("Subject Attendance: ", "secondary schools can track attendance per period."));
children.push(BulletBold("Attendance History: ", "longitudinal view per student, per class, per term."));
children.push(BulletBold("Attendance Overview: ", "school-wide dashboards with trends and alerts."));
children.push(BulletBold("Threshold Alerts: ", "automatic notifications when a student's attendance falls below configurable thresholds."));
children.push(BulletBold("Attendance Correction: ", "audited corrections workflow for retroactive changes."));
children.push(BulletBold("Absence Notifications: ", "parents are automatically informed when their child is absent."));

children.push(H2("3.4 Marks & Assessments"));
children.push(BulletBold("Assessment Configuration: ", "define grading scales, weightings, and assessment components per school and grade."));
children.push(BulletBold("Marks Entry: ", "fast, mobile-friendly subject teacher workflow with auto-save."));
children.push(BulletBold("Marks Import: ", "spreadsheet upload for bulk marks entry."));
children.push(BulletBold("Marks Matrix: ", "school-wide grid view of completion status across classes and subjects."));
children.push(BulletBold("Marks Windows: ", "open and close entry windows by term so deadlines are enforced."));
children.push(BulletBold("Marks Unlock: ", "controlled, audit-logged exception workflow when changes are needed after a window closes."));
children.push(BulletBold("Completion Notifications: ", "automatic alerts when subjects finish entering marks."));

children.push(H2("3.5 Reports & Transcripts"));
children.push(BulletBold("Term Reports: ", "fully formatted, school-branded report cards generated from marks, attendance, and character data."));
children.push(BulletBold("Multi-Stage Approval: ", "homeroom teacher → coordinator → principal approval flow before release."));
children.push(BulletBold("Release Control: ", "schedule when reports become visible to parents."));
children.push(BulletBold("Verification: ", "shareable verification links so universities and employers can confirm authenticity."));
children.push(BulletBold("Transcripts: ", "official cumulative transcripts spanning multiple academic years."));
children.push(BulletBold("Predictions: ", "forward-looking academic predictions to support university applications."));
children.push(BulletBold("PDF Generation: ", "polished, print-ready PDFs delivered to parents and students in-app."));

children.push(H2("3.6 Day Book & Lesson Records"));
children.push(BulletBold("Daily Lesson Logs: ", "teachers record what was taught, homework given, and class observations."));
children.push(BulletBold("Coordinator Visibility: ", "leadership can review day books across classes."));
children.push(BulletBold("Daily Notifications: ", "automated digests keep coordinators and parents in the loop."));

children.push(H2("3.7 Homework & Assignments"));
children.push(BulletBold("Assign Homework: ", "subject teachers post homework with due dates and attachments."));
children.push(BulletBold("Student & Parent Visibility: ", "homework appears instantly in the student and parent apps."));
children.push(BulletBold("Notifications: ", "push notifications when new homework is posted."));

children.push(H2("3.8 Character & Creed"));
children.push(BulletBold("Behavior & Values Tracking: ", "structured observations of student character traits aligned with school values."));
children.push(BulletBold("Report Integration: ", "character data flows directly into formal report cards."));

children.push(H2("3.9 Communication"));
children.push(BulletBold("Announcements: ", "targeted school-wide, class-wide, or role-specific messages."));
children.push(BulletBold("Notifications Center: ", "every important event surfaces in one place per user."));
children.push(BulletBold("Notification Log: ", "administrators can audit what notifications were sent and when."));
children.push(BulletBold("Direct Messaging: ", "two-way messaging between teachers, parents, and students within school-controlled boundaries."));
children.push(BulletBold("Push, Email & In-App: ", "messages reach people on whichever channel they prefer."));

children.push(H2("3.10 Finance"));
children.push(BulletBold("Fee Structures: ", "configurable per grade, per term, per fee type."));
children.push(BulletBold("Student Finance Profiles: ", "full ledger view per student — invoices, payments, balances."));
children.push(BulletBold("Receipts: ", "professional, school-branded receipts generated on the fly."));
children.push(BulletBold("Finance Reports: ", "outstanding balances, collection rates, and revenue dashboards."));
children.push(BulletBold("Parent Visibility: ", "parents see exactly what is owed and what has been paid."));

children.push(H2("3.11 Front Desk"));
children.push(BulletBold("Inquiries Management: ", "log walk-in and call-in inquiries, assign to staff, and track to admission."));
children.push(BulletBold("Admissions Workflow: ", "review applications, request documents, accept or decline, and convert to active students."));
children.push(BulletBold("Visitor Sign-in: ", "secure visitor logbook for compliance and safety."));
children.push(BulletBold("Quick Student Lookup: ", "instantly find any student record from the front desk."));

children.push(H2("3.12 Library"));
children.push(BulletBold("Catalog Management: ", "books, copies, genres, and collections."));
children.push(BulletBold("Bulk Book Import: ", "onboard existing libraries quickly."));
children.push(BulletBold("Patrons: ", "students and staff as borrowers, with full loan history."));
children.push(BulletBold("Checkout & Return: ", "fast workflows for the front desk of the library, including barcode scanning."));
children.push(BulletBold("Quick Checkin / Checkout: ", "single-screen express modes for high-volume periods."));
children.push(BulletBold("Loans Tracking: ", "due dates, overdue alerts, and copy-level tracking."));
children.push(BulletBold("Collections: ", "curated reading lists and themed collections."));

children.push(H2("3.13 Extracurricular Activities (ECA)"));
children.push(BulletBold("Activity Catalog: ", "configure clubs, sports, and after-school programs."));
children.push(BulletBold("Allocation: ", "assign students to activities, with capacity limits and prerequisites."));
children.push(BulletBold("Session Attendance: ", "coaches and supervisors mark attendance per session."));
children.push(BulletBold("Session Reminders: ", "automated reminders to students and parents."));
children.push(BulletBold("Parent & Student Visibility: ", "everyone sees the activity schedule and attendance."));

children.push(H2("3.14 Human Resources"));
children.push(BulletBold("Staff Records: ", "complete staff profiles with roles, contracts, and contact details."));
children.push(BulletBold("Staff Documents: ", "secure storage for contracts, IDs, and qualifications."));
children.push(BulletBold("Certifications: ", "track teaching certifications with automatic expiry alerts."));
children.push(BulletBold("Leave Requests: ", "staff submit leave; managers approve in-app."));
children.push(BulletBold("Leave Balances: ", "live balances calculated against entitlements."));
children.push(BulletBold("Bulk Staff Import: ", "spreadsheet onboarding for entire teams."));

children.push(H2("3.15 Analytics & Insights"));
children.push(BulletBold("Class Analysis: ", "performance distributions, attendance trends, and outliers."));
children.push(BulletBold("Teacher Analysis: ", "subject-level outcome trends across classes."));
children.push(BulletBold("Student Analysis: ", "longitudinal view of academic progress and engagement."));
children.push(BulletBold("Dashboards: ", "role-aware dashboards that surface what each user needs first."));

// 4. Role Experiences
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("4. Role Experiences"));
children.push(Body("eScholr supports thirteen distinct roles, each with a tailored navigation, dashboard, and feature set. No user ever sees a button they cannot use."));
children.push(Spacer(80));

children.push(RoleTable([
  ["Role", "What They Do in eScholr"],
  ["Super Admin (Platform)", "Onboard new schools, monitor platform-wide metrics, broadcast announcements across schools, and impersonate school accounts for support."],
  ["School Super Admin", "Top-level authority within a single school — full module access and configuration rights."],
  ["Admin", "Day-to-day school operations: students, staff, structure, fees, modules, and audit logs."],
  ["Principal", "Strategic oversight, report approvals, school-wide analytics, and final sign-off on academic data."],
  ["Coordinator", "Academic coordination across grades — marks windows, report approval, and day book oversight."],
  ["Head of Department", "Subject-area leadership, teacher oversight, and curriculum monitoring."],
  ["Homeroom Teacher", "Daily attendance, character notes, term reports, parent communication, and class-level analysis."],
  ["Subject Teacher", "Marks entry, homework, day book, and ECA attendance for assigned subjects and activities."],
  ["Finance Officer", "Fee structures, receipts, student ledgers, collections reports, and finance dashboards."],
  ["HR Officer", "Staff records, certifications, leave management, and document storage."],
  ["Front Desk", "Inquiries, admissions, visitor log, and quick student lookups."],
  ["Librarian", "Catalog, patrons, checkout/checkin, loans, and collections."],
  ["Parent", "Children's attendance, marks, fees, homework, ECA, reports, and direct messaging with teachers."],
  ["Student", "Timetable, attendance, marks, homework, ECA, fees, reports, and announcements — all in one place."],
]));

// 5. Platform & Security
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("5. Platform & Security"));

children.push(H2("5.1 Multi-Tenant by Design"));
children.push(Body("Every school operates in its own secure workspace. Data is strictly isolated at the database level — no school can ever see another school's information, even by accident."));
children.push(Bullet("School-level branding, configuration, and module selection"));
children.push(Bullet("Per-school onboarding wizard for fast deployment"));
children.push(Bullet("Centralized platform administration without compromising tenant boundaries"));

children.push(H2("5.2 Security & Compliance"));
children.push(Bullet("Row-level security enforced on every record, every query, every time"));
children.push(Bullet("Role-based access control across thirteen distinct roles"));
children.push(Bullet("Encrypted data in transit and at rest"));
children.push(Bullet("Comprehensive audit logging of sensitive actions"));
children.push(Bullet("Biometric login on mobile (Face ID, Touch ID, fingerprint)"));
children.push(Bullet("School-code login flow that protects schools from cross-tenant credential leakage"));
children.push(Bullet("Password reset and impersonation logs for full support traceability"));

children.push(H2("5.3 Reliability & Continuity"));
children.push(Bullet("Automated backups on a configurable schedule"));
children.push(Bullet("Native Google Drive integration — schools can keep their own off-platform copy"));
children.push(Bullet("Full school data export for portability and regulatory compliance"));
children.push(Bullet("Real-time sync so changes appear instantly across devices"));

children.push(H2("5.4 Platform Administration"));
children.push(Bullet("School onboarding wizard for rapid deployment of new institutions"));
children.push(Bullet("Platform-wide metrics and health dashboards"));
children.push(Bullet("Cross-school broadcast messaging for product updates and policy notices"));
children.push(Bullet("Audited impersonation for support staff to assist schools without sharing passwords"));
children.push(Bullet("Per-school module configuration — turn capabilities on or off remotely"));

children.push(H2("5.5 Anywhere, Any Device"));
children.push(Bullet("Native iOS app"));
children.push(Bullet("Native Android app"));
children.push(Bullet("Full-featured web app — no install required"));
children.push(Bullet("Responsive desktop layouts with sidebar navigation"));
children.push(Bullet("Offline-friendly UX with optimistic updates"));

// 6. What Makes eScholr Different
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("6. What Makes eScholr Different"));
children.push(Body("Most school management systems are powerful but painful. eScholr is built on the conviction that powerful and pleasant can be the same product."));

children.push(Spacer(80));
children.push(Callout("The 3-Tap Rule",
  "No common task is ever more than three taps away. Marking attendance, entering marks, sending a message to a parent — every routine action is engineered for speed."));
children.push(Spacer(120));
children.push(Callout("Mobile-First, Not Mobile-Afterthought",
  "eScholr was designed on phones first. Teachers, parents, and students get the same fluid, native experience on the device that's already in their hand."));
children.push(Spacer(120));
children.push(Callout("Skeleton Screens, Never Spinners",
  "While data loads, eScholr shows a thoughtful preview of the screen — never a spinning wheel and never the words \"Loading…\". The app always feels fast, even on slow networks."));
children.push(Spacer(120));
children.push(Callout("Dark Mode From Day One",
  "Every screen is fully themed for both light and dark mode — easier on the eyes and reflective of how modern users actually use their devices."));
children.push(Spacer(120));
children.push(Callout("True Multi-Tenant Isolation",
  "Each school's data is enforced separate at the database layer with row-level security. This isn't a configuration option — it's an architectural guarantee."));
children.push(Spacer(120));
children.push(Callout("Designed for International Schools",
  "Built for the operational complexity that international and multi-campus schools actually face — multiple grade systems, fee currencies, languages, and reporting standards."));

children.push(H2("Quick Comparison"));
const compare = [
  ["What Schools Usually Get", "What eScholr Delivers"],
  ["Separate apps for finance, academics, HR, and library", "One unified platform — all roles, one login, one experience"],
  ["Desktop-only software with mobile bolted on", "Mobile-first design that's equally great on web"],
  ["Generic templates that don't reflect your brand", "School-branded reports, receipts, and communications"],
  ["Loading spinners and slow screens", "Instant skeleton screens and optimistic updates"],
  ["Single-tenant deployments per school", "Multi-tenant platform — onboard a new school in minutes"],
  ["Manual end-of-year promotions", "Guided promotion wizard for entire cohorts"],
  ["Spreadsheets for admissions and inquiries", "Built-in admissions pipeline with documents"],
  ["Email-only parent communication", "Integrated push, email, and in-app messaging"],
];
const compareBorder = { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" };
const cb = { top: compareBorder, bottom: compareBorder, left: compareBorder, right: compareBorder };
children.push(new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: [4680, 4680],
  rows: compare.map((r, i) => new TableRow({
    children: r.map(cell => new TableCell({
      borders: cb,
      width: { size: 4680, type: WidthType.DXA },
      shading: { fill: i === 0 ? BRAND : (i % 2 === 0 ? BRAND_LIGHT : "FFFFFF"), type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 140, right: 140 },
      children: [new Paragraph({
        children: [new TextRun({
          text: cell, size: 22,
          color: i === 0 ? "FFFFFF" : TEXT,
          bold: i === 0,
        })],
      })],
    })),
  })),
}));

// 7. Closing
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(H1("7. In Closing"));
children.push(Body("eScholr is more than software. It is a commitment to the families, teachers, and leaders who shape the next generation. Every workflow we ship is designed to give educators back the most precious resource they have — time."));
children.push(Body("From the principal reviewing report cards on a Sunday evening, to the parent checking their child's attendance during the morning commute, to the librarian processing twenty book returns in a single minute — eScholr is the quiet, capable presence that makes school operations feel light."));
children.push(Spacer(160));
children.push(Callout(
  "One Platform. Every Role. Every Device.",
  "eScholr is the school management system your community will actually want to use. We invite you to experience the difference."
));
children.push(Spacer(240));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "eScholr", color: BRAND, bold: true, size: 36 })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: "Complete School Management, Reimagined.", color: MUTED, italics: true, size: 22 })],
}));

// ---------- document ----------
const doc = new Document({
  creator: "eScholr",
  title: "eScholr — Complete School Management, Reimagined",
  styles: {
    default: { document: { run: { font: "Calibri", size: 22, color: TEXT } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, color: BRAND, font: "Calibri" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, color: ACCENT, font: "Calibri" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: TEXT, font: "Calibri" },
        paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 270 } } },
      }],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BRAND, space: 4 } },
          children: [
            new TextRun({ text: "eScholr", color: BRAND, bold: true, size: 22 }),
            new TextRun({ text: "\tProduct Overview", color: MUTED, size: 20 }),
          ],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
          children: [
            new TextRun({ text: "© eScholr — Confidential", color: MUTED, size: 18 }),
            new TextRun({ text: "\tPage ", color: MUTED, size: 18 }),
            new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 18 }),
            new TextRun({ text: " of ", color: MUTED, size: 18 }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], color: MUTED, size: 18 }),
          ],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = "C:\\Users\\Denny\\3D Objects\\APPS\\eScholr\\eScholr_Product_Overview.docx";
  fs.writeFileSync(out, buf);
  console.log("WROTE:", out, buf.length, "bytes");
});
