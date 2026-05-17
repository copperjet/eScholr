/**
 * verify-report — PUBLIC endpoint, no auth required.
 * GET /functions/v1/verify-report?token={16-char-token}
 * Returns HTML page confirming document authenticity.
 * Does NOT expose marks, CREED, attendance, or teacher comments.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HTML = (body: string) =>
  new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>EduCore — Report Verification</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
      .card { background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08); padding: 40px; max-width: 480px; width: 100%; text-align: center; }
      .icon { font-size: 48px; margin-bottom: 16px; }
      h1 { font-size: 22px; color: #1b2a4a; margin-bottom: 8px; }
      .sub { font-size: 14px; color: #6b7280; margin-bottom: 24px; }
      .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
      .info-row .label { color: #6b7280; }
      .info-row .value { color: #1b2a4a; font-weight: 600; }
      .badge { display: inline-block; background: #d1fae5; color: #065f46; font-size: 12px; font-weight: 700; padding: 4px 14px; border-radius: 999px; margin-top: 20px; }
      .badge.warn { background: #fef3c7; color: #92400e; }
      .badge.error { background: #fee2e2; color: #991b1b; }
      .footer { margin-top: 28px; font-size: 11px; color: #9ca3af; }
    </style></head><body>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=UTF-8' } },
  );

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token') ?? '';

    if (!token || token.length !== 16) {
      return HTML(`<div class="card"><div class="icon">❓</div><h1>Invalid Link</h1><p class="sub">This verification link is not valid.</p></div>`);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: version } = await supabase
      .from('report_versions')
      .select(`
        id, version_number, is_current, created_at, verification_token,
        reports (
          id, status, overall_percentage, class_position,
          students ( full_name, student_number, streams ( name, grades ( name ) ) ),
          semesters ( name, academic_years ( name ) ),
          schools ( name, logo_url, primary_color )
        )
      `)
      .eq('verification_token', token)
      .single();

    if (!version) {
      return HTML(`<div class="card">
        <div class="icon">⚠️</div>
        <h1>Not Verified</h1>
        <p class="sub">This report could not be verified. Please contact the school directly.</p>
        <div class="footer">EduCore School Management System</div>
      </div>`);
    }

    const report: any = (version as any).reports;
    const student: any = report?.students;
    const semester: any = report?.semesters;
    const school: any   = report?.schools;
    const isStale = !(version as any).is_current;
    const primaryColor = school?.primary_color ?? '#1B2A4A';

    const body = `<div class="card">
      ${school?.logo_url ? `<img src="${school.logo_url}" style="height:56px;object-fit:contain;margin-bottom:16px" />` : ''}
      <div class="icon">${isStale ? '⚠️' : '✅'}</div>
      <h1>${isStale ? 'Older Version' : 'Document Verified'}</h1>
      <p class="sub">This is an official document issued by <strong>${school?.name ?? 'the school'}</strong>.</p>

      <div class="info-row"><span class="label">Student</span><span class="value">${student?.full_name ?? '—'}</span></div>
      <div class="info-row"><span class="label">Student ID</span><span class="value">${student?.student_number ?? '—'}</span></div>
      <div class="info-row"><span class="label">Grade / Stream</span><span class="value">${student?.streams?.grades?.name ?? '—'} · ${student?.streams?.name ?? '—'}</span></div>
      <div class="info-row"><span class="label">Academic Year</span><span class="value">${semester?.academic_years?.name ?? '—'}</span></div>
      <div class="info-row"><span class="label">Semester</span><span class="value">${semester?.name ?? '—'}</span></div>
      <div class="info-row"><span class="label">Overall Average</span><span class="value">${report?.overall_percentage !== null ? report.overall_percentage.toFixed(1) + '%' : '—'}</span></div>

      <div class="badge ${isStale ? 'warn' : ''}">${isStale ? 'Note: A newer version of this report exists' : '✓ Authentic Official Document'}</div>

      ${isStale ? `<p style="font-size:12px;color:#92400e;margin-top:12px">The latest version of this report has been updated. The original version shown here may differ from the current release. Contact the school for the current report.</p>` : ''}

      <div class="footer">Verification token: ${token} · Verified via EduCore SMS</div>
    </div>`;

    return HTML(body);
  } catch (err) {
    console.error('verify-report:', err);
    return HTML(`<div class="card"><div class="icon">❌</div><h1>Error</h1><p class="sub">Could not process verification. Please try again later.</p></div>`);
  }
});
