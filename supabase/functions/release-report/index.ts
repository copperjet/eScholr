/**
 * release-report
 * POST /functions/v1/release-report
 * Body: { school_id, student_ids: string[], semester_id }
 * Auth: Bearer <admin/hot/super_admin JWT>
 *
 * Marks reports as released, sends push notifications to parents, logs notifications.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const callerClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: 'Unauthorized' }, 401);
    const callerRoles: string[] = (caller.app_metadata as any)?.roles ?? [];
    const allowed = ['admin', 'super_admin', 'hot', 'principal'];
    if (!callerRoles.some((r) => allowed.includes(r))) {
      return json({ error: 'Forbidden' }, 403);
    }

    const { school_id, student_ids, semester_id } = (await req.json()) as {
      school_id: string;
      student_ids: string[];
      semester_id: string;
    };

    if (!school_id || !student_ids?.length || !semester_id) {
      return json({ error: 'Missing required fields' }, 400);
    }

    const now = new Date().toISOString();

    // 1. Get reports for these students
    const { data: reports, error: rErr } = await supabase
      .from('reports')
      .select('id, student_id, pdf_url, students ( full_name ), semesters ( name )')
      .eq('school_id', school_id)
      .eq('semester_id', semester_id)
      .in('student_id', student_ids)
      .in('status', ['approved', 'finance_pending']);

    if (rErr) throw rErr;
    if (!reports || reports.length === 0) {
      return json({ ok: true, released: 0 });
    }

    // 2. Update report status to released
    const reportIds = reports.map((r: any) => r.id);
    await supabase
      .from('reports')
      .update({ status: 'released', released_at: now, updated_at: now })
      .in('id', reportIds);

    let totalNotified = 0;

    // 3. For each student: parents → auth_user_id → push tokens → notify
    for (const report of reports as any[]) {
      const studentName: string = report.students?.full_name ?? 'Your child';
      const semesterName: string = report.semesters?.name ?? 'this semester';
      const title = `${studentName}'s Report is Ready`;
      const body = `${studentName}'s ${semesterName} report card is now available. Tap to view.`;

      // Parent links
      const { data: links } = await supabase
        .from('student_parent_links')
        .select('parent_id')
        .eq('school_id', school_id)
        .eq('student_id', report.student_id);
      const parentIds = (links ?? []).map((l: any) => l.parent_id);
      if (!parentIds.length) continue;

      // Resolve to auth_user_id
      const { data: parents } = await supabase
        .from('parents')
        .select('auth_user_id')
        .in('id', parentIds)
        .not('auth_user_id', 'is', null);
      const parentUserIds = (parents ?? [])
        .map((p: any) => p.auth_user_id as string)
        .filter(Boolean);
      if (!parentUserIds.length) continue;

      // Push tokens
      const { data: tokenRows } = await supabase
        .from('push_tokens')
        .select('push_token')
        .in('user_id', parentUserIds);
      const tokens = (tokenRows ?? []).map((t: any) => t.push_token).filter(Boolean);

      let deliveryStatus = 'no_device_registered';
      if (tokens.length) {
        const pushMessages = tokens.map((token: string) => ({
          to: token,
          sound: 'default',
          title,
          body,
          data: { type: 'report_released', report_id: report.id, student_id: report.student_id },
        }));
        try {
          const resp = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(pushMessages),
          });
          deliveryStatus = resp.ok ? 'delivered' : 'failed';
        } catch {
          deliveryStatus = 'failed';
        }
      }

      // In-app notification log per parent user
      const notifRows = parentUserIds.map((uid) => ({
        school_id,
        recipient_user_id: uid,
        trigger_event: 'report_released',
        channel: 'push',
        title,
        body,
        delivery_status: deliveryStatus,
        is_safeguarding: false,
        related_student_id: report.student_id,
      }));
      await supabase.from('notification_logs').insert(notifRows);
      totalNotified += parentUserIds.length;

      // Audit log
      await supabase.from('audit_logs').insert({
        school_id,
        action: 'report_released',
        entity_type: 'report',
        entity_id: report.id,
        performed_by: caller.id,
        performed_at: now,
        meta: { student_id: report.student_id, semester_id },
      });
    }

    return json({ ok: true, released: reports.length, notified: totalNotified });
  } catch (err) {
    console.error('release-report error:', err);
    return json({ error: String(err) }, 500);
  }
});
