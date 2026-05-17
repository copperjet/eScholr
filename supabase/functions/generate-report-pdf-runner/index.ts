/**
 * generate-report-pdf-runner
 * Cron-triggered worker that processes queued report_pdf_jobs.
 * Pattern mirrors supabase/functions/timetable-job-runner/index.ts.
 *
 * - Pulls up to PDF_RUNNER_BATCH oldest queued rows (default 3).
 * - For each: claims with optimistic lock, invokes generate-report-pdf,
 *   marks success/failed accordingly.
 * - On failure: row stays 'failed'; admin can retry via the existing
 *   UI which re-queues via enqueue_report_pdf RPC.
 */
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const batch          = parseInt(Deno.env.get('PDF_RUNNER_BATCH') ?? '3', 10);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ── Pull oldest queued rows ──────────────────────────────
    const { data: queued, error: qErr } = await admin
      .from('report_pdf_jobs')
      .select('id, report_id, is_preview, attempts')
      .eq('status', 'queued')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(batch);

    if (qErr) throw qErr;
    if (!queued || queued.length === 0) {
      return json({ status: 'idle', processed: 0 });
    }

    const results: Array<{ job_id: string; report_id: string; ok: boolean; error?: string }> = [];

    for (const job of queued as any[]) {
      // Optimistic claim
      const { error: claimErr, data: claimed } = await admin
        .from('report_pdf_jobs')
        .update({
          status:     'running',
          started_at: new Date().toISOString(),
          attempts:   (job.attempts ?? 0) + 1,
        })
        .eq('id', job.id)
        .eq('status', 'queued')
        .select('id')
        .maybeSingle();

      if (claimErr || !claimed) {
        // Another worker took it
        results.push({ job_id: job.id, report_id: job.report_id, ok: false, error: 'claim-lost' });
        continue;
      }

      // Invoke generator
      try {
        const resp = await fetch(
          `${supabaseUrl}/functions/v1/generate-report-pdf`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ report_id: job.report_id, is_preview: !!job.is_preview }),
          },
        );

        if (!resp.ok) {
          const text = await resp.text();
          await admin.from('report_pdf_jobs').update({
            status:      'failed',
            finished_at: new Date().toISOString(),
            last_error:  text.slice(0, 500),
          }).eq('id', job.id);
          results.push({ job_id: job.id, report_id: job.report_id, ok: false, error: text.slice(0, 200) });
          continue;
        }

        await admin.from('report_pdf_jobs').update({
          status:      'success',
          finished_at: new Date().toISOString(),
          last_error:  null,
        }).eq('id', job.id);
        results.push({ job_id: job.id, report_id: job.report_id, ok: true });
      } catch (e: any) {
        await admin.from('report_pdf_jobs').update({
          status:      'failed',
          finished_at: new Date().toISOString(),
          last_error:  String(e?.message ?? e).slice(0, 500),
        }).eq('id', job.id);
        results.push({ job_id: job.id, report_id: job.report_id, ok: false, error: String(e?.message ?? e) });
      }
    }

    return json({ status: 'ok', processed: results.length, results });
  } catch (err: any) {
    console.error('generate-report-pdf-runner error:', err);
    return json({ error: err.message ?? 'Internal error' }, 500);
  }
});
