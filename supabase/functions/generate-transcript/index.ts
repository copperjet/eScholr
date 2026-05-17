/**
 * generate-transcript (v2 — pdf-lib edition)
 *
 * POST /functions/v1/generate-transcript
 * Auth:  Bearer <SERVICE_ROLE_KEY>  (called by pdf-job-runner only)
 * Body:  { transcript_id: string }
 *
 * Pipeline:
 *   1. Load transcripts row (student_id + academic_year_ids).
 *   2. Pull assessment_templates for the student's grade (dynamic
 *      columns, no hardcoded fa1/fa2/summative).
 *   3. Aggregate marks year → semester → subject.
 *   4. Render PDF with pdf-lib.
 *   5. Upload to school-assets, insert pdf_versions row,
 *      mirror pdf_url + status='ready' onto transcripts.
 *
 * Feature gate: schools.feature_pdf_v2_transcripts must be true.
 * If false, the function refuses so the runner marks the job failed —
 * a clear signal to roll out the canary or revert.
 */
import { rgb } from "npm:pdf-lib@1.17.1";
import { serviceClient, uploadPdf } from "../_shared/pdfUpload.ts";
import {
  insertVersion,
  markParentFailed,
  markParentGenerating,
  markParentSuccess,
  nextVersionNumber,
} from "../_shared/pdfVersions.ts";
import { A4, Cursor, Fonts, Margins, newDoc, parseHex } from "../_shared/pdf/layout.ts";
import { drawFooterOnAllPages, drawHeader, drawSectionTitle, SchoolBrand } from "../_shared/pdf/branding.ts";
import { Column, drawInfoStrip, drawTable } from "../_shared/pdf/tables.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface AssessmentTemplate {
  id:             string;
  code:           string;
  name:           string;
  weight_percent: number;
  is_on_report:   boolean;
  order_index:    number;
}

interface MarkRow {
  assessment_type: string;
  value:           number;
  subject_id:      string;
  semester_id:     string;
  subjects:        { id: string; name: string } | null;
}

interface SemesterRow {
  id:                string;
  name:              string;
  academic_year_id:  string;
  start_date:        string | null;
}

interface ReportRow {
  semester_id:         string;
  overall_percentage:  number | null;
  class_position:      number | null;
}

