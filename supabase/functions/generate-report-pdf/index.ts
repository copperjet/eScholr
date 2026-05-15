/**
 * generate-report-pdf (Phase 4 — Cloudflare Browser Rendering)
 *
 * POST /functions/v1/generate-report-pdf
 * Auth:  Bearer <SERVICE_ROLE_KEY>  (called by pdf-job-runner only)
 * Body:  { report_id: string, is_preview?: boolean }
 *
 * HTML → PDF via shared renderHTML helper (requires CHROME_WS_ENDPOINT).
 * Versioning + verification token preserved. Storage + status updates
 * route through the unified _shared helpers.
 */
import QRCode from "npm:qrcode@1.5.3";
import { serviceClient, uploadPdf } from "../_shared/pdfUpload.ts";
import {
  insertVersion,
  markParentFailed,
  markParentGenerating,
  markParentSuccess,
  nextVersionNumber,
  newVerificationToken,
} from "../_shared/pdfVersions.ts";
import { renderHTML } from "../_shared/renderHTML.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return json({ error: "Forbidden" }, 403);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const db          = serviceClient();

  let report_id  = "";
  let is_preview = false;

  try {
    const body = await req.json() as { report_id?: string; is_preview?: boolean };
    report_id  = body?.report_id ?? "";
    is_preview = !!body?.is_preview;
    if (!report_id) return json({ error: "report_id required" }, 400);

    if (!is_preview) {
      await markParentGenerating(db, "report", report_id);
    }

    // ── Fetch full report data ──
    const { data: report, error: rErr } = await db
      .from("reports")
      .select(`
        id, status, hrt_comment, overall_percentage, class_position, student_id,
        students (
          id, full_name, student_number, date_of_birth, gender, photo_url,
          streams ( name, grades ( id, name ), school_sections ( name ) )
        ),
        semesters ( id, name, start_date, end_date, academic_years ( name ) ),
        schools ( id, name, logo_url, primary_color, secondary_color,
                  show_class_position, show_student_photo, hrt_signature_label,
                  head_signature_label, footer_text )
      `)
      .eq("id", report_id)
      .single();
    if (rErr || !report) return json({ error: "Report not found" }, 404);

    const student:  any = (report as any).students;
    const semester: any = (report as any).semesters;
    const school:   any = (report as any).schools;
    const schoolId: string = school?.id ?? "";

    // ── Marks ──
    const { data: marks } = await db
      .from("marks")
      .select(`
        assessment_type, value, subject_id,
        subjects ( name ),
        staff ( full_name )
      `)
      .eq("student_id", (report as any).student_id)
      .eq("semester_id", semester.id)
      .not("value", "is", null);

    // ── Assessment templates (dynamic) ──
    const gradeId: string = student.streams?.grades?.id ?? null;
    const { data: templateRows } = await db
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

    const assessments = ((templateRows ?? []) as any[]).filter((t: any) => {
      const links: any[] = t.assessment_template_grades ?? [];
      if (links.length === 0) return true;
      return links.some((l: any) => l.grade_id === gradeId);
    });

    type SubjectEntry = { id: string; name: string; marksByCode: Record<string, number | null>; teacher: string };
    const subjectMap: Record<string, SubjectEntry> = {};
    ((marks ?? []) as any[]).forEach((m: any) => {
      const sId = m.subject_id;
      if (!subjectMap[sId]) {
        subjectMap[sId] = { id: sId, name: m.subjects?.name ?? sId, marksByCode: {}, teacher: m.staff?.full_name ?? "" };
      }
      if (assessments.some((a: any) => a.code === m.assessment_type)) {
        subjectMap[sId].marksByCode[m.assessment_type] = m.value;
      }
    });

    // ── Grading scale ──
    const { data: scales } = await db
      .from("grading_scales")
      .select("grade_label, min_percentage, max_percentage")
      .eq("school_id", schoolId)
      .order("min_percentage", { ascending: false });

    const getGrade = (total: number | null) => {
      if (total === null) return "—";
      const scale = ((scales ?? []) as any[]).find(
        (s: any) => total >= s.min_percentage && total <= s.max_percentage,
      );
      return scale?.grade_label ?? "—";
    };

    const computeTotal = (marksByCode: Record<string, number | null>): number | null => {
      let total = 0;
      let allPresent = true;
      let hasAny = false;
      for (const a of assessments) {
        const val = marksByCode[a.code] ?? null;
        if (val === null) { allPresent = false; }
        else { total += val * (a.weight_percent / 100); hasAny = true; }
      }
      if (!hasAny || !allPresent) return null;
      return Math.round(total);
    };

    // ── Subject remarks ──
    const { data: remarkRows } = await db
      .from("report_subject_remarks")
      .select("subject_id, remark")
      .eq("report_id", report_id);
    const remarkBySubject: Record<string, string> = {};
    ((remarkRows ?? []) as any[]).forEach((r: any) => { remarkBySubject[r.subject_id] = r.remark; });

    // ── CREED ──
    const { data: creed } = await db
      .from("character_records")
      .select("creativity, respect, excellence, empathy, discipline")
      .eq("student_id", (report as any).student_id)
      .eq("semester_id", semester.id)
      .single();

    // ── Attendance ──
    const { data: attRows } = await db
      .from("attendance_records")
      .select("status")
      .eq("student_id", (report as any).student_id)
      .eq("semester_id", semester.id);
    const att = { P: 0, A: 0, L: 0, AP: 0, S: 0 };
    ((attRows ?? []) as any[]).forEach((r: any) => { if (r.status in att) att[r.status as keyof typeof att]++; });
    const attTotal = Object.values(att).reduce((a, b) => a + b, 0);
    const attPct   = attTotal > 0 ? Math.round((att.P / attTotal) * 100) : 0;

    // ── Framework labels ──
    const { data: framework } = await db
      .from("character_frameworks")
      .select("value_names, rating_scale")
      .eq("school_id", schoolId)
      .single();
    const creedLabels: string[] = (framework as any)?.value_names?.length === 5
      ? (framework as any).value_names
      : ["Creativity", "Respect", "Excellence", "Empathy", "Discipline"];
    const creedKeys = ["creativity", "respect", "excellence", "empathy", "discipline"];

    // ── Version + token ──
    const verificationToken = newVerificationToken();
    const versionNumber     = await nextVersionNumber(db, "report", report_id);
    const isDraft           = is_preview || (report as any).status !== "released";
    const primaryColor      = school?.primary_color   ?? "#1B2A4A";
    const secondaryColor    = school?.secondary_color ?? "#E8A020";

    // ── Verification QR ──
    const verifyBase = (Deno.env.get("VERIFY_REPORT_URL") ?? `${supabaseUrl}/functions/v1/verify-report`).replace(/\/$/, "");
    const verifyUrl  = `${verifyBase}?token=${verificationToken}`;
    let qrDataUrl = "";
    try {
      qrDataUrl = await QRCode.toDataURL(verifyUrl, { errorCorrectionLevel: "M", margin: 1, width: 144 });
    } catch (qErr) {
      console.error("QR generation failed", qErr);
    }

    // ── HTML ──
    const reportAssessments = assessments.filter((a: any) => a.is_on_report);
    const assessmentHeaders = reportAssessments.map((a: any) => `<th>${a.name}</th>`).join("");
    const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c] as string));
    const subjectRows = Object.values(subjectMap)
      .map((s) => {
        const total = computeTotal(s.marksByCode);
        const grade = getGrade(total);
        const markCells = reportAssessments
          .map((a: any) => `<td>${s.marksByCode[a.code] ?? "—"}</td>`)
          .join("");
        const remark = remarkBySubject[s.id];
        const remarkRow = remark
          ? `<tr class="remark-row"><td colspan="${reportAssessments.length + 4}" style="font-size:9pt;color:#4b5563;font-style:italic;padding:4px 10px 10px 24px;background:#fff">↳ ${escapeHtml(remark)}</td></tr>`
          : "";
        return `<tr><td>${s.name}</td>${markCells}<td>${total ?? "—"}</td><td><strong>${grade}</strong></td><td>${s.teacher}</td></tr>${remarkRow}`;
      })
      .join("");

    const overallGrade = getGrade((report as any).overall_percentage);
    const creedRows = creedKeys
      .map((k, i) => `<tr><td>${creedLabels[i]}</td><td>${(creed as any)?.[k] ?? "—"}</td></tr>`)
      .join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; }
  .report-card { max-width: 800px; margin: 0 auto; padding: 32px; }
  .header { border-top: 6px solid ${primaryColor}; padding: 20px 0 16px; display: flex; align-items: center; gap: 20px; margin-bottom: 16px; }
  .header img.logo { height: 64px; width: auto; object-fit: contain; }
  .header-text h1 { font-size: 18pt; color: ${primaryColor}; }
  .header-text h2 { font-size: 12pt; color: ${secondaryColor}; letter-spacing: 2px; margin-top: 4px; }
  .header-text p { font-size: 9pt; color: #666; margin-top: 4px; }
  .student-photo { width: 72px; height: 72px; border-radius: 4px; object-fit: cover; margin-left: auto; }
  .student-info { background: ${primaryColor}10; border-radius: 6px; padding: 12px 16px; display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .student-info span { font-size: 10pt; }
  .student-info strong { color: ${primaryColor}; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt; }
  th { background: ${primaryColor}; color: #fff; padding: 8px 10px; text-align: left; font-size: 9.5pt; }
  td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  tfoot td { background: ${primaryColor}10; font-weight: 700; }
  .section-title { font-size: 11pt; font-weight: 700; color: ${primaryColor}; margin-bottom: 8px; border-left: 4px solid ${secondaryColor}; padding-left: 10px; }
  .section { margin-bottom: 20px; }
  .creed-table td:first-child { width: 200px; }
  .attendance-grid { display: flex; gap: 16px; flex-wrap: wrap; }
  .att-item { text-align: center; background: #f3f4f6; border-radius: 6px; padding: 8px 16px; }
  .att-item .val { font-size: 16pt; font-weight: 700; color: ${primaryColor}; }
  .att-item .lbl { font-size: 8pt; color: #6b7280; }
  .comment-box { background: #f9fafb; border-left: 4px solid ${secondaryColor}; padding: 12px 16px; font-style: italic; border-radius: 0 6px 6px 0; }
  .signatures { display: flex; gap: 60px; margin-top: 24px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
  .sig-line { text-align: center; }
  .sig-line hr { width: 160px; border: 1px solid #374151; margin-bottom: 6px; }
  .sig-label { font-size: 9pt; color: #374151; }
  .footer { margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e7eb; display: flex; align-items: flex-end; justify-content: space-between; }
  .footer-text { font-size: 8pt; color: #9ca3af; max-width: 60%; }
  .qr-wrap { text-align: center; }
  .qr-wrap img { width: 72px; height: 72px; }
  .qr-label { font-size: 7pt; color: #9ca3af; margin-top: 4px; }
  .watermark { position: fixed; top: 38%; left: 10%; font-size: 72pt; font-weight: 900; color: #9ca3af; opacity: 0.18; transform: rotate(-45deg); pointer-events: none; z-index: 999; letter-spacing: 8px; }
</style>
</head><body>
<div class="report-card">
  <div class="header">
    ${school?.logo_url ? `<img class="logo" src="${school.logo_url}" />` : ""}
    <div class="header-text">
      <h1>${school?.name ?? "School Name"}</h1>
      <h2>STUDENT REPORT CARD</h2>
      <p>Academic Year: ${semester.academic_years?.name ?? "—"} | ${semester.name}</p>
    </div>
    ${school?.show_student_photo && student.photo_url ? `<img class="student-photo" src="${student.photo_url}" />` : ""}
  </div>

  <div class="student-info">
    <span><strong>Student:</strong> ${student.full_name}</span>
    <span><strong>ID:</strong> ${student.student_number}</span>
    <span><strong>Grade:</strong> ${student.streams?.grades?.name ?? "—"} | <strong>Stream:</strong> ${student.streams?.name ?? "—"}</span>
    ${school?.show_class_position && (report as any).class_position ? `<span><strong>Position:</strong> ${(report as any).class_position}</span>` : ""}
  </div>

  <div class="section">
    <div class="section-title">Academic Performance</div>
    <table>
      <thead><tr><th>Subject</th>${assessmentHeaders}<th>Total</th><th>Grade</th><th>Teacher</th></tr></thead>
      <tbody>${subjectRows}</tbody>
      <tfoot><tr>
        <td colspan="4" style="text-align:right;padding-right:12px">Overall Average</td>
        <td>${(report as any).overall_percentage !== null ? (report as any).overall_percentage.toFixed(1) + "%" : "—"}</td>
        <td>${overallGrade}</td><td></td>
      </tr></tfoot>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Character Assessment (CREED)</div>
    <table class="creed-table">
      <thead><tr><th>Value</th><th>Grade</th></tr></thead>
      <tbody>${creedRows}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Attendance Summary</div>
    <div class="attendance-grid">
      <div class="att-item"><div class="val">${att.P}</div><div class="lbl">Present</div></div>
      <div class="att-item"><div class="val">${att.A}</div><div class="lbl">Absent</div></div>
      <div class="att-item"><div class="val">${att.L}</div><div class="lbl">Late</div></div>
      <div class="att-item"><div class="val">${att.AP}</div><div class="lbl">Approved</div></div>
      <div class="att-item"><div class="val">${attTotal}</div><div class="lbl">Total Days</div></div>
      <div class="att-item"><div class="val" style="color:${attPct >= 85 ? "#10b981" : "#ef4444"}">${attPct}%</div><div class="lbl">Attendance</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Class Teacher's Comment</div>
    <div class="comment-box">${(report as any).hrt_comment ?? "<em>No comment provided.</em>"}</div>
  </div>

  <div class="signatures">
    <div class="sig-line"><hr/><div class="sig-label">${school?.hrt_signature_label ?? "Class Teacher"}</div></div>
    <div class="sig-line"><hr/><div class="sig-label">${school?.head_signature_label ?? "Head of School"}</div></div>
  </div>

  <div class="footer">
    <p class="footer-text">${school?.footer_text ?? ""}</p>
    <div class="qr-wrap">
      ${qrDataUrl
        ? `<img src="${qrDataUrl}" alt="Verification QR" />`
        : `<div style="width:72px;height:72px;background:#f3f4f6;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#9ca3af">${verificationToken}</div>`}
      <div class="qr-label">Scan to verify · ${verificationToken}</div>
    </div>
  </div>

  ${isDraft ? '<div class="watermark">DRAFT</div>' : ""}
</div>
</body></html>`;

    // ── Render via shared helper (Cloudflare Browser Rendering) ──
    const pdfBuffer = await renderHTML(html, {
      format:          "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    // ── Upload + version ──
    const { pdfUrl } = await uploadPdf(db, {
      docType:       "report",
      schoolId,
      docId:         report_id,
      versionNumber,
      bytes:         pdfBuffer,
    });

    await insertVersion(db, {
      docType:           "report",
      docId:             report_id,
      schoolId,
      versionNumber,
      pdfUrl,
      verificationToken,
    });

    if (!is_preview) {
      await markParentSuccess(db, "report", report_id, pdfUrl);
    } else {
      // Preview runs: surface URL but don't disturb pdf_status
      await db.from("reports").update({ pdf_url: pdfUrl, updated_at: new Date().toISOString() }).eq("id", report_id);
    }

    return json({ pdf_url: pdfUrl, verification_token: verificationToken, version: versionNumber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-report-pdf:", msg);
    if (report_id && !is_preview) {
      try { await markParentFailed(db, "report", report_id, msg); }
      catch (_) { /* ignore */ }
    }
    return json({ error: msg }, 500);
  }
});
