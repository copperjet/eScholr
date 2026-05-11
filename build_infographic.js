const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageOrientation, LevelFormat,
  TabStopType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, ImageRun, VerticalAlign,
} = require('docx');
const fs = require('fs');

// ── Brand palette ─────────────────────────────────────────────────────────────
const BRAND       = "1E5AA8";
const BRAND_DARK  = "0D2F6E";
const ACCENT      = "2E86DE";
const TEAL        = "0E7490";
const GREEN       = "047857";
const NAVY        = "1B2A4A";
const WHITE       = "FFFFFF";
const NEAR_BLACK  = "111827";
const MUTED       = "6B7280";

// Category header colors + matching body tint
const CAT = {
  platform:   { hdr: NAVY,       body: "E2E8F0" },
  leadership: { hdr: BRAND_DARK, body: "E6EEF8" },
  admin:      { hdr: BRAND,      body: "EBF3FC" },
  coord:      { hdr: ACCENT,     body: "EBF5FF" },
  teacher:    { hdr: "1D6AA5",   body: "E8F2FB" },
  ops:        { hdr: TEAL,       body: "E0F4F7" },
  community:  { hdr: GREEN,      body: "DCFCE7" },
};

// ── Role data ─────────────────────────────────────────────────────────────────
const ROLES = [
  {
    name: "Platform Super Admin",
    tag: "Platform Operations",
    cat: "platform",
    features: [
      "Onboard and configure new schools",
      "Platform-wide metrics & health dashboard",
      "Broadcast announcements to all schools",
      "Impersonate school accounts for support",
      "Enable / disable modules per school",
      "Full impersonation audit log",
      "Export school data for compliance",
    ],
  },
  {
    name: "School Super Admin",
    tag: "Institution Authority",
    cat: "leadership",
    features: [
      "All module access across the school",
      "School branding & global settings",
      "User roles & access management",
      "Enable or disable school features",
      "Override any school-level action",
      "Final authority on data & config",
    ],
  },
  {
    name: "Administrator",
    tag: "Daily School Operations",
    cat: "admin",
    features: [
      "Student enrol, edit & bulk import",
      "Staff management & bulk import",
      "Parent linking & import",
      "School structure & semester setup",
      "Timetable upload & calendar",
      "Fee structures & admissions config",
      "Assessment config & marks windows",
      "Backup settings & audit log",
    ],
  },
  {
    name: "Principal",
    tag: "Strategic Leadership",
    cat: "leadership",
    features: [
      "School-wide analytics dashboard",
      "Final report card approval & release",
      "Marks matrix across all classes",
      "Calendar & event management",
      "School-wide announcements",
      "Promotion wizard sign-off",
    ],
  },
  {
    name: "Coordinator",
    tag: "Academic Coordination",
    cat: "coord",
    features: [
      "Marks entry window management",
      "Report approval workflow",
      "Day book review across classes",
      "Attendance overview & trends",
      "Grade-level analysis",
      "Marks unlock authorisation",
    ],
  },
  {
    name: "Head of Department",
    tag: "Subject Leadership",
    cat: "coord",
    features: [
      "Subject-area marks oversight",
      "Teacher performance view",
      "Analysis by subject & class",
      "Curriculum monitoring",
      "HOD-level announcements",
    ],
  },
  {
    name: "Homeroom Teacher",
    tag: "Class Guardian",
    cat: "teacher",
    features: [
      "Daily class attendance",
      "Character & values observations",
      "Term report compilation",
      "Parent & student messaging",
      "Homework management",
      "Day book entries",
      "Class-level analysis",
    ],
  },
  {
    name: "Subject Teacher",
    tag: "Curriculum Delivery",
    cat: "teacher",
    features: [
      "Marks entry & spreadsheet import",
      "Homework posting",
      "Day book lesson records",
      "ECA session attendance",
      "Class list & student view",
      "Subject analysis dashboard",
    ],
  },
  {
    name: "Finance Officer",
    tag: "Financial Management",
    cat: "ops",
    features: [
      "Fee structure configuration",
      "Student ledgers & balances",
      "Receipt generation & history",
      "Outstanding payments report",
      "Finance dashboards",
    ],
  },
  {
    name: "HR Officer",
    tag: "People Management",
    cat: "ops",
    features: [
      "Staff records & profiles",
      "Document & contract storage",
      "Certification expiry tracking",
      "Leave request approval",
      "Leave balance management",
      "Staff add / edit",
    ],
  },
  {
    name: "Front Desk",
    tag: "First Point of Contact",
    cat: "ops",
    features: [
      "Inquiry logging & assignment",
      "Admissions application pipeline",
      "Application document review",
      "One-click convert to student",
      "Visitor sign-in / sign-out",
      "Quick student lookup",
    ],
  },
  {
    name: "Librarian",
    tag: "Knowledge Centre",
    cat: "ops",
    features: [
      "Book catalog & copy tracking",
      "Bulk book import",
      "Patron (student & staff) management",
      "Checkout & return (barcode scan)",
      "Overdue loans & alerts",
      "Curated collections",
    ],
  },
  {
    name: "Parent",
    tag: "Family Portal",
    cat: "community",
    features: [
      "Real-time attendance alerts",
      "Marks & term reports",
      "Fee balance & payment history",
      "Homework visibility",
      "ECA schedule & attendance",
      "Direct messaging with teachers",
      "School announcements",
    ],
  },
  {
    name: "Student",
    tag: "Learner Portal",
    cat: "community",
    features: [
      "Personal timetable",
      "Own attendance record",
      "Marks & report cards",
      "Homework list & due dates",
      "ECA activities",
      "Fee balance",
      "School announcements",
    ],
  },
];