interface AcademicYearRow {
  id:         string;
  name:       string;
  start_date: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return json({ error: "Forbidden" }, 403);
  }

  let transcript_id = "";
  const admin = serviceClient();

  try {
    const body = await req.json() as { transcript_id?: string };
    transcript_id = body?.transcript_id ?? "";
    if (!transcript_id) return json({ error: "transcript_id required" }, 400);

    await markParentGenerating(admin, "transcript", transcript_id);

    // ── Load transcript row ──
    const { data: trow, error: tErr } = await admin
      .from("transcripts")
      .select("id, school_id, student_id, academic_year_ids")
      .eq("id", transcript_id)
      .single();
    if (tErr || !trow) throw new Error("Transcript not found");

    const schoolId       = (trow as any).school_id as string;
    const studentId      = (trow as any).student_id as string;
    const yearIds        = ((trow as any).academic_year_ids ?? []) as string[];
    if (!schoolId || !studentId || yearIds.length === 0) {
      throw new Error("transcript row missing required fields");
    }

    // ── Feature gate ──
    const { data: school, error: sErr } = await admin
      .from("schools")
      .select(`
        id, name, logo_url, primary_color, secondary_color,
        address, phone, email, footer_text,
        feature_pdf_v2_transcripts
      `)
      .eq("id", schoolId)
      .single();
    if (sErr || !school) throw new Error("School not found");
    if (!(school as any).feature_pdf_v2_transcripts) {
      throw new Error("feature_pdf_v2_transcripts disabled for this school");
    }

    // ── Student ──
    const { data: student, error: stErr } = await admin
      .from("students")
      .select(`
        id, full_name, student_number, date_of_birth, gender, photo_url,
        stream_id,
        grades ( id, name ),
        streams ( name )
      `)
      .eq("id", studentId)
      .single();
    if (stErr || !student) throw new Error("Student not found");

    const gradeId = ((student as any).grades?.id ?? null) as string | null;

    // ── Assessment templates (dynamic, grade-scoped) ──
    const { data: templateRows } = await admin
      .from("assessment_templates")
      .select(`
        id, code, name, weight_percent, is_on_report, order_index,
        assessment_template_grades ( grade_id )
      `)
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .not("code", "is", null)
      .neq("code", "biweekly")
      .order("order_index");

    const templates: AssessmentTemplate[] = ((templateRows ?? []) as any[])
      .filter((t: any) => {
        const links: any[] = t.assessment_template_grades ?? [];
        if (links.length === 0) return true;
        return links.some((l: any) => l.grade_id === gradeId);
      })
      .filter((t: any) => t.is_on_report)
      .map((t: any) => ({
        id:             t.id,
        code:           t.code,
        name:           t.name,
        weight_percent: t.weight_percent ?? 0,
        is_on_report:   t.is_on_report,
        order_index:    t.order_index ?? 0,
      }));

    // ── Years + semesters ──
    const { data: yearsData } = await admin
      .from("academic_years")
      .select("id, name, start_date")
      .in("id", yearIds)
      .order("start_date", { ascending: true });
    const years: AcademicYearRow[] = (yearsData ?? []) as any;

    const { data: semData } = await admin
      .from("semesters")
      .select("id, name, academic_year_id, start_date")
      .in("academic_year_id", yearIds)
      .order("start_date", { ascending: true });
    const semesters: SemesterRow[] = (semData ?? []) as any;
    const semesterIds = semesters.map((s) => s.id);

    // ── Marks ──
    const { data: marksData } = semesterIds.length === 0 ? { data: [] as any[] } : await admin
      .from("marks")
      .select(`
        assessment_type, value, subject_id, semester_id,
        subjects ( id, name )
      `)
      .eq("student_id", studentId)
      .eq("school_id", schoolId)
      .in("semester_id", semesterIds)
      .not("value", "is", null);
    const marks: MarkRow[] = (marksData ?? []) as any;

    // ── Reports (for overall) ──
    const { data: reportsData } = semesterIds.length === 0 ? { data: [] as any[] } : await admin
      .from("reports")
      .select("semester_id, overall_percentage, class_position")
      .eq("student_id", studentId)
      .eq("school_id", schoolId)
      .in("semester_id", semesterIds)
      .eq("status", "released");
    const reports: ReportRow[] = (reportsData ?? []) as any;

    // ── Grading scale ──
    const { data: scaleData } = await admin
      .from("grading_scales")
      .select("grade_label, min_percentage, max_percentage")
      .eq("school_id", schoolId)
      .order("min_percentage", { ascending: false });
    const scales: any[] = scaleData ?? [];
    const labelFor = (pct: number | null): string => {
      if (pct === null) return "—";
      const s = scales.find((s) => pct >= s.min_percentage && pct <= s.max_percentage);
      return s?.grade_label ?? "—";
    };

    // ── Render ──
    const bytes = await renderTranscript({
      school: school as any,
      student: student as any,
      years,
      semesters,
      marks,
      reports,
      templates,
      labelFor,
    });

    const versionNumber = await nextVersionNumber(admin, "transcript", transcript_id);
    const { pdfUrl }    = await uploadPdf(admin, {
      docType:       "transcript",
      schoolId,
      docId:         transcript_id,
      versionNumber,
      bytes,
    });
    await insertVersion(admin, {
      docType:       "transcript",
      docId:         transcript_id,
      schoolId,
      versionNumber,
      pdfUrl,
    });
    await markParentSuccess(admin, "transcript", transcript_id, pdfUrl);

    return json({ pdf_url: pdfUrl, version: versionNumber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-transcript error:", msg);
    if (transcript_id) {
      try { await markParentFailed(admin, "transcript", transcript_id, msg); }
      catch (_) { /* ignore */ }
    }
    return json({ error: msg }, 500);
  }
});

interface RenderArgs {
  school:    any;
  student:   any;
  years:     AcademicYearRow[];
  semesters: SemesterRow[];
  marks:     MarkRow[];
  reports:   ReportRow[];
  templates: AssessmentTemplate[];
  labelFor:  (pct: number | null) => string;
}

interface SubjectRow {
  subjectId:   string;
  subjectName: string;
  marksByCode: Record<string, number | null>;
  total:       number | null;
  grade:       string;
}

