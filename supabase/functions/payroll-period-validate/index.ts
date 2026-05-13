/**
 * payroll-period-validate
 * POST /functions/v1/payroll-period-validate
 * Authorization: Bearer <user_jwt>
 *
 * Body: { school_id: string, pay_period_id: string }
 *
 * Returns: { issues: ValidationIssue[], valid: boolean }
 *
 * Checks every active staff member for:
 *  - Missing bank_account_number
 *  - Missing tax_id
 *  - Hourly staff with no timesheet entry for this period
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

interface ValidationIssue {
  staff_id:   string;
  staff_name: string;
  issues:     string[];
}

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

  let body: { school_id?: string; pay_period_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { school_id, pay_period_id } = body;
  if (!school_id || !pay_period_id) {
    return json({ error: "school_id and pay_period_id required" }, 400);
  }

  const callerSchoolId = (caller.app_metadata as any)?.school_id as string | undefined;
  if (callerSchoolId !== school_id) return json({ error: "Forbidden" }, 403);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Fetch active staff
  const { data: staffRows, error: staffErr } = await admin
    .from("staff")
    .select("id, full_name, bank_account_number, tax_id, pay_type")
    .eq("school_id", school_id)
    .eq("status", "active");

  if (staffErr) return json({ error: staffErr.message }, 500);

  // Fetch timesheets for hourly staff
  const { data: tsRows } = await admin
    .from("staff_timesheets")
    .select("staff_id")
    .eq("school_id", school_id)
    .eq("pay_period_id", pay_period_id);

  const staffWithTS = new Set((tsRows ?? []).map((r: any) => r.staff_id as string));

  const issues: ValidationIssue[] = [];

  for (const s of (staffRows ?? []) as any[]) {
    const rowIssues: string[] = [];
    if (!s.bank_account_number) rowIssues.push("Missing bank account number");
    if (!s.tax_id)              rowIssues.push("Missing Tax ID / TPIN");
    if (s.pay_type === "hourly" && !staffWithTS.has(s.id)) {
      rowIssues.push("No timesheet entry for this period");
    }
    if (rowIssues.length > 0) {
      issues.push({ staff_id: s.id, staff_name: s.full_name, issues: rowIssues });
    }
  }

  return json({ issues, valid: issues.length === 0, staff_checked: (staffRows ?? []).length });
});