// ── Geometry ───────────────────────────────────────────────────────────────────
// Landscape US Letter: pass portrait dims + orientation flag
// Content width = long edge (15840) − 2 × margin
const MARGIN  = 720;  // 0.5 inch
const PG_W    = 15840 - 2 * MARGIN;  // 14400 DXA

const COL3    = Math.floor(PG_W / 3);      // 4800 DXA (3-col)
const COL3_R  = PG_W - COL3 * 2;          // remainder for last col
const COL2    = Math.floor(PG_W / 2);      // 7200 DXA (2-col)
const COL2_R  = PG_W - COL2;

// ── Low-level helpers ─────────────────────────────────────────────────────────
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: "D1D5DB" };
const thinBorders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

const boldBorder = (color) => ({ style: BorderStyle.SINGLE, size: 10, color });
const cardBorders = (color) => ({
  top: boldBorder(color), bottom: boldBorder(color),
  left: boldBorder(color), right: boldBorder(color),
});

// ── Card builders ─────────────────────────────────────────────────────────────
function makeRoleCard(role, colW) {
  const { hdr, body } = CAT[role.cat];
  const headerBorders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: hdr },
    left: { style: BorderStyle.SINGLE, size: 1, color: hdr },
    right: { style: BorderStyle.SINGLE, size: 1, color: hdr },
    bottom: { style: BorderStyle.NONE, size: 0, color: hdr },
  };
  const bodyBordersCell = {
    top: { style: BorderStyle.NONE, size: 0, color: hdr },
    left: { style: BorderStyle.SINGLE, size: 1, color: hdr },
    right: { style: BorderStyle.SINGLE, size: 1, color: hdr },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: hdr },
  };

  return new Table({
    width: { size: colW - 80, type: WidthType.DXA },
    columnWidths: [colW - 80],
    rows: [
      // Header row
      new TableRow({
        children: [new TableCell({
          width: { size: colW - 80, type: WidthType.DXA },
          shading: { fill: hdr, type: ShadingType.CLEAR },
          borders: headerBorders,
          margins: { top: 140, bottom: 100, left: 200, right: 140 },
          children: [
            new Paragraph({
              spacing: { before: 0, after: 0 },
              children: [new TextRun({ text: role.name, color: WHITE, bold: true, size: 26, font: "Calibri" })],
            }),
            new Paragraph({
              spacing: { before: 40, after: 0 },
              children: [new TextRun({ text: role.tag, color: "C7D9F0", italics: true, size: 18, font: "Calibri" })],
            }),
          ],
        })],
      }),
      // Body row
      new TableRow({
        children: [new TableCell({
          width: { size: colW - 80, type: WidthType.DXA },
          shading: { fill: body, type: ShadingType.CLEAR },
          borders: bodyBordersCell,
          margins: { top: 100, bottom: 120, left: 180, right: 140 },
          children: role.features.map(f =>
            new Paragraph({
              numbering: { reference: "bullets", level: 0 },
              spacing: { before: 40, after: 40 },
              children: [new TextRun({ text: f, color: NEAR_BLACK, size: 20, font: "Calibri" })],
            })
          ),
        })],
      }),
    ],
  });
}

// Outer cell wrapping a card (for the 3-col layout)
function wrapCell(role, colW) {
  return new TableCell({
    width: { size: colW, type: WidthType.DXA },
    borders: noBorders,
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    verticalAlign: VerticalAlign.TOP,
    children: [makeRoleCard(role, colW)],
  });
}

function emptyCell(colW) {
  const { hdr, body } = CAT.community;
  return new TableCell({
    width: { size: colW, type: WidthType.DXA },
    borders: noBorders,
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    verticalAlign: VerticalAlign.TOP,
    children: [new Table({
      width: { size: colW - 80, type: WidthType.DXA },
      columnWidths: [colW - 80],
      rows: [new TableRow({
        children: [new TableCell({
          width: { size: colW - 80, type: WidthType.DXA },
          shading: { fill: "F3F4F6", type: ShadingType.CLEAR },
          borders: { top: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                     bottom: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                     left: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" },
                     right: { style: BorderStyle.SINGLE, size: 1, color: "E5E7EB" } },
          margins: { top: 200, bottom: 200, left: 200, right: 200 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "One Platform.", color: BRAND, bold: true, size: 28, font: "Calibri" })],
            }),
            new Paragraph({
              spacing: { before: 80 },
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Every Role.", color: ACCENT, bold: true, size: 28, font: "Calibri" })],
            }),
            new Paragraph({
              spacing: { before: 80 },
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "Every Device.", color: TEAL, bold: true, size: 28, font: "Calibri" })],
            }),
          ],
        })],
      })],
    })],
  });
}

