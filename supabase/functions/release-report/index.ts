/**
 * release-report
 * POST /functions/v1/release-report
 * Body: { school_id, student_ids: string[], semester_id }
 * Auth: Bearer <admin/principal/super_admin JWT>
 *
 * - Enforces per-school finance clearance gate when schools.requires_finance_clearance.
 * - Marks reports as released, sends push notifications to parents, logs notifications.
 * - All DB ops batched (single fetch per relation, single bulk insert).
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

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
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
    const allowed = ['admin', 'super_admin', 'school_super_admin', 'principal'];
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

    // ── Finance gate ──────────────────────────────────────────
    const { data: school } = await supabase
      .from('schools')
      .select('requires_finance_clearance')
      .eq('id', school_id)
      .maybeSingle();
    const requiresFinance = !!(school as any)?.requires_finance_clearance;

    const now = new Date().toISOString();

    // 1. Get reports for these students
    const { data: reports, error: rErr } = await supabase
      .from('reports')
      .select('id, student_id, pdf_url, status, finance_cleared_at, students ( full_name ), semesters ( name )')
      .eq('school_id', school_id)
      .eq('semester_id', semester_id)
      .in('student_id', student_ids)
      .in('status', ['approved', 'finance_pending']);

    if (rErr) throw rErr;
    if (!reports || reports.length === 0) {
      return json({ ok: true, released: 0, notified: 0 });
    }

    if (requiresFinance) {
      const blocked = (reports as any[]).filter((r) => !r.finance_cleared_at);
      if (blocked.length > 0) {
        return json({
          error: 'Finance clearance required for one or more reports',
          blocked: blocked.map((r) => r.student_id),
        }, 400);
      }
    }

    // 2. Bulk-update report status
    const reportIds = (reports as any[]).map((r: any) => r.id);
    const { error: upErr } = await supabase
      .from('reports')
      .update({ status: 'released', released_at: now, updated_at: now })
      .in('id', reportIds);
    if (upErr) throw upErr;

    // 3. Single-pass parent + token fetch
    const studentIdList = (reports as any[]).map((r: any) => r.student_id);

    const { data: links } = await supabase
      .from('student_parent_links')
      .select('student_id, parent_id')
      .eq('school_id', school_id)
      .in('student_id', studentIdList);

    const parentsByStudent: Record<string, string[]> = {};
    const allParentIds = new Set<string>();
    ((links ?? []) as any[]).forEach((l: any) => {
      allParentIds.add(l.parent_id);
      if (!parentsByStudent[l.student_id]) parentsByStudent[l.student_id] = [];
      parentsByStudent[l.student_id].push(l.parent_id);
    });

    let parentRows: any[] = [];
    if (allParentIds.size > 0) {
      const { data: parents } = await supabase
        .from('parents')
        .select('id, auth_user_id')
        .in('id', Array.from(allParentIds))
        .not('auth_user_id', 'is', null);
      parentRows = (parents ?? []) as any[];
    }
    const userIdByParent: Record<string, string> = {};
    parentRows.forEach((p) => { if (p.auth_user_id) userIdByParent[p.id] = p.auth_user_id; });
    const allUserIds = Object.values(userIdByParent);

    let tokenRows: any[] = [];
    if (allUserIds.length > 0) {
      const { data: tokens } = await supabase
        .from('push_tokens')
        .select('user_id, push_token')
        .in('user_id', allUserIds);
      tokenRows = (tokens ?? []) as any[];
    }
    const tokensByUser: Record<string, string[]> = {};
    tokenRows.forEach((t) => {
      if (!t.push_token) return;
      if (!tokensByUser[t.user_id]) tokensByUser[t.user_id] = [];
      tokensByUser[t.user_id].push(t.push_token);
    });

    // 4. Resolve caller staff id once
    const { data: callerStaff } = await supabase
      .from('staff')
      .select('id')
      .eq('auth_user_id', caller.id)
      .eq('school_id', school_id)
      .maybeSingle();

    // 5. Assemble payloads
    const pushMessages: any[] = [];
    const notifRows: any[] = [];
    const auditRows: any[] = [];
    let totalNotified = 0;

    for (const report of reports as any[]) {
      const studentName: string = report.students?.full_name ?? 'Your child';
      const semesterName: string = report.semesters?.name ?? 'this semester';
      const title = `${studentName}'s Report is Ready`;
      const body  = `${studentName}'s ${semesterName} report card is now available. Tap to view.`;

      const parentIds = parentsByStudent[report.student_id] ?? [];
      const userIds   = parentIds.map((pid) => userIdByParent[pid]).filter(Boolean);
      const tokens    = userIds.flatMap((uid) => tokensByUser[uid] ?? []);

      tokens.forEach((token) => {
        pushMessages.push({
          to:    token,
          sound: 'default',
          title,
          body,
          data: { type: 'report_released', report_id: report.id, student_id: report.student_id },
        });
      });

      userIds.forEach((uid) => {
        notifRows.push({
          school_id,
          recipient_user_id:   uid,
          trigger_event:       'report_released',
          channel:             'push',
          title,
          body,
          delivery_status:     tokens.length ? 'delivered' : 'no_device_registered',
          is_safeguarding:     false,
          related_student_id:  report.student_id,
        });
      });
      totalNotified += userIds.length;

      auditRows.push({
        school_id,
        event_type: 'report_released',
        actor_id:   callerStaff?.id ?? null,
        student_id: report.student_id,
        data:       { report_id: report.id, semester_id },
      });
    }

    // 6. Push send in chunks of 100 (Expo limit)
    if (pushMessages.length > 0) {
      for (const slice of chunk(pushMessages, 100)) {
        try {
          await fetch('https://exp.host/--/api/v2/push/send', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body:    JSON.stringify(slice),
          });
        } catch (e) {
          console.error('expo push send failed', e);
        }
      }
    }

    // 7. Bulk inserts
    if (notifRows.length > 0) {
      await supabase.from('notification_logs').insert(notifRows);
    }
    if (auditRows.length > 0) {
      await supabase.from('audit_logs').insert(auditRows);
    }

    return json({ ok: true, released: reports.length, notified: totalNotified });
  } catch (err) {
    console.error('release-report error:', err);
    return json({ error: String(err) }, 500);
  }
});
