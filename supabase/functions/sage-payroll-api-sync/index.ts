/**
 * sage-payroll-api-sync
 * POST /functions/v1/sage-payroll-api-sync
 * Authorization: Bearer <user_jwt>
 *
 * Body: { school_id: string, pay_period_id: string, created_by: string, dry_run?: boolean }
 *
 * Returns: { sent: number, failed: number }
 *
 * Pushes an exported pay period to Sage Payroll API (Sage Business Cloud Payroll).
 * Reads the payroll CSV data from the last payroll_exports record for the period,
 * then POSTs each staff payslip-input line to Sage Payroll.
 *
 * Prerequisites (school_configs):
 *   sage_payroll_api_token   — Bearer token for Sage Payroll API
 *   sage_payroll_company_id  — Sage Payroll company ID
 *
 * No net pay / PAYE / statutory deductions — those are computed by Sage.
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

const ALLOWED_ROLES = new Set(["hr", "admin", "super_admin", "school_super_admin"]);
const SAGE_PAYROLL_BASE = "https://api.sage.com/payroll/v1"; // placeholder — actual endpoint varies by region

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

  let body: { school_id?: string; pay_period_id?: string; created_by?: string; dry_run?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { school_id, pay_period_id, created_by, dry_run = false } = body;
  if (!school_id || !pay_period_id || !created_by) {
    return json({ error: "school_id, pay_period_id, and created_by required" }, 400);
  }

  const callerSchoolId = (caller.app_metadata as any)?.school_id as string | undefined;
  if (callerSchoolId !== school_id) return json({ error: "Forbidden" }, 403);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Fetch Sage Payroll credentials ──────────────────────────────────────────
  const { data: configs } = await admin
    .from("school_configs")
    .select("key, value")
    .eq("school_id", school_id)
    .in("key", ["sage_payroll_api_token", "sage_payroll_company_id"]);

  const cfgMap: Record<string, string> = {};
  for (const c of (configs ?? []) as any[]) cfgMap[c.key] = c.value;

  const apiToken  = cfgMap["sage_payroll_api_token"];
  const companyId = cfgMap["sage_payroll_company_id"];

  if (!apiToken || !companyId) {
    return json({ error: "Sage Payroll API not configured. Set sage_payroll_api_token and sage_payroll_company_id in school_configs." }, 400);
  }

  // ── Fetch pay period + staff data ───────────────────────────────────────────
  const { data: period, error: pErr } = await admin
    .from("pay_periods")
    .select("id, period_label, start_date, end_date, status")
    .eq("id", pay_period_id)
    .eq("school_id", school_id)
    .single();

  if (pErr || !period) return json({ error: "Pay period not found" }, 404);
  if ((period as any).status !== "exported" && (period as any).status !== "locked") {
    return json({ error: "Period must be locked or exported before API sync" }, 400);
  }

  const pStart = new Date((period as any).start_date);
  const pEnd   = new Date((period as any).end_date);

  const { data: staffRows } = await admin
    .from("staff")
    .select("id, full_name, staff_number, pay_type, base_salary, hourly_rate, currency, bank_name, bank_account_number, bank_branch, tax_id")
    .eq("school_id", school_id)
    .eq("status", "active");

  const { data: tsRows } = await admin
    .from("staff_timesheets")
    .select("staff_id, hours_worked, overtime_hours")
    .eq("school_id", school_id)
    .eq("pay_period_id", pay_period_id);

  const { data: adjRows } = await admin
    .from("staff_pay_adjustments")
    .select("staff_id, kind, amount")
    .eq("school_id", school_id)
    .eq("pay_period_id", pay_period_id);

  const { data: stipendRows } = await admin
    .from("staff_role_assignments")
    .select("staff_id, stipend_amount, effective_from, effective_to")
    .eq("school_id", school_id)
    .not("stipend_amount", "is", null);

  const tsMap: Record<string, { hours: number; ot: number }> = {};
  for (const t of (tsRows ?? []) as any[]) tsMap[t.staff_id] = { hours: Number(t.hours_worked), ot: Number(t.overtime_hours) };

  const adjMap: Record<string, { bonuses: number; deductions: number; stipends: number }> = {};
  for (const a of (adjRows ?? []) as any[]) {
    if (!adjMap[a.staff_id]) adjMap[a.staff_id] = { bonuses: 0, deductions: 0, stipends: 0 };
    const amt = Number(a.amount);
    if (a.kind === "deduction" || a.kind === "advance") adjMap[a.staff_id].deductions += amt;
    else if (a.kind === "stipend") adjMap[a.staff_id].stipends += amt;
    else adjMap[a.staff_id].bonuses += amt;
  }
  for (const s of (stipendRows ?? []) as any[]) {
    const from = s.effective_from ? new Date(s.effective_from) : new Date("1970-01-01");
    const to   = s.effective_to   ? new Date(s.effective_to)   : new Date("2099-12-31");
    if (from <= pEnd && to >= pStart) {
      if (!adjMap[s.staff_id]) adjMap[s.staff_id] = { bonuses: 0, deductions: 0, stipends: 0 };
      adjMap[s.staff_id].stipends += Number(s.stipend_amount ?? 0);
    }
  }

  let sent = 0, failed = 0;
  const errors: string[] = [];

  for (const s of (staffRows ?? []) as any[]) {
    const ts  = tsMap[s.id]  ?? { hours: 0, ot: 0 };
    const adj = adjMap[s.id] ?? { bonuses: 0, deductions: 0, stipends: 0 };
    const baseSalary = Number(s.base_salary ?? 0);
    const hourlyRate = Number(s.hourly_rate ?? 0);
    const grossBase  = s.pay_type === "hourly" ? hourlyRate * (ts.hours + ts.ot * 1.5) : baseSalary;
    const grossPay   = Math.max(0, grossBase + adj.stipends + adj.bonuses - adj.deductions);

    const employeePayload = {
      employee_number: s.staff_number ?? s.id.slice(0, 8),
      period:          (period as any).period_label,
      basic_pay:       grossPay,
      allowances:      adj.stipends + adj.bonuses,
      deductions:      adj.deductions,
      hours_worked:    ts.hours,
      overtime_hours:  ts.ot,
      currency:        s.currency ?? "ZMW",
    };

    if (dry_run) { sent++; continue; }

    try {
      const res = await fetch(`${SAGE_PAYROLL_BASE}/companies/${companyId}/payroll-batches`, {
        method:  "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(employeePayload),
      });
      if (res.ok) {
        sent++;
      } else {
        const errBody = await res.json().catch(() => ({}));
        errors.push(`${s.full_name}: ${errBody?.message ?? `HTTP ${res.status}`}`);
        failed++;
      }
    } catch (e: any) {
      errors.push(`${s.full_name}: ${e?.message ?? "Network error"}`);
      failed++;
    }
  }

  // Log result
  if (!dry_run) {
    await admin.from("payroll_exports").insert({
      school_id, pay_period_id,
      file_url:    null,
      staff_count: sent,
      status:      failed > 0 ? "partial" : "success",
      error_message: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
      created_by,
    });
  }

  return json({ sent, failed, dry_run, errors: errors.slice(0, 10) });
});
