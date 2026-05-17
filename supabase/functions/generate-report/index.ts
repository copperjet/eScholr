/**
 * generate-report — Supabase Edge Function
 *
 * POST /functions/v1/generate-report
 * Body: { report_id: string }
 * Auth: Bearer <user JWT>
 *
 * Deployment notes:
 *   - Set env var CHROME_WS_ENDPOINT if using a remote Chrome service (recommended for production).
 *     e.g. ws://chrome-service:3000  (Browserless, chrome-aws-lambda, etc.)
 *   - Without it the function tries to launch Chrome locally (works in Docker sidecar setup).
 *   - Set env var SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *   - Storage bucket "reports" must exist with public read access.
 */

import puppeteer from "npm:puppeteer-core@22.15.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userJWT      = authHeader.replace("Bearer ", "");

    const adminClient  = createClient(supabaseUrl, serviceKey);
    const userClient   = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // ── Input ─────────────────────────────────────────────────
    const { report_id } = await req.json() as { report_id: string };
    if (!report_id) return json({ error: "report_id required" }, 400);

    // ── Fetch all report data ─────────────────────────────────
    const { data: report, error: rErr } = await adminClient
      .from("reports")
      .select(`
        id, status, hrt_comment, overall_percentage, class_position,
        approved_by, approved_at, released_at,
        students (
          id, full_name, student_number, date_of_birth, gender, photo_url, stream_id,
          grades ( name ),
          streams ( name ),
          school_sections ( name )
        ),
        semesters (
          id, name, start_date, end_date, academic_year_id,
          academic_years ( name )
        ),
        schools (
          id, name, logo_url, primary_color, secondary_color, currency
        )
      `)
      .eq("id", report_id)
      .single();

    if (rErr || !report) return json({ error: "Report not found" }, 404);

    const r = report as any;
    const schoolId    = r.schools?.id;
    const semesterId  = r.semesters?.id;
    const studentId   = r.students?.id;
    const schoolColor = r.schools?.primary_color ?? "#1B2A4A";
    const accentColor = r.schools?.secondary_color ?? "#E8A020";

    // ── Marks ─────────────────────────────────────────────────
    const { data: marks } = await adminClient
      .from("marks")
      .select("assessment_type, value, is_excused, subjects(name, department)")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .eq("semester_id", semesterId)
      .not("assessment_type", "eq", "biweekly");

    // ── CREED ─────────────────────────────────────────────────
    const { data: creed } = await adminClient
      .from("character_records")
      .select("creativity, respect, excellence, empathy, discipline")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .eq("semester_id", semesterId)
      .maybeSingle();

    // ── Attendance summary ─────────────────────────────────────
    const { data: attRows } = await adminClient.rpc("get_attendance_summary", {
      p_student_id: studentId,
      p_semester_id: semesterId,
    });
    const att = (attRows as any)?.[0] ?? { present_count: 0, absent_count: 0, late_count: 0, total_days: 0, percentage: 0 };

    // ── HRT name ──────────────────────────────────────────────
    const { data: hrtAsgn } = await adminClient
      .from("hrt_assignments")
      .select("staff(full_name)")
      .eq("school_id", schoolId)
      .eq("semester_id", semesterId)
      .eq("stream_id", r.students?.stream_id ?? "")
      .maybeSingle();
    const hrtName = (hrtAsgn as any)?.staff?.full_name ?? "Class Teacher";

    // ── Grading helper ────────────────────────────────────────
    const { data: gradingRows } = await adminClient
      .from("grading_scales")
      .select("grade_label, min_percentage, max_percentage")
      .eq("school_id", schoolId)
      .order("min_percentage", { ascending: false });

    function gradeLabel(pct: number | null): string {
      if (pct === null) return "—";
      const scale = (gradingRows ?? []) as any[];
      const row = scale.find(g => pct >= g.min_percentage && pct <= g.max_percentage);
      return row?.grade_label ?? "—";
    }

    // ── Build subject rows ────────────────────────────────────
    const subjectMap: Record<string, Record<string, { value: number | null; excused: boolean }>> = {};
    for (const m of (marks ?? []) as any[]) {
      const name = m.subjects?.name ?? "Unknown";
      subjectMap[name] = subjectMap[name] ?? {};
      subjectMap[name][m.assessment_type] = { value: m.value, excused: m.is_excused };
    }

    function weightedTotal(subj: Record<string, { value: number | null; excused: boolean }>): number | null {
      const fa1 = subj.fa1?.value; const fa2 = subj.fa2?.value; const sum = subj.summative?.value;
      if (fa1 !== undefined && fa2 !== undefined && sum !== undefined &&
          fa1 !== null && fa2 !== null && sum !== null) {
        return Math.round(((fa1 * 0.2) + (fa2 * 0.2) + (sum * 0.6)) * 10) / 10;
      }
      if (sum !== undefined && sum !== null && fa1 === undefined && fa2 === undefined) return sum;
      return null;
    }

    const subjectRows = Object.entries(subjectMap).map(([name, types]) => {
      const total = weightedTotal(types);
      return { name, fa1: types.fa1?.value ?? null, fa2: types.fa2?.value ?? null,
               summative: types.summative?.value ?? null, total, grade: gradeLabel(total) };
    });

    const isIGCSE = !subjectRows.some(r => r.fa1 !== null || r.fa2 !== null);
    const isDraft  = !["approved","finance_pending","released"].includes(r.status);

    // ── Compute & persist overall_percentage ──────────────────
    const subjectTotals = subjectRows.map(s => s.total).filter((t): t is number => t !== null);
    const computedOverallPct = subjectTotals.length > 0
      ? Math.round((subjectTotals.reduce((a, b) => a + b, 0) / subjectTotals.length) * 10) / 10
      : null;

    if (computedOverallPct !== null) {
      await adminClient
        .from("reports")
        .update({ overall_percentage: computedOverallPct, updated_at: new Date().toISOString() })
        .eq("id", report_id);
    }

    // ── Verification token ─────────────────────────────────────
    let verToken = "";
    const { data: rvRow } = await adminClient
      .from("report_versions")
      .select("verification_token")
      .eq("report_id", report_id)
      .eq("is_current", true)
      .maybeSingle();
    verToken = (rvRow as any)?.verification_token ?? "";

    // ── Generate HTML ─────────────────────────────────────────
    const html = buildReportHTML({
      school: r.schools, student: r.students, semester: r.semesters,
      subjectRows, creed: creed as any, att, hrtName, hrtComment: r.hrt_comment,
      overallPct: computedOverallPct ?? r.overall_percentage, classPos: r.class_position,
      schoolColor, accentColor, isIGCSE, isDraft, verToken,
    });

    // ── Puppeteer → PDF ───────────────────────────────────────
    const wsEndpoint = Deno.env.get("CHROME_WS_ENDPOINT");
    const browser = wsEndpoint
      ? await puppeteer.connect({ browserWSEndpoint: wsEndpoint })
      : await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });
    await browser.close();

    // ── Upload to Storage ─────────────────────────────────────
    const filename = `reports/${schoolId}/${semesterId}/${studentId}/report-${Date.now()}.pdf`;
    const { data: uploadData, error: upErr } = await adminClient.storage
      .from("reports")
      .upload(filename, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

    const { data: { publicUrl } } = adminClient.storage.from("reports").getPublicUrl(filename);

    // ── Upsert report_versions ────────────────────────────────
    // Mark old version non-current
    await adminClient.from("report_versions")
      .update({ is_current: false })
      .eq("report_id", report_id)
      .eq("is_current", true);

    const { data: newVersion } = await adminClient.from("report_versions")
      .insert({
        school_id: schoolId,
        report_id,
        approved_at: r.approved_at ?? new Date().toISOString(),
        approved_by: r.approved_by,
        pdf_url: publicUrl,
        is_current: true,
      })
      .select("id, verification_token")
      .single();

    return json({ pdf_url: publicUrl, version_id: (newVersion as any)?.id });

  } catch (err: any) {
    console.error("generate-report error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── HTML Report Template ───────────────────────────────────────
interface ReportData {
  school: any; student: any; semester: any;
  subjectRows: { name: string; fa1: number|null; fa2: number|null; summative: number|null; total: number|null; grade: string }[];
  creed: { creativity:string; respect:string; excellence:string; empathy:string; discipline:string } | null;
  att: { present_count:number; absent_count:number; late_count:number; ap_count:number; total_days:number; percentage:number };
  hrtName: string; hrtComment: string | null;
  overallPct: number | null; classPos: number | null;
  schoolColor: string; accentColor: string;
  isIGCSE: boolean; isDraft: boolean; verToken: string;
}

function buildReportHTML(d: ReportData): string {
  const sc = d.schoolColor; const ac = d.accentColor;

  const fmtVal  = (v: number | null) => v === null ? "—" : v.toFixed(0);
  const attPct  = Number(d.att.percentage ?? 0).toFixed(1);
  const dob     = d.student?.date_of_birth ? new Date(d.student.date_of_birth).toLocaleDateString("en-GB", { day:"2-digit", month:"long", year:"numeric" }) : "—";
  const sem     = d.semester?.name ?? "";
  const year    = d.semester?.academic_years?.name ?? "";
  const grade   = d.student?.grades?.name ?? "";
  const stream  = d.student?.streams?.name ?? "";

  const creedLabels = { creativity:"Creativity", respect:"Respect", excellence:"Excellence", empathy:"Empathy", discipline:"Discipline" };
  const creedGradeColor: Record<string, string> = {
    "A*":"#10B981","A":"#3B82F6","B":"#6366F1","C":"#F59E0B","D":"#F97316","E":"#EF4444","U":"#6B7280",
    "EX":"#10B981","GD":"#3B82F6","DE":"#F59E0B","EM":"#EF4444",
  };

  const subjectTableRows = d.subjectRows.map(r => `
    <tr>
      <td class="subject-name">${esc(r.name)}</td>
      ${!d.isIGCSE ? `<td class="mark-cell">${fmtVal(r.fa1)}</td><td class="mark-cell">${fmtVal(r.fa2)}</td>` : ""}
      <td class="mark-cell">${fmtVal(r.summative)}</td>
      <td class="mark-cell total">${fmtVal(r.total)}</td>
      <td class="grade-cell"><span class="grade-badge">${esc(r.grade)}</span></td>
    </tr>`).join("");

  const creedRows = d.creed ? Object.entries(creedLabels).map(([key, label]) => {
    const val = (d.creed as any)[key] ?? "—";
    const color = creedGradeColor[val] ?? "#6B7280";
    return `<div class="creed-item"><span class="creed-label">${label}</span><span class="creed-grade" style="background:${color}18;color:${color};border:1px solid ${color}40">${val}</span></div>`;
  }).join("") : `<p style="color:#9CA3AF;font-size:12px">Not yet entered</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1F2937; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 16mm 16mm 12mm; position: relative; }

  /* DRAFT watermark */
  ${d.isDraft ? `.page::before { content: "DRAFT"; position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%) rotate(-35deg); font-size: 90px; font-weight: 900; color: rgba(239,68,68,0.08); letter-spacing: 10px; white-space: nowrap; pointer-events: none; z-index: 0; }` : ""}

  .content { position: relative; z-index: 1; }

  /* ── Header ── */
  .header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 3px solid ${sc}; margin-bottom: 14px; }
  .school-logo { width: 64px; height: 64px; border-radius: 8px; object-fit: contain; }
  .school-logo-placeholder { width: 64px; height: 64px; border-radius: 8px; background: ${sc}; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 22px; font-weight: 800; }
  .school-info { flex: 1; }
  .school-name { font-size: 20px; font-weight: 800; color: ${sc}; line-height: 1.2; }
  .report-title { font-size: 13px; color: #6B7280; margin-top: 2px; }
  .report-meta { text-align: right; font-size: 12px; color: #6B7280; line-height: 1.6; }

  /* ── Student block ── */
  .student-block { background: ${sc}08; border-left: 4px solid ${ac}; border-radius: 0 8px 8px 0; padding: 12px 16px; margin-bottom: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
  .field { display: flex; flex-direction: column; }
  .field-label { font-size: 10px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; }
  .field-value { font-size: 13px; font-weight: 600; color: #1F2937; }

  /* ── Marks table ── */
  .section-title { font-size: 11px; font-weight: 800; color: ${sc}; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid ${sc}30; }
  .section { margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: ${sc}; color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 7px 8px; text-align: center; letter-spacing: 0.3px; }
  th.left { text-align: left; }
  td { padding: 7px 8px; border-bottom: 1px solid #F3F4F6; font-size: 12px; }
  tr:nth-child(even) td { background: #F9FAFB; }
  .subject-name { font-weight: 600; color: #1F2937; text-align: left; }
  .mark-cell { text-align: center; color: #374151; }
  .mark-cell.total { font-weight: 700; color: ${sc}; }
  .grade-cell { text-align: center; }
  .grade-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 800; background: ${sc}18; color: ${sc}; }

  /* ── Summary row ── */
  .summary-row { display: flex; gap: 12px; align-items: stretch; margin-bottom: 14px; }
  .summary-card { flex: 1; background: ${sc}06; border: 1px solid ${sc}20; border-radius: 8px; padding: 10px 14px; }
  .summary-label { font-size: 10px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.5px; }
  .summary-value { font-size: 22px; font-weight: 900; color: ${sc}; line-height: 1.1; margin-top: 2px; }
  .summary-sub { font-size: 11px; color: #6B7280; margin-top: 2px; }

  /* ── Attendance bar ── */
  .att-bar-wrap { margin-top: 6px; }
  .att-bar-track { height: 8px; border-radius: 4px; background: #E5E7EB; overflow: hidden; }
  .att-bar-fill { height: 8px; border-radius: 4px; background: ${Number(d.att.percentage)>=90?"#10B981":Number(d.att.percentage)>=80?"#F59E0B":"#EF4444"}; }
  .att-pills { display: flex; gap: 8px; margin-top: 6px; }
  .att-pill { font-size: 10px; color: #6B7280; }

  /* ── CREED ── */
  .creed-grid { display: flex; gap: 8px; flex-wrap: wrap; }
  .creed-item { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 60px; }
  .creed-label { font-size: 10px; color: #9CA3AF; font-weight: 600; text-transform: uppercase; }
  .creed-grade { font-size: 14px; font-weight: 800; padding: 4px 12px; border-radius: 8px; }

  /* ── HRT comment ── */
  .comment-box { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #374151; line-height: 1.6; font-style: italic; }

  /* ── Signatures ── */
  .signatures { display: flex; gap: 24px; margin-top: 6px; }
  .sig-block { flex: 1; border-top: 1.5px solid #D1D5DB; padding-top: 6px; }
  .sig-name { font-size: 12px; font-weight: 700; color: #1F2937; }
  .sig-label { font-size: 10px; color: #9CA3AF; }

  /* ── Footer ── */
  .footer { position: absolute; bottom: 10mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #E5E7EB; padding-top: 6px; }
  .footer-left { font-size: 10px; color: #9CA3AF; }
  .ver-token { font-family: monospace; font-size: 10px; color: #9CA3AF; letter-spacing: 1px; }
</style>
</head>
<body>
<div class="page">
  <div class="content">

    <!-- Header -->
    <div class="header">
      <div class="school-logo-placeholder">${esc(d.school?.name?.charAt(0) ?? "E")}</div>
      <div class="school-info">
        <div class="school-name">${esc(d.school?.name ?? "School")}</div>
        <div class="report-title">Student Progress Report — ${esc(sem)}</div>
      </div>
      <div class="report-meta">
        ${esc(year)}<br>
        ${esc(sem)}<br>
        ${d.classPos ? `Class Position: <strong>${ordinal(d.classPos)}</strong>` : ""}
      </div>
    </div>

    <!-- Student block -->
    <div class="student-block">
      <div class="field"><span class="field-label">Student Name</span><span class="field-value">${esc(d.student?.full_name ?? "—")}</span></div>
      <div class="field"><span class="field-label">Student No.</span><span class="field-value">${esc(d.student?.student_number ?? "—")}</span></div>
      <div class="field"><span class="field-label">Grade / Class</span><span class="field-value">${esc(grade)} · ${esc(stream)}</span></div>
      <div class="field"><span class="field-label">Date of Birth</span><span class="field-value">${esc(dob)}</span></div>
    </div>

    <!-- Overall summary -->
    <div class="summary-row">
      <div class="summary-card">
        <div class="summary-label">Overall Average</div>
        <div class="summary-value">${d.overallPct !== null ? Number(d.overallPct).toFixed(1) + "%" : "—"}</div>
        <div class="summary-sub">${d.subjectRows.length} subject${d.subjectRows.length !== 1 ? "s" : ""}</div>
      </div>
      <div class="summary-card" style="flex:2">
        <div class="summary-label">Attendance — ${attPct}%</div>
        <div class="att-bar-wrap">
          <div class="att-bar-track"><div class="att-bar-fill" style="width:${Math.min(100,Number(d.att.percentage))}%"></div></div>
        </div>
        <div class="att-pills">
          <span class="att-pill">✓ ${d.att.present_count} Present</span>
          <span class="att-pill">✗ ${d.att.absent_count} Absent</span>
          <span class="att-pill">⏱ ${d.att.late_count} Late</span>
          <span class="att-pill">📋 ${d.att.ap_count ?? 0} AP</span>
          <span class="att-pill">of ${d.att.total_days} days</span>
        </div>
      </div>
    </div>

    <!-- Subject marks table -->
    <div class="section">
      <div class="section-title">Academic Performance</div>
      <table>
        <thead>
          <tr>
            <th class="left">Subject</th>
            ${!d.isIGCSE ? `<th>FA1 (20%)</th><th>FA2 (20%)</th>` : ""}
            <th>${d.isIGCSE ? "Examination (100%)" : "Summative (60%)"}</th>
            <th>Total</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>${subjectTableRows || `<tr><td colspan="${d.isIGCSE ? 4 : 6}" style="text-align:center;color:#9CA3AF;padding:16px">No marks recorded for this semester</td></tr>`}</tbody>
      </table>
    </div>

    <!-- CREED -->
    <div class="section">
      <div class="section-title">Character — CREED</div>
      <div class="creed-grid">${creedRows}</div>
    </div>

    <!-- HRT Comment -->
    <div class="section">
      <div class="section-title">Class Teacher's Comment</div>
      ${d.hrtComment
        ? `<div class="comment-box">"${esc(d.hrtComment)}"</div>`
        : `<div class="comment-box" style="color:#9CA3AF">No comment recorded.</div>`}
    </div>

    <!-- Signatures -->
    <div class="section">
      <div class="signatures">
        <div class="sig-block">
          <div class="sig-name">${esc(d.hrtName)}</div>
          <div class="sig-label">Class Teacher</div>
        </div>
        <div class="sig-block">
          <div class="sig-name">&nbsp;</div>
          <div class="sig-label">Head of School</div>
        </div>
        <div class="sig-block">
          <div class="sig-name">&nbsp;</div>
          <div class="sig-label">Parent / Guardian</div>
        </div>
      </div>
    </div>

  </div><!-- /content -->

  <!-- Footer -->
  <div class="footer">
    <div class="footer-left">
      EduCore — Confidential. For official use only.
      ${d.isDraft ? '<span style="color:#EF4444;font-weight:700"> · DRAFT — NOT FOR RELEASE</span>' : ""}
    </div>
    ${d.verToken ? `<div class="ver-token">Verify: ${d.verToken}</div>` : ""}
  </div>
</div>
</body>
</html>`;
}

function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function ordinal(n: number): string {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v-20)%10] ?? s[v] ?? s[0]);
}
