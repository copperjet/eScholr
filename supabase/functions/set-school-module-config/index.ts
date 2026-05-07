/**
 * set-school-module-config — Supabase Edge Function
 *
 * POST /functions/v1/set-school-module-config
 * Body: { school_id, module_key, field_key, value }
 * Auth: Bearer <super_admin JWT>
 *
 * Sets a per-module sub-configuration value (e.g. library.max_loan_days).
 * Key stored as `module.<module_key>.<field_key>` in school_configs.
 * Super_admin only.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Valid sub-config fields per module — mirrors lib/modules.ts configSchema
const MODULE_CONFIG_FIELDS: Record<string, Set<string>> = {
  "finance":      new Set(["late_fee_grace_days", "receipt_prefix"]),
  "hr":           new Set(["max_leave_days_annual"]),
  "library":      new Set(["max_loan_days", "max_loans_per_patron"]),
  "transport":    new Set(["max_routes"]),
  "hostel":       new Set(["max_capacity"]),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const callerRoles: string[] = (caller.app_metadata as any)?.roles ?? [];
    if (!callerRoles.includes("super_admin")) {
      return json({ error: "Forbidden — super_admin role required" }, 403);
    }

    const { school_id, module_key, field_key, value } = await req.json() as {
      school_id: string;
      module_key: string;
      field_key: string;
      value: string;
    };

    if (!school_id)  return json({ error: "school_id required" }, 400);
    if (!module_key) return json({ error: "module_key required" }, 400);
    if (!field_key)  return json({ error: "field_key required" }, 400);
    if (value === undefined || value === null) return json({ error: "value required" }, 400);

    // Strip module. prefix if caller passed it
    const normalModule = module_key.replace(/^module\./, "");

    const validFields = MODULE_CONFIG_FIELDS[normalModule];
    if (!validFields) {
      return json({ error: `Module '${normalModule}' has no configurable fields` }, 400);
    }
    if (!validFields.has(field_key)) {
      return json({ error: `Invalid field '${field_key}' for module '${normalModule}'` }, 400);
    }

    const configKey = `module.${normalModule}.${field_key}`;

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify school exists
    const { data: school, error: schoolErr } = await adminClient
      .from("schools")
      .select("id, name")
      .eq("id", school_id)
      .single();

    if (schoolErr || !school) return json({ error: "School not found" }, 404);

    const { data: row, error: upsertErr } = await adminClient
      .from("school_configs")
      .upsert({
        school_id,
        config_key: configKey,
        config_value: String(value),
        updated_by: caller.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "school_id,config_key" })
      .select()
      .single();

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    // Audit log (fire-and-forget)
    adminClient.from("audit_logs").insert({
      school_id,
      event_type: "module_toggled", // reuse existing event type for config edits
      actor_id: null,
      student_id: null,
      data: {
        type: "module_config_updated",
        module_key: normalModule,
        field_key,
        config_key: configKey,
        value,
        school_name: school.name,
        performed_by: caller.id,
      },
    }).then(() => {});

    return json({ success: true, config_key: configKey, value, row });

  } catch (err: any) {
    console.error("set-school-module-config error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