function makeRow3(roles, widths) {
  return new TableRow({
    children: roles.map((r, i) => wrapCell(r, widths[i])),
  });
}

function make3ColTable(roleGroup) {
  // roleGroup: array of roles, length 3 (pad with null)
  const widths = [COL3, COL3, COL3_R];
  const cells = roleGroup.map((r, i) =>
    r ? wrapCell(r, widths[i]) : emptyCell(widths[i])
  );
  return new Table({
    width: { size: PG_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [new TableRow({ children: cells })],
  });
}

function make2ColTable(roleA, roleB) {
  return new Table({
    width: { size: PG_W, type: WidthType.DXA },
    columnWidths: [COL2, COL2_R],
    rows: [new TableRow({
      children: [wrapCell(roleA, COL2), wrapCell(roleB, COL2_R)],
    })],
  });
}

// ── Logo header ───────────────────────────────────────────────────────────────
const logoData = fs.readFileSync("C:\\Users\\Denny\\3D Objects\\APPS\\eScholr\\eScholr\\assets\\scholr-main-logo.png");

function makeCoverHeader(pageLabel) {
  const borderBottom = { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 4 };
  return [
    new Table({
      width: { size: PG_W, type: WidthType.DXA },
      columnWidths: [2600, PG_W - 2600],
      rows: [new TableRow({
        children: [
          // Logo cell
          new TableCell({
            width: { size: 2600, type: WidthType.DXA },
            borders: noBorders,
            margins: { top: 0, bottom: 0, left: 0, right: 200 },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({
              children: [new ImageRun({
                type: "png",
                data: logoData,
                transformation: { width: 190, height: 143 },
                altText: { title: "eScholr Logo", description: "eScholr logo", name: "logo" },
              })],
            })],
          }),
          // Title cell
          new TableCell({
            width: { size: PG_W - 2600, type: WidthType.DXA },
            borders: noBorders,
            margins: { top: 40, bottom: 0, left: 200, right: 0 },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                spacing: { before: 0, after: 60 },
                children: [
                  new TextRun({ text: "eScholr ", color: BRAND, bold: true, size: 52, font: "Calibri" }),
                  new TextRun({ text: "Role & Feature Guide", color: NEAR_BLACK, bold: false, size: 40, font: "Calibri" }),
                ],
              }),
              new Paragraph({
                spacing: { before: 0, after: 0 },
                children: [new TextRun({ text: `Complete School Management Platform  |  ${pageLabel}`, color: MUTED, size: 20, font: "Calibri" })],
              }),
            ],
          }),
        ],
      })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 2 } },
      children: [],
    }),
  ];
}

// ── Spacer paragraph ──────────────────────────────────────────────────────────
const Spacer = (h = 80) => new Paragraph({ spacing: { before: h, after: 0 }, children: [] });

// ── Build sections ────────────────────────────────────────────────────────────
const page1 = [
  ...makeCoverHeader("Page 1 of 2  — Platform, Leadership & Administration"),
  make3ColTable([ROLES[0], ROLES[1], ROLES[2]]),   // Platform SA, School SA, Admin
  Spacer(60),
  make3ColTable([ROLES[3], ROLES[4], ROLES[5]]),   // Principal, Coordinator, HOD
];

const page2Children = [
  ...makeCoverHeader("Page 2 of 2  — Teaching, Operations & Community"),
  make3ColTable([ROLES[6], ROLES[7], ROLES[8]]),   // HRT, ST, Finance
  Spacer(60),
  make3ColTable([ROLES[9], ROLES[10], ROLES[11]]),  // HR, Front Desk, Librarian
  Spacer(60),
  make3ColTable([ROLES[12], ROLES[13], null]),       // Parent, Student, tagline
];

// ── Document ──────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "eScholr",
  title: "eScholr Role & Feature Infographic",
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: "–",      // en-dash bullet
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 320, hanging: 200 } } },
      }],
    }],
  },
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
  },
  sections: [
    // Page 1
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: page1,
    },
    // Page 2
    {
      properties: {
        type: "nextPage",
        page: {
          size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children: page2Children,
    },
  ],
});

Packer.toBuffer(doc).then(buf => {
  const out = "C:\\Users\\Denny\\3D Objects\\APPS\\eScholr\\eScholr_Role_Infographic.docx";
  fs.writeFileSync(out, buf);
  console.log("WROTE:", out, buf.length, "bytes");
});
