/**
 * get-platform-metrics — Supabase Edge Function
 *
 * GET /functions/v1/get-platform-metrics
 * Auth: Bearer <super_admin JWT>
 *
 * Returns MRR, ARR, churn indicators, plan distribution, school growth,
 * and per-school usage (students, staff, reports, attendance records).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_PRICES: Record<string, number> = {
  starter:    49,
  growth:    149,
  scale:     399,
  enterprise: 999,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const callerClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);
    const callerRoles: string[] = (caller.app_metadata as any)?.roles ?? [];
    if (!callerRoles.includes("super_admin")) {
      return json({ error: "Forbidden" }, 403);
    }

    // ── Fetch all schools ─────────────────────────────────────────────────────
    const { data: schools, error: schoolsErr } = await adminClient
      .from("schools")
      .select("id, name, code, subscription_plan, subscription_status, created_at, country, renewal_date")
      .order("created_at", { ascending: false });

    if (schoolsErr) return json({ error: schoolsErr.message }, 500);

    const allSchools = schools ?? [];

    // ── Aggregate counts ──────────────────────────────────────────────────────
    const [
      { data: students },
      { data: staff },
      { data: reports },
      { data: attendanceRaw },
      { data: impersonations },
    ] = await Promise.all([
      adminClient.from("students").select("school_id, status"),
      adminClient.from("staff").select("school_id, status"),
      adminClient.from("reports").select("school_id, status"),
      adminClient.from("attendance_records").select("school_id").limit(50000),
      adminClient
        .from("platform_impersonation_log")
        .select("school_id, created_at, target_email, reason")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    // Build per-school maps
    const studentMap: Record<string, number> = {};
    const staffMap:   Record<string, number> = {};
    const reportMap:  Record<string, number> = {};
    const attendMap:  Record<string, number> = {};

    (students ?? []).forEach((r: any) => {
      if (r.status === "active") studentMap[r.school_id] = (studentMap[r.school_id] ?? 0) + 1;
    });
    (staff ?? []).forEach((r: any) => {
      if (r.status === "active") staffMap[r.school_id] = (staffMap[r.school_id] ?? 0) + 1;
    });
    (reports ?? []).forEach((r: any) => {
      reportMap[r.school_id] = (reportMap[r.school_id] ?? 0) + 1;
    });
    (attendanceRaw ?? []).forEach((r: any) => {
      attendMap[r.school_id] = (attendMap[r.school_id] ?? 0) + 1;
    });

    // ── Revenue ────────────────────────────────────────────────────────────────
    let mrr = 0;
    const planDist: Record<string, number> = { starter: 0, growth: 0, scale: 0, enterprise: 0 };
    const statusDist: Record<string, number> = { active: 0, trial: 0, suspended: 0, cancelled: 0 };

    allSchools.forEach((s: any) => {
      statusDist[s.subscription_status] = (statusDist[s.subscription_status] ?? 0) + 1;
      planDist[s.subscription_plan]     = (planDist[s.subscription_plan]     ?? 0) + 1;
      if (s.subscription_status === "active") {
        mrr += PLAN_PRICES[s.subscription_plan] ?? 0;
      }
    });

    const arr = mrr * 12;

    // ── School growth (last 12 months) ────────────────────────────────────────
    const now = new Date();
    const growth: { month: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toISOString().slice(0, 7); // "YYYY-MM"
      const count = allSchools.filter((s: any) => s.created_at.slice(0, 7) <= label).length;
      growth.push({ month: label, count });
    }

    // ── Per-school usage enrichment ────────────────────────────────────────────
    const schoolUsage = allSchools.map((s: any) => ({
      id:                   s.id,
      name:                 s.name,
      code:                 s.code,
      subscription_plan:    s.subscription_plan,
      subscription_status:  s.subscription_status,
      country:              s.country,
      created_at:           s.created_at,
      renewal_date:         s.renewal_date,
      student_count:        studentMap[s.id]  ?? 0,
      staff_count:          staffMap[s.id]    ?? 0,
      report_count:         reportMap[s.id]   ?? 0,
      attendance_count:     attendMap[s.id]   ?? 0,
      monthly_revenue:      s.subscription_status === "active" ? (PLAN_PRICES[s.subscription_plan] ?? 0) : 0,
    }));

    // ── Churn indicators ───────────────────────────────────────────────────────
    const suspendedCount = statusDist.suspended ?? 0;
    const cancelledCount = statusDist.cancelled ?? 0;
    const totalEver      = allSchools.length;
    const churnRate      = totalEver > 0 ? ((suspendedCount + cancelledCount) / totalEver) * 100 : 0;

    return json({
      summary: {
        mrr,
        arr,
        total_schools: allSchools.length,
        active_schools: statusDist.active ?? 0,
        trial_schools:  statusDist.trial  ?? 0,
        churn_rate_pct: Math.round(churnRate * 10) / 10,
        total_students: Object.values(studentMap).reduce((a, b) => a + b, 0),
        total_staff:    Object.values(staffMap).reduce((a, b) => a + b, 0),
      },
      plan_distribution: planDist,
      status_distribution: statusDist,
      school_growth: growth,
      school_usage: schoolUsage,
      recent_impersonations: (impersonations ?? []).map((i: any) => ({
        school_id:    i.school_id,
        target_email: i.target_email,
        reason:       i.reason,
        created_at:   i.created_at,
      })),
    });

  } catch (err: any) {
    console.error("get-platform-metrics error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
