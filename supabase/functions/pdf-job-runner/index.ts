/**
 * pdf-job-runner
 *
 * Cron-triggered worker that drains the unified `pdf_jobs` queue.
 * Routes each job to the right generator function by doc_type.
 *
 * Lifecycle:
 *   queued → (optimistic claim) → running → success | failed
 *
 * Failure handling: if attempts < max_attempts, leave row as
 * 'queued' for the next tick (with last_error set); otherwise
 * terminal 'failed'.
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   PDF_RUNNER_BATCH (default 3)
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

type DocType = "report" | "invoice" | "receipt" | "transcript";

const FN_BY_DOC_TYPE: Record<DocType, string> = {
  report:     "generate-report-pdf",
  invoice:    "generate-invoice-pdf",
  receipt:    "generate-receipt",
  transcript: "generate-transcript",
};

interface Job {
  id:           string;
  doc_type:     DocType;
  doc_id:       string;
  school_id:    string;
  attempts:     number;
  max_attempts: number;
  is_preview:   boolean;
  payload:      Record<string, unknown>;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const batch          = parseInt(Deno.env.get("PDF_RUNNER_BATCH") ?? "3", 10);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: queued, error: qErr } = await admin
      .from("pdf_jobs")
      .select("id, doc_type, doc_id, school_id, attempts, max_attempts, is_preview, payload")
      .eq("status", "queued")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(batch);

    if (qErr) throw qErr;
    if (!queued || queued.length === 0) {
      return json({ status: "idle", processed: 0 });
    }

    const results: Array<{ job_id: string; doc_type: string; ok: boolean; error?: string }> = [];

    for (const job of queued as unknown as Job[]) {
      // Optimistic claim
      const { data: claimed, error: claimErr } = await admin
        .from("pdf_jobs")
        .update({
          status:     "running",
          started_at: new Date().toISOString(),
          attempts:   job.attempts + 1,
        })
        .eq("id", job.id)
        .eq("status", "queued")
        .select("id")
        .maybeSingle();

      if (claimErr || !claimed) {
        results.push({ job_id: job.id, doc_type: job.doc_type, ok: false, error: "claim-lost" });
        continue;
      }

      const fnName = FN_BY_DOC_TYPE[job.doc_type];
      if (!fnName) {
        await markFailed(admin, job, `unknown doc_type ${job.doc_type}`);
        results.push({ job_id: job.id, doc_type: job.doc_type, ok: false, error: "unknown-doc-type" });
        continue;
      }

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify(buildBody(job)),
        });

        if (!resp.ok) {
          const text = await resp.text();
          await retryOrFail(admin, job, text);
          results.push({ job_id: job.id, doc_type: job.doc_type, ok: false, error: text.slice(0, 200) });
          continue;
        }

        await admin.from("pdf_jobs").update({
          status:      "success",
          finished_at: new Date().toISOString(),
          last_error:  null,
        }).eq("id", job.id);
        results.push({ job_id: job.id, doc_type: job.doc_type, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await retryOrFail(admin, job, msg);
        results.push({ job_id: job.id, doc_type: job.doc_type, ok: false, error: msg });
      }
    }

    return json({ status: "ok", processed: results.length, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("pdf-job-runner error:", msg);
    return json({ error: msg }, 500);
  }
});

function buildBody(job: Job): Record<string, unknown> {
  // Each generator accepts its own input shape. Map doc_type → body.
  switch (job.doc_type) {
    case "report":
      return { report_id: job.doc_id, is_preview: job.is_preview, ...job.payload };
    case "invoice":
      return { invoice_id: job.doc_id, ...job.payload };
    case "receipt":
      return { finance_record_id: job.doc_id, ...job.payload };
    case "transcript":
      return { transcript_id: job.doc_id, ...job.payload };
  }
}

async function retryOrFail(admin: ReturnType<typeof createClient>, job: Job, errMsg: string): Promise<void> {
  const truncated = errMsg.slice(0, 500);
  if (job.attempts + 1 >= job.max_attempts) {
    await markFailed(admin, job, truncated);
  } else {
    // Requeue for next tick
    await admin.from("pdf_jobs").update({
      status:     "queued",
      started_at: null,
      last_error: truncated,
    }).eq("id", job.id);
  }
}

async function markFailed(admin: ReturnType<typeof createClient>, job: Job, errMsg: string): Promise<void> {
  await admin.from("pdf_jobs").update({
    status:      "failed",
    finished_at: new Date().toISOString(),
    last_error:  errMsg.slice(0, 500),
  }).eq("id", job.id);

  // Mirror onto parent table so UI can show error
  const parent = parentTable(job.doc_type);
  if (parent) {
    await admin.from(parent)
      .update({ pdf_status: "failed", pdf_error: errMsg.slice(0, 500) })
      .eq("id", job.doc_id);
  }
}

function parentTable(docType: DocType): string | null {
  switch (docType) {
    case "report":     return "reports";
    case "invoice":    return "invoices";
    case "receipt":    return "finance_records";
    case "transcript": return "transcripts";
  }
}
