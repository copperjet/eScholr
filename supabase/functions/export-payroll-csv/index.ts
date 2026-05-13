/**
 * export-payroll-csv
 * POST /functions/v1/export-payroll-csv
 * Authorization: Bearer <user_jwt>
 *
 * Body: { school_id: string, pay_period_id: string, created_by: string }
 *
 * Returns: { file_url: string, staff_count: number, export_id: string }
 *
 * Generates Sage Payroll import CSV for all active staff in the period:
 *  - Base salary / (hourly_rate × hours + overtime)
 *  - Stipends + adjustments from staff_pay_adjustments
 *  - Bank details + Tax ID for Sage Payroll
 *  - Uploads to exports/{school_id}/{period_label}.csv
 *  - Marks pay_period as 'exported'
 *  - Logs to payroll_exports
 *
 * No PAYE/NAPSA/NHIMA/net pay — Sage computes statutory deductions.
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

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells: unknown[]) { return cells.map(esc).join(","); }

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

  let body: { school_id?: string; pay_period_id?: string; created_by?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { school_id, pay_period_id, created_by } = body;
  if (!school_id || !pay_period_id || !created_by) {
    return json({ error: "school_id, pay_period_id, and created_by required" }, 400);
  }

  const callerSchoolId = (caller.app_metadata as any)?.school_id as string | undefined;
  if (callerSchoolId !== school_id) return json({ error: "Forbidden" }, 403);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 1. Fetch pay period ─────────────────────────────────────────────────────
  const { data: period, error: periodErr } = await admin
    .from("pay_periods")
    .select("id, period_label, start_date, end_date, status")
    .eq("id", pay_period_id)
    .eq("school_id", school_id)
    .single();

  if (periodErr || !period) return json({ error: "Pay period not found" }, 404);

  const pStart = new Date((period as any).start_date);
  const pEnd   = new Date((period as any).end_date);

  // ── 2. Fetch active staff ───────────────────────────────────────────────────
  const { data: staffRows, error: staffErr } = await admin
    .from("staff")
    .select("id, full_name, staff_number, pay_type, base_salary, hourly_rate, currency, bank_name, bank_account_number, bank_branch, tax_id")
    .eq("school_id", school_id)
    .eq("status", "active");

  if (staffErr) return json({ error: staffErr.message }, 500);
  if (!staffRows || staffRows.length === 0) {
    return json({ error: "No active staff found" }, 400);
  }

  // ── 3. Fetch timesheets for this period ─────────────────────────────────────
  const { data: timesheetRows } = await admin
    .from("staff_timesheets")
    .select("staff_id, hours_worked, overtime_hours")
    .eq("school_id", school_id)
    .eq("pay_period_id", pay_period_id);

  const tsMap: Record<string, { hours: number; ot: number }> = {};
  for (const t of (timesheetRows ?? []) as any[]) {
    tsMap[t.staff_id] = { hours: Number(t.hours_worked), ot: Number(t.overtime_hours) };
  }

  // ── 4. Fetch adjustments ────────────────────────────────────────────────────
  const { data: adjRows } = await admin
    .from("staff_pay_adjustments")
    .select("staff_id, kind, amount")
    .eq("school_id", school_id)
    .eq("pay_period_id", pay_period_id);

  const adjMap: Record<string, { bonuses: number; deductions: number; stipends: number }> = {};
  for (const a of (adjRows ?? []) as any[]) {
    if (!adjMap[a.staff_id]) adjMap[a.staff_id] = { bonuses: 0, deductions: 0, stipends: 0 };
    const amt = Number(a.amount);
    if (a.kind === "deduction" || a.kind === "advance") adjMap[a.staff_id].deductions += amt;
    else if (a.kind === "stipend") adjMap[a.staff_id].stipends += amt;
    else adjMap[a.staff_id].bonuses += amt;
  }

  // ── 5. Fetch role stipends overlapping period ───────────────────────────────
  const { data: stipendRows } = await admin
    .from("staff_role_assignments")
    .select("staff_id, stipend_amount, effective_from, effective_to")
    .eq("school_id", school_id)
    .not("stipend_amount", "is", null);

  for (const s of (stipendRows ?? []) as any[]) {
    const from = s.effective_from ? new Date(s.effective_from) : new Date("1970-01-01");
    const to   = s.effective_to   ? new Date(s.effective_to)   : new Date("2099-12-31");
    if (from <= pEnd && to >= pStart) {
      if (!adjMap[s.staff_id]) adjMap[s.staff_id] = { bonuses: 0, deductions: 0, stipends: 0 };
      adjMap[s.staff_id].stipends += Number(s.stipend_amount ?? 0);
    }
  }

  // ── 6. Build CSV ────────────────────────────────────────────────────────────
  const header = csvRow([
    "StaffCode", "StaffName", "Period", "PayType",
    "BaseSalary", "HoursWorked", "OvertimeHours", "GrossPay",
    "Stipends", "Bonuses", "Deductions",
    "BankName", "BankAccount", "BankBranch", "TaxID", "Currency",
  ]);

  const lines: string[] = [];
  const periodLabel = (period as any).period_label;

  for (const s of staffRows as any[]) {
    const ts  = tsMap[s.id]  ?? { hours: 0, ot: 0 };
    const adj = adjMap[s.id] ?? { bonuses: 0, deductions: 0, stipends: 0 };
    const baseSalary = Number(s.base_salary ?? 0);
    const hourlyRate = Number(s.hourly_rate ?? 0);
    const grossBase  = s.pay_type === "hourly"
      ? hourlyRate * (ts.hours + ts.ot * 1.5)
      : baseSalary;
    const grossPay = Math.max(0, grossBase + adj.stipends + adj.bonuses - adj.deductions);

    lines.push(csvRow([
      s.staff_number ?? s.id.slice(0, 8),
      s.full_name,
      periodLabel,
      s.pay_type ?? "salary",
      baseSalary.toFixed(2),
      ts.hours,
      ts.ot,
      grossPay.toFixed(2),
      adj.stipends.toFixed(2),
      adj.bonuses.toFixed(2),
      adj.deductions.toFixed(2),
      s.bank_name ?? "",
      s.bank_account_number ?? "",
      s.bank_branch ?? "",
      s.tax_id ?? "",
      s.currency ?? "ZMW",
    ]));
  }

  const csvContent = [header, ...lines].join("\n");

  // ── 7. Upload to storage ────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName  = `exports/${school_id}/payroll_${periodLabel}_${timestamp}.csv`;
  const encoder   = new TextEncoder();

  const { error: uploadErr } = await admin.storage
    .from("receipts")
    .upload(fileName, encoder.encode(csvContent), { contentType: "text/csv", upsert: true });

  if (uploadErr) {
    await admin.from("payroll_exports").insert({
      school_id, pay_period_id,
      file_url: null, staff_count: 0,
      status: "failed", error_message: uploadErr.message, created_by,
    });
    return json({ error: `Storage upload failed: ${uploadErr.message}` }, 500);
  }

  const { data: urlData } = admin.storage.from("receipts").getPublicUrl(fileName);
  const fileUrl = urlData?.publicUrl ?? null;

  // ── 8. Mark period exported ─────────────────────────────────────────────────
  await admin.from("pay_periods").update({
    status:      "exported",
    exported_at: new Date().toISOString(),
    exported_by: created_by,
    export_url:  fileUrl,
  }).eq("id", pay_period_id).eq("school_id", school_id);

  // ── 9. Log to payroll_exports ───────────────────────────────────────────────
  const { data: exportLog } = await admin.from("payroll_exports").insert({
    school_id, pay_period_id,
    file_url:    fileUrl,
    staff_count: lines.length,
    status:      "success",
    created_by,
  }).select("id").single();

  return json({
    file_url:    fileUrl,
    staff_count: lines.length,
    export_id:   (exportLog as any)?.id ?? null,
  });
});
