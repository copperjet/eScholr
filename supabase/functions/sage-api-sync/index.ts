/**
 * sage-api-sync
 * POST /functions/v1/sage-api-sync
 * Authorization: Bearer <user_jwt>
 *
 * Body: { school_id: string, created_by: string, dry_run?: boolean }
 *
 * Returns: { sent: number, failed: number, skipped: number, export_id: string }
 *
 * Drains sage_sync_queue (pending rows) for the school by POSTing
 * journal entries to Sage Business Cloud Accounting REST API.
 *
 * Prerequisites (in school_configs):
 *   sage_api_company_id   — Sage company GUID
 *   sage_api_oauth_token  — valid access_token (refresh not implemented here;
 *                           schools renew via the OAuth screen in admin settings)
 *
 * Idempotency: uses idempotency_key as Sage idempotency header where supported.
 * On failure: marks row 'failed', stores error in last_error, increments attempts.
 * Max attempts: 5 (rows beyond this are left in 'failed' for manual review).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const ALLOWED_ROLES  = new Set(["finance", "admin", "super_admin", "school_super_admin"]);
const MAX_ATTEMPTS   = 5;
const SAGE_API_BASE  = "https://api.accounting.sage.com/v3.1";

// ── Sage journal line type ─────────────────────────────────────────────────────

interface SageJournalLine {
  ledger_account:    { id: string };
  debit_credit:      "DEBIT" | "CREDIT";
  details:           string;
  net_amount:        number;
  tax_amount:        number;
}

interface SageJournalPayload {
  journal: {
    date:         string;
    reference:    string;
    description:  string;
    journal_lines: SageJournalLine[];
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

async function postJournal(
  companyId: string,
  accessToken: string,
  idempotencyKey: string,
  payload: SageJournalPayload,
): Promise<{ ok: boolean; error?: string; reference?: string }> {
  const url = `${SAGE_API_BASE}/journals`;
  const res = await fetch(url, {
    method:  "POST",
    headers: {
      Authorization:    `Bearer ${accessToken}`,
      "Content-Type":   "application/json",
      "X-Company-Id":   companyId,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    const data = await res.json();
    return { ok: true, reference: data?.id ?? idempotencyKey };
  }

  let errMsg: string;
  try {
    const errBody = await res.json();
    errMsg = errBody?.message ?? errBody?.error ?? `HTTP ${res.status}`;
  } catch {
    errMsg = `HTTP ${res.status}`;
  }
  return { ok: false, error: errMsg };
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return json({ error: "Unauthorized" }, 401);

  const role = (caller.app_metadata as any)?.role as string | undefined;
  if (!role || !ALLOWED_ROLES.has(role)) return json({ error: "Forbidden" }, 403);

  let body: { school_id?: string; created_by?: string; dry_run?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { school_id, created_by, dry_run = false } = body;
  if (!school_id || !created_by) return json({ error: "school_id and created_by required" }, 400);

  const callerSchoolId = (caller.app_metadata as any)?.school_id as string | undefined;
  if (callerSchoolId !== school_id) return json({ error: "Forbidden" }, 403);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 1. Fetch Sage credentials from school_configs ───────────────────────────
  const { data: configs } = await admin
    .from("school_configs")
    .select("key, value")
    .eq("school_id", school_id)
    .in("key", ["sage_api_company_id", "sage_api_oauth_token"]);

  const cfgMap: Record<string, string> = {};
  for (const c of (configs ?? []) as any[]) cfgMap[c.key] = c.value;

  const companyId   = cfgMap["sage_api_company_id"];
  const accessToken = cfgMap["sage_api_oauth_token"];

  if (!companyId || !accessToken) {
    return json({ error: "Sage API not configured. Set sage_api_company_id and sage_api_oauth_token in school_configs." }, 400);
  }

  // ── 2. Load Sage account mappings ───────────────────────────────────────────
  const { data: mappingsRaw } = await admin
    .from("sage_account_mappings")
    .select("internal_key, sage_account_code")
    .eq("school_id", school_id);

  const mappings: Record<string, string> = {};
  for (const m of (mappingsRaw ?? []) as any[]) mappings[m.internal_key] = m.sage_account_code;
  const AR_ACCOUNT = mappings["AR"] ?? "";

  // ── 3. Fetch pending rows (max 100 per run, skip rows > MAX_ATTEMPTS) ───────
  const { data: queueRows, error: queueErr } = await admin
    .from("sage_sync_queue")
    .select("id, event_type, entity_table, entity_id, payload, attempts, idempotency_key")
    .eq("school_id", school_id)
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(100);

  if (queueErr) return json({ error: queueErr.message }, 500);
  if (!queueRows || queueRows.length === 0) {
    return json({ sent: 0, failed: 0, skipped: 0, message: "No pending rows" });
  }

  let sent = 0, failed = 0, skipped = 0;

  for (const row of queueRows as any[]) {
    const p = row.payload as Record<string, any>;

    // ── Build journal based on event type ────────────────────────────────────
    let journalPayload: SageJournalPayload | null = null;

    if (row.event_type === "invoice_created") {
      const arCode = AR_ACCOUNT;
      const revCode = mappings[`Revenue:Other`] ?? "";
      if (!arCode || !revCode) { skipped++; continue; }

      journalPayload = {
        journal: {
          date:        isoDate(p.issue_date ?? new Date().toISOString()),
          reference:   p.invoice_number ?? row.entity_id.slice(0, 8),
          description: `Invoice ${p.invoice_number ?? ""} - Student`,
          journal_lines: [
            { ledger_account: { id: arCode }, debit_credit: "DEBIT",  details: `Invoice ${p.invoice_number}`, net_amount: Number(p.total_amount ?? 0), tax_amount: 0 },
            { ledger_account: { id: revCode }, debit_credit: "CREDIT", details: `Invoice ${p.invoice_number}`, net_amount: Number(p.total_amount ?? 0), tax_amount: 0 },
          ],
        },
      };
    } else if (row.event_type === "payment_recorded") {
      const arCode   = AR_ACCOUNT;
      const cashCode = mappings["Cash"] ?? mappings["Bank"] ?? "";
      if (!arCode || !cashCode) { skipped++; continue; }

      journalPayload = {
        journal: {
          date:        isoDate(p.paid_at ?? new Date().toISOString()),
          reference:   p.reference_number ?? row.entity_id.slice(0, 8),
          description: `Receipt - Student`,
          journal_lines: [
            { ledger_account: { id: cashCode }, debit_credit: "DEBIT",  details: `Receipt`, net_amount: Number(p.amount ?? 0), tax_amount: 0 },
            { ledger_account: { id: arCode },   debit_credit: "CREDIT", details: `Receipt`, net_amount: Number(p.amount ?? 0), tax_amount: 0 },
          ],
        },
      };
    } else {
      // Unknown event type — skip
      await admin.from("sage_sync_queue").update({ status: "skipped" }).eq("id", row.id);
      skipped++;
      continue;
    }

    if (dry_run) {
      sent++;
      continue;
    }

    // ── POST to Sage ─────────────────────────────────────────────────────────
    const result = await postJournal(companyId, accessToken, row.idempotency_key, journalPayload);

    if (result.ok) {
      await admin.from("sage_sync_queue").update({
        status:  "sent_api",
        sent_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", row.id);
      sent++;
    } else {
      await admin.from("sage_sync_queue").update({
        status:     "failed",
        last_error: result.error,
        attempts:   (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      failed++;
    }
  }

  // ── Log to finance_exports ──────────────────────────────────────────────────
  if (!dry_run) {
    await admin.from("finance_exports").insert({
      school_id,
      export_type:   "api",
      file_url:      null,
      rows_included: sent,
      status:        failed > 0 ? "partial" : "success",
      error_message: failed > 0 ? `${failed} rows failed` : null,
      created_by,
    });
  }

  return json({ sent, failed, skipped, dry_run });
});
