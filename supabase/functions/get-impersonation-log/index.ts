/**
 * get-impersonation-log — Supabase Edge Function
 *
 * POST /functions/v1/get-impersonation-log
 * Body: { school_id? }  — omit for all schools
 * Auth: Bearer <super_admin JWT>
 *
 * Returns impersonation log entries (service role bypasses RLS).
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
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);
    const meta = (caller.app_metadata as any) ?? {};
    const callerRoles: string[] = meta?.roles ?? [];
    const isSuperAdmin = callerRoles.includes("super_admin") || meta?.role === "super_admin";
    if (!isSuperAdmin) {
      return json({ error: "Forbidden" }, 403);
    }

    const { school_id } = await req.json().catch(() => ({})) as { school_id?: string };

    let q = adminClient
      .from("platform_impersonation_log")
      .select("id, impersonated_by, school_id, target_staff_id, target_email, reason, session_token, expires_at, revoked, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (school_id) q = q.eq("school_id", school_id);

    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);

    return json({ entries: data ?? [] });

  } catch (err: any) {
    console.error("get-impersonation-log error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
