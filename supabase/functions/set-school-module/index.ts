/**
 * set-school-module — Supabase Edge Function
 *
 * POST /functions/v1/set-school-module
 * Body: { school_id, module_key, enabled }
 * Auth: Bearer <super_admin JWT>
 *
 * Upserts a module.* config row for the given school.
 * Super_admin only — school admins cannot toggle modules.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_MODULE_KEYS = new Set([
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
  "module.eca",
]);

// Module dependencies: disabling a "parent" cascades disabling its dependents.
// Enabling a "child" requires its parent to be enabled (returns 409 if not).
const MODULE_DEPENDENCIES: Record<string, string[]> = {
  // daybook depends on finance (cash reconciliation)
  "module.daybook": ["module.finance"],
  // exams depends on nothing else (core)
  // character depends on nothing
};

// Reverse map: which modules depend on a given module
function getDependents(parent: string): string[] {
  const dependents: string[] = [];
  for (const [child, parents] of Object.entries(MODULE_DEPENDENCIES)) {
    if (parents.includes(parent)) dependents.push(child);
  }
  return dependents;
}

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

    const { school_id, module_key, enabled } = await req.json() as {
      school_id: string;
      module_key: string;
      enabled: boolean;
    };

    if (!school_id) return json({ error: "school_id required" }, 400);
    if (!module_key) return json({ error: "module_key required" }, 400);
    if (typeof enabled !== "boolean") return json({ error: "enabled (boolean) required" }, 400);

    // Validate module_key format
    const normalised = module_key.startsWith("module.") ? module_key : `module.${module_key}`;
    if (!VALID_MODULE_KEYS.has(normalised)) {
      return json({ error: `Invalid module_key: ${module_key}` }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify school exists
    const { data: school, error: schoolErr } = await adminClient
      .from("schools")
      .select("id, name")
      .eq("id", school_id)
      .single();

    if (schoolErr || !school) return json({ error: "School not found" }, 404);

    // Enforce dependencies: enabling a child requires its parents enabled
    if (enabled && MODULE_DEPENDENCIES[normalised]) {
      const required = MODULE_DEPENDENCIES[normalised];
      const { data: parentRows } = await adminClient
        .from("school_configs")
        .select("config_key, config_value")
        .eq("school_id", school_id)
        .in("config_key", required);
      const parentMap = Object.fromEntries((parentRows ?? []).map((r) => [r.config_key, r.config_value]));
      const missing = required.filter((p) => parentMap[p] !== "true");
      if (missing.length > 0) {
        return json({
          error: `Cannot enable ${normalised}. Parent modules must be enabled first: ${missing.join(", ")}`,
          missing_dependencies: missing,
        }, 409);
      }
    }

    // Cascade: disabling a parent disables all its dependents
    const cascadeKeys = !enabled ? getDependents(normalised) : [];

    // Upsert the primary module config row
    const upsertRows = [{
      school_id,
      config_key: normalised,
      config_value: enabled ? "true" : "false",
      updated_by: caller.id,
      updated_at: new Date().toISOString(),
    }];

    // Add cascade rows
    for (const dep of cascadeKeys) {
      upsertRows.push({
        school_id,
        config_key: dep,
        config_value: "false",
        updated_by: caller.id,
        updated_at: new Date().toISOString(),
      });
    }

    const { data: rows, error: upsertErr } = await adminClient
      .from("school_configs")
      .upsert(upsertRows, { onConflict: "school_id,config_key" })
      .select();

    const row = (rows ?? []).find((r: any) => r.config_key === normalised);

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    // When finance is disabled, unblock reports stuck at finance_pending
    let reportsCleared = 0;
    if (!enabled && normalised === "module.finance") {
      const { data: stuck } = await adminClient
        .from("reports")
        .select("id")
        .eq("school_id", school_id)
        .eq("status", "finance_pending");
      if (stuck && stuck.length > 0) {
        await adminClient
          .from("reports")
          .update({ status: "approved", updated_at: new Date().toISOString() })
          .eq("school_id", school_id)
          .eq("status", "finance_pending");
        reportsCleared = stuck.length;
      }
    }

    // Audit log (fire-and-forget; actor_id omitted — super_admin not in staff table)
    adminClient.from("audit_logs").insert({
      school_id,
      event_type: "module_toggled",
      actor_id: null,
      student_id: null,
      data: {
        module_key: normalised,
        enabled,
        cascade_disabled: cascadeKeys,
        reports_cleared: reportsCleared,
        school_name: school.name,
        performed_by: caller.id,
      },
    }).then(() => {});

    return json({
      success: true,
      module_key: normalised,
      enabled,
      school_id,
      cascade_disabled: cascadeKeys,
      reports_cleared: reportsCleared,
    });

  } catch (err: any) {
    console.error("set-school-module error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
