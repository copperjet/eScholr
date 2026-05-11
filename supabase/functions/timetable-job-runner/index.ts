/**
 * timetable-job-runner — R3.5 job-queue worker for large schools (>80 streams).
 *
 * Invoked by pg_cron every minute (or manually). Picks ONE queued generation run,
 * re-invokes generate-timetable with resume=true for the next chunk, then exits.
 * Client subscribes to Postgres realtime on `timetable_generation_runs` for progress.
 *
 * pg_cron registration (run once via SQL in Supabase dashboard):
 *   SELECT cron.schedule(
 *     'timetable-job-runner',
 *     '* * * * *',
 *     $$
 *       SELECT extensions.http_post(
 *         url     := current_setting('app.settings.supabase_url')
 *                    || '/functions/v1/timetable-job-runner',
 *         body    := '{}',
 *         headers := json_build_object(
 *                      'Authorization',
 *                      'Bearer ' || current_setting('app.settings.service_role_key')
 *                    )::jsonb,
 *         timeout_milliseconds := 5000
 *       );
 *     $$
 *   );
 *
 * Can also be triggered manually:
 *   POST /functions/v1/timetable-job-runner
 *   Authorization: Bearer <service-role-key>
 *   {}
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Find oldest queued run ────────────────────────────────

    const { data: queued, error: qErr } = await admin
      .from('timetable_generation_runs')
      .select('id, timetable_id, school_id, algorithm, seed, input_snapshot')
      .eq('status', 'queued')
      .order('started_at', { ascending: true })
      .limit(1)
      .single();

    if (qErr || !queued) {
      // No queued runs — nothing to do
      return json({ status: 'idle', message: 'No queued runs' });
    }

    // ── Mark as running (claim it) ────────────────────────────

    const { error: claimErr } = await admin
      .from('timetable_generation_runs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', queued.id)
      .eq('status', 'queued'); // optimistic lock

    if (claimErr) {
      // Another worker claimed it first — bail out gracefully
      return json({ status: 'skipped', message: 'Run claimed by another worker' });
    }

    // ── Invoke generate-timetable with resume=true ────────────

    const body = {
      school_id:    queued.school_id,
      timetable_id: queued.timetable_id,
      algorithm:    queued.algorithm ?? 'csp_backtrack',
      seed:         queued.seed,
      resume:       true,
      run_id:       queued.id,
    };

    const fnResp = await fetch(
      `${supabaseUrl}/functions/v1/generate-timetable`,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(body),
      },
    );

    if (!fnResp.ok) {
      const errText = await fnResp.text();
      // Mark run as failed if the edge function itself errored
      await admin
        .from('timetable_generation_runs')
        .update({
          status:        'failed',
          ended_at:      new Date().toISOString(),
          error_message: `job-runner invoke failed (${fnResp.status}): ${errText.slice(0, 500)}`,
        })
        .eq('id', queued.id);

      return json({ status: 'error', run_id: queued.id, message: errText }, 500);
    }

    const result = await fnResp.json();

    return json({
      status:    result.status,
      run_id:    queued.id,
      progress:  result.progress,
      runtime_ms: result.runtime_ms,
    });

  } catch (err: any) {
    console.error('timetable-job-runner error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
