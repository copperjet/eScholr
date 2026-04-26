/**
 * get-schools-overview — Supabase Edge Function
 *
 * GET /functions/v1/get-schools-overview
 * Auth: Bearer <super_admin JWT>
 *
 * Returns all schools with aggregate stats for the platform admin dashboard.
 * Uses service role to bypass per-school RLS.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Verify caller is super_admin
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);
    const callerRoles: string[] = (caller.app_metadata as any)?.roles ?? [];
    if (!callerRoles.includes("super_admin")) {
      return json({ error: "Forbidden" }, 403);
    }

    // Fetch all schools
    const { data: schools, error: schoolsErr } = await adminClient
      .from("schools")
      .select("id, name, code, logo_url, primary_color, secondary_color, country, subscription_plan, subscription_status, created_at")
      .order("created_at", { ascending: false });

    if (schoolsErr) return json({ error: schoolsErr.message }, 500);

    // Fetch student counts per school
    const { data: studentCounts } = await adminClient
      .from("students")
      .select("school_id")
      .eq("status", "active");

    // Fetch staff counts per school
    const { data: staffCounts } = await adminClient
      .from("staff")
      .select("school_id")
      .eq("status", "active");

    // Build lookup maps
    const studentMap: Record<string, number> = {};
    const staffMap: Record<string, number> = {};
    (studentCounts ?? []).forEach((r: any) => {
      studentMap[r.school_id] = (studentMap[r.school_id] ?? 0) + 1;
    });
    (staffCounts ?? []).forEach((r: any) => {
      staffMap[r.school_id] = (staffMap[r.school_id] ?? 0) + 1;
    });

    const enriched = (schools ?? []).map((s: any) => ({
      ...s,
      student_count: studentMap[s.id] ?? 0,
      staff_count:   staffMap[s.id]   ?? 0,
    }));

    const activeCount = enriched.filter((s: any) =>
      s.subscription_status === "active" || s.subscription_status === "trial"
    ).length;

    const totals = {
      schools:  enriched.length,
      students: Object.values(studentMap).reduce((a, b) => a + b, 0),
      active:   activeCount,
    };

    return json({ schools: enriched, totals });

  } catch (err: any) {
    console.error("get-schools-overview error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