async function renderTranscript(args: RenderArgs): Promise<Uint8Array> {
  const { school, student, years, semesters, marks, reports, templates, labelFor } = args;

  const brand: SchoolBrand = {
    name:           school?.name           ?? "School",
    logoUrl:        school?.logo_url       ?? null,
    primaryColor:   school?.primary_color  ?? "#1B2A4A",
    secondaryColor: school?.secondary_color ?? "#E8A020",
    address:        school?.address        ?? null,
    phone:          school?.phone          ?? null,
    email:          school?.email          ?? null,
    footerText:     school?.footer_text    ?? "Official Academic Transcript",
  };

  const ctx = await newDoc();
  const cur = new Cursor(ctx);
  const primary   = parseHex(brand.primaryColor,   rgb(0.105, 0.165, 0.290));
  const secondary = parseHex(brand.secondaryColor, rgb(0.910, 0.627, 0.125));
  const softBg    = rgb(0.973, 0.976, 0.984);

  await drawHeader(ctx, cur, brand, "Academic Transcript");

  // Student info strip
  const dob = student?.date_of_birth
    ? new Date(student.date_of_birth).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
  drawInfoStrip(
    ctx, cur,
    [
      ["Student",       student?.full_name             ?? "—"],
      ["Student ID",    student?.student_number        ?? "—"],
      ["Date of Birth", dob],
      ["Current Grade", `${student?.grades?.name ?? "—"} · ${student?.streams?.name ?? "—"}`],
    ],
    softBg, primary,
  );

  // Per-year, per-semester sections
  for (const year of years) {
    drawSectionTitle(ctx, cur, year.name, primary, secondary);

    const yearSems = semesters.filter((s) => s.academic_year_id === year.id);
    if (yearSems.length === 0) {
      cur.ensure(18);
      cur.page.drawText("No semester data recorded for this year.", {
        x: Margins.left, y: cur.y - 12,
        font: ctx.italic, size: Fonts.bodySize, color: rgb(0.55, 0.55, 0.6),
      });
      cur.advance(20);
      continue;
    }

    for (const sem of yearSems) {
      cur.ensure(36);
      cur.page.drawText(sem.name, {
        x: Margins.left, y: cur.y - 14,
        font: ctx.bold, size: Fonts.subheadSize - 1, color: primary,
      });
      const rep = reports.find((r) => r.semester_id === sem.id);
      if (rep?.overall_percentage !== undefined && rep?.overall_percentage !== null) {
        const overall = `Overall: ${rep.overall_percentage.toFixed(1)}%  ·  Grade: ${labelFor(rep.overall_percentage)}${rep.class_position ? `  ·  Position: ${rep.class_position}` : ""}`;
        const w = ctx.regular.widthOfTextAtSize(overall, Fonts.smallSize);
        cur.page.drawText(overall, {
          x: A4.width - Margins.right - w, y: cur.y - 14,
          font: ctx.regular, size: Fonts.smallSize, color: rgb(0.4, 0.4, 0.45),
        });
      }
      cur.advance(22);

      // Aggregate subjects for this semester
      const semMarks = marks.filter((m) => m.semester_id === sem.id);
      const subjectMap = new Map<string, SubjectRow>();
      for (const m of semMarks) {
        const sid = m.subjects?.id ?? m.subject_id;
        if (!sid) continue;
        if (!subjectMap.has(sid)) {
          subjectMap.set(sid, {
            subjectId:   sid,
            subjectName: m.subjects?.name ?? "Unknown",
            marksByCode: {},
            total:       null,
            grade:       "—",
          });
        }
        const row = subjectMap.get(sid)!;
        if (templates.some((t) => t.code === m.assessment_type)) {
          row.marksByCode[m.assessment_type] = m.value;
        }
      }

      // Compute totals
      for (const row of subjectMap.values()) {
        let sum = 0;
        let allPresent = true;
        let hasAny = false;
        for (const t of templates) {
          const v = row.marksByCode[t.code] ?? null;
          if (v === null) { allPresent = false; }
          else { sum += v * (t.weight_percent / 100); hasAny = true; }
        }
        if (hasAny && allPresent) {
          row.total = Math.round(sum);
          row.grade = labelFor(row.total);
        }
      }

      const subjectRows = Array.from(subjectMap.values());
      if (subjectRows.length === 0) {
        cur.ensure(18);
        cur.page.drawText("No marks recorded.", {
          x: Margins.left, y: cur.y - 12,
          font: ctx.italic, size: Fonts.bodySize, color: rgb(0.55, 0.55, 0.6),
        });
        cur.advance(20);
        continue;
      }

      // Dynamic columns: Subject + one per assessment template + Total + Grade
      const cols: Column<SubjectRow>[] = [
        { header: "Subject", flex: 2, align: "left", format: (r) => r.subjectName },
        ...templates.map<Column<SubjectRow>>((t) => ({
          header: t.name,
          flex:   1,
          align:  "right",
          format: (r) => {
            const v = r.marksByCode[t.code];
            return v === null || v === undefined ? "—" : String(v);
          },
        })),
        { header: "Total", width: 50, align: "right", format: (r) => r.total === null ? "—" : String(r.total) },
        { header: "Grade", width: 50, align: "center", format: (r) => r.grade },
      ];

      drawTable(
        ctx, cur, cols, subjectRows,
        { headerBg: primary, headerFg: rgb(1, 1, 1), altRowBg: softBg },
      );

      cur.advance(8);
    }

    cur.advance(8);
  }

  // Footer signature
  cur.ensure(80);
  cur.advance(40);
  const sigX = A4.width - Margins.right - 200;
  cur.page.drawLine({
    start: { x: sigX, y: cur.y },
    end:   { x: sigX + 200, y: cur.y },
    thickness: 0.8, color: rgb(0.4, 0.4, 0.45),
  });
  cur.page.drawText("Registrar's Signature", {
    x: sigX, y: cur.y - 12,
    font: ctx.regular, size: Fonts.smallSize, color: rgb(0.4, 0.4, 0.45),
  });
  cur.page.drawText(`Issued on: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}`, {
    x: Margins.left, y: cur.y - 12,
    font: ctx.regular, size: Fonts.smallSize, color: rgb(0.4, 0.4, 0.45),
  });

  drawFooterOnAllPages(ctx, brand);
  return new Uint8Array(await ctx.doc.save());
}
