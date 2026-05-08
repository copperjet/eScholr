import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({ error: 'missing authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // User-scoped client to verify caller identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401);

    const { studentId, schoolId } = await req.json();
    if (!studentId || !schoolId) return json({ error: 'missing params' }, 400);

    // Service-role client for cross-table reads/writes
    const db = createClient(supabaseUrl, serviceKey);

    // Authorize: caller must be staff in this school
    const { data: staffRow } = await db
      .from('staff')
      .select('id, school_id')
      .eq('auth_user_id', userData.user.id)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (!staffRow) return json({ error: 'forbidden' }, 403);

    // Student name
    const { data: student } = await db
      .from('students')
      .select('full_name, school_id')
      .eq('id', studentId)
      .single();
    if (!student || student.school_id !== schoolId) {
      return json({ error: 'student not found' }, 404);
    }
    const studentName: string = student.full_name ?? 'your child';

    // Parents linked to student
    const { data: links } = await db
      .from('student_parent_links')
      .select('parent_id')
      .eq('student_id', studentId)
      .eq('school_id', schoolId);
    const parentIds = (links ?? []).map((l: { parent_id: string }) => l.parent_id);
    if (!parentIds.length) return json({ sent: 0, reason: 'no parents' });

    // Resolve parents → auth_user_id
    const { data: parents } = await db
      .from('parents')
      .select('id, auth_user_id')
      .in('id', parentIds)
      .not('auth_user_id', 'is', null);
    const parentRows = (parents ?? []) as { id: string; auth_user_id: string }[];
    const userIds = parentRows.map((p) => p.auth_user_id);
    if (!userIds.length) return json({ sent: 0, reason: 'no linked accounts' });

    // Push tokens
    const { data: tokenRows } = await db
      .from('push_tokens')
      .select('user_id, push_token')
      .in('user_id', userIds);
    const tokens = (tokenRows ?? [])
      .map((t: { push_token: string }) => t.push_token)
      .filter(Boolean);

    const title = 'Day Book Update';
    const body = `A new note has been added for ${studentName}.`;

    let expoStatus = 'no_device_registered';
    if (tokens.length) {
      const messages = tokens.map((token: string) => ({
        to: token,
        title,
        body,
        data: { type: 'daybook', studentId, schoolId },
      }));
      const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      expoStatus = expoRes.ok ? 'delivered' : 'failed';
      if (!expoRes.ok) {
        console.error('expo push failed', expoRes.status, await expoRes.text());
      }
    }

    // Log notifications (one row per parent user)
    const logRows = parentRows.map((p) => ({
      school_id: schoolId,
      recipient_user_id: p.auth_user_id,
      trigger_event: 'daybook_sent',
      channel: 'push',
      title,
      body,
      delivery_status: expoStatus,
      related_student_id: studentId,
    }));
    const { error: logErr } = await db.from('notification_logs').insert(logRows);
    if (logErr) console.error('notification_logs insert failed', logErr);

    return json({ sent: tokens.length, recipients: parentRows.length, status: expoStatus });
  } catch (err) {
    console.error(err);
    return json({ error: String(err) }, 500);
  }
});
