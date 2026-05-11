/**
 * set-school-modules-bulk — Supabase Edge Function
 *
 * POST /functions/v1/set-school-modules-bulk
 * Body: { school_id, modules: { [module_key]: boolean } }
 * Auth: Bearer <super_admin JWT>
 *
 * Bulk-toggle modules in a single round trip.
 * Use cases: tier change re-sync, "disable all extended", initial setup.
 * Validates dependencies across the whole batch before any write.
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

const MODULE_DEPENDENCIES: Record<string, string[]> = {
  "module.daybook": ["module.finance"],
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

    const { school_id, modules } = await req.json() as {
      school_id: string;
      modules: Record<string, boolean>;
    };

    if (!school_id) return json({ error: "school_id required" }, 400);
    if (!modules || typeof modules !== "object") {
      return json({ error: "modules object required" }, 400);
    }

    // Normalise + validate keys
    const normalised: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(modules)) {
      const norm = key.startsWith("module.") ? key : `module.${key}`;
      if (!VALID_MODULE_KEYS.has(norm)) {
        return json({ error: `Invalid module_key: ${key}` }, 400);
      }
      if (typeof val !== "boolean") {
        return json({ error: `Value for ${key} must be boolean` }, 400);
      }
      normalised[norm] = val;
    }

    // Validate dependencies across the batch
    // For each enabled module, all parents must also be enabled (in batch or already enabled)
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Fetch existing state for any parents not in the batch
    const allParents = new Set<string>();
    for (const [child] of Object.entries(MODULE_DEPENDENCIES)) {
      for (const p of MODULE_DEPENDENCIES[child]) allParents.add(p);
    }
    const parentsNotInBatch = [...allParents].filter((p) => !(p in normalised));
    let existingParentState: Record<string, boolean> = {};
    if (parentsNotInBatch.length > 0) {
      const { data: existing } = await adminClient
        .from("school_configs")
        .select("config_key, config_value")
        .eq("school_id", school_id)
        .in("config_key", parentsNotInBatch);
      for (const row of (existing ?? [])) {
        existingParentState[row.config_key] = row.config_value === "true";
      }
    }

    const conflicts: string[] = [];
    for (const [child, val] of Object.entries(normalised)) {
      if (!val) continue;
      const parents = MODULE_DEPENDENCIES[child];
      if (!parents) continue;
      for (const p of parents) {
        const parentEnabled = p in normalised ? normalised[p] : (existingParentState[p] ?? true);
        if (!parentEnabled) {
          conflicts.push(`${child} requires ${p} enabled`);
        }
      }
    }
    if (conflicts.length > 0) {
      return json({ error: "Dependency conflicts", conflicts }, 409);
    }

    // Apply cascade: disabling a parent in the batch also disables all its dependents
    for (const [parent, val] of Object.entries(normalised)) {
      if (val) continue;
      for (const [child, parents] of Object.entries(MODULE_DEPENDENCIES)) {
        if (parents.includes(parent) && normalised[child] !== false) {
          normalised[child] = false;
        }
      }
    }

    // Build upsert rows
    const now = new Date().toISOString();
    const rows = Object.entries(normalised).map(([key, val]) => ({
      school_id,
      config_key: key,
      config_value: val ? "true" : "false",
      updated_by: caller.id,
      updated_at: now,
    }));

    const { error: upsertErr } = await adminClient
      .from("school_configs")
      .upsert(rows, { onConflict: "school_id,config_key" });

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    // When finance is disabled, unblock reports stuck at finance_pending
    let reportsCleared = 0;
    if (normalised["module.finance"] === false) {
      const { data: stuck } = await adminClient
        .from("reports")
        .select("id")
        .eq("school_id", school_id)
        .eq("status", "finance_pending");
      if (stuck && stuck.length > 0) {
        await adminClient
          .from("reports")
          .update({ status: "approved", updated_at: now })
          .eq("school_id", school_id)
          .eq("status", "finance_pending");
        reportsCleared = stuck.length;
      }
    }

    // Audit log — single entry for whole batch (fire-and-forget)
    adminClient.from("audit_logs").insert({
      school_id,
      event_type: "modules_bulk_updated",
      actor_id: null,
      student_id: null,
      data: {
        modules: normalised,
        count: rows.length,
        reports_cleared: reportsCleared,
        performed_by: caller.id,
      },
    }).then(() => {});

    return json({ success: true, applied: normalised, count: rows.length, reports_cleared: reportsCleared });

  } catch (err: any) {
    console.error("set-school-modules-bulk error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
