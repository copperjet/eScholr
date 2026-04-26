/**
 * notify-marks-complete
 * Called after all marks for a subject/stream/semester are entered.
 * Notifies the HRT of that stream via Expo push notification.
 *
 * POST /functions/v1/notify-marks-complete
 * Body: { school_id, subject_id, stream_id, semester_id, subject_name, stream_name, entered_by_name }
 * Auth: Bearer <staff JWT>
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

interface Payload {
  school_id: string;
  subject_id: string;
  stream_id: string;
  semester_id: string;
  subject_name: string;
  stream_name: string;
  entered_by_name: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const payload = (await req.json()) as Payload;
    const {
      school_id, subject_id, stream_id, semester_id,
      subject_name, stream_name, entered_by_name,
    } = payload;

    if (!school_id || !subject_id || !stream_id || !semester_id) {
      return json({ error: 'Missing required fields' }, 400);
    }

    // Find HRT staff for this stream
    const { data: hrtData } = await supabase
      .from('hrt_assignments')
      .select('staff_id')
      .eq('school_id', school_id)
      .eq('stream_id', stream_id)
      .eq('semester_id', semester_id)
      .maybeSingle();

    if (!hrtData?.staff_id) {
      return json({ ok: true, message: 'No HRT for stream' });
    }

    // Resolve staff → auth_user_id
    const { data: staffRow } = await supabase
      .from('staff')
      .select('auth_user_id')
      .eq('id', hrtData.staff_id)
      .maybeSingle();

    const hrtUserId = staffRow?.auth_user_id as string | undefined;
    if (!hrtUserId) {
      return json({ ok: true, message: 'HRT has no auth account' });
    }

    // Get push token
    const { data: tokenRow } = await supabase
      .from('push_tokens')
      .select('push_token')
      .eq('user_id', hrtUserId)
      .limit(1)
      .maybeSingle();

    const title = 'Marks Entry Complete';
    const body = `${subject_name} marks for ${stream_name} have been fully entered by ${entered_by_name}.`;

    let deliveryStatus = 'no_device_registered';
    let pushJson: unknown = null;

    if (tokenRow?.push_token) {
      const message = {
        to: tokenRow.push_token,
        sound: 'default',
        title,
        body,
        data: { type: 'marks_complete', subject_id, stream_id, semester_id },
      };
      try {
        const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(message),
        });
        pushJson = await pushRes.json().catch(() => null);
        deliveryStatus = pushRes.ok ? 'delivered' : 'failed';
      } catch {
        deliveryStatus = 'failed';
      }
    }

    // Log notification
    const { error: logErr } = await supabase.from('notification_logs').insert({
      school_id,
      recipient_user_id: hrtUserId,
      trigger_event: 'marks_complete',
      channel: 'push',
      title,
      body,
      delivery_status: deliveryStatus,
      is_safeguarding: false,
    });
    if (logErr) console.error('notification_logs insert failed', logErr);

    return json({ ok: true, status: deliveryStatus, expo: pushJson });
  } catch (err) {
    console.error('notify-marks-complete error:', err);
    return json({ error: String(err) }, 500);
  }
});
