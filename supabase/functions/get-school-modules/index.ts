/**
 * get-school-modules — Supabase Edge Function
 *
 * POST /functions/v1/get-school-modules
 * Body: { school_id }
 * Auth: Bearer <super_admin JWT>
 *
 * Returns all module.* config rows for the given school.
 * Uses service_role to bypass RLS (platform admin only).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODULE_KEYS = [
  "module.finance",
  "module.hr",
  "module.library",
  "module.frontdesk",
  "module.transport",
  "module.hostel",
  "module.exams",
  "module.daybook",
  "module.character",
  "module.announcements",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is super_admin
    const callerClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const callerRoles: string[] = (caller.app_metadata as any)?.roles ?? [];
    if (!callerRoles.includes("super_admin")) {
      return json({ error: "Forbidden — super_admin role required" }, 403);
    }

    const { school_id } = await req.json() as { school_id: string };
    if (!school_id) return json({ error: "school_id required" }, 400);

    // Fetch via service_role (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data, error } = await adminClient
      .from("school_configs")
      .select("config_key, config_value, updated_at")
      .eq("school_id", school_id)
      .in("config_key", MODULE_KEYS);

    if (error) return json({ error: error.message }, 500);

    // Build module map — fail-open for missing rows
    const moduleMap: Record<string, boolean> = {};
    const lookup: Record<string, string> = {};
    for (const row of (data ?? [])) {
      lookup[row.config_key] = row.config_value;
    }
    for (const key of MODULE_KEYS) {
      const val = lookup[key];
      moduleMap[key.replace("module.", "")] = val === undefined ? true : val === "true";
    }

    return json({ modules: moduleMap, rows: data ?? [] });

  } catch (err: any) {
    console.error("get-school-modules error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
