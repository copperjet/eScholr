/**
 * update-school — Supabase Edge Function
 *
 * POST /functions/v1/update-school
 * Body: { school_id, subscription_plan?, subscription_status?, name?, logo_url?, primary_color?, secondary_color? }
 * Auth: Bearer <super_admin JWT>
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

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);
    const callerRoles: string[] = (caller.app_metadata as any)?.roles ?? [];
    const isPlatformAdmin = callerRoles.includes("super_admin");
    const isSchoolSuperAdmin = callerRoles.includes("school_super_admin");
    if (!isPlatformAdmin && !isSchoolSuperAdmin) {
      return json({ error: "Forbidden — super_admin or school_super_admin role required" }, 403);
    }

    const { school_id, ...patch } = await req.json() as {
      school_id: string;
      subscription_plan?: string;
      subscription_status?: string;
      name?: string;
      logo_url?: string;
      primary_color?: string;
      secondary_color?: string;
      renewal_date?: string;
    };

    if (!school_id) return json({ error: "school_id required" }, 400);

    // school_super_admin must only update their own school
    if (isSchoolSuperAdmin && !isPlatformAdmin) {
      const callerSchoolId = (caller.app_metadata as any)?.school_id;
      if (callerSchoolId !== school_id) {
        return json({ error: "Forbidden — can only update your own school" }, 403);
      }
    }

    // school_super_admin can only edit branding fields — not subscription or billing
    const ALLOWED = isPlatformAdmin
      ? ['subscription_plan', 'subscription_status', 'name', 'logo_url', 'primary_color', 'secondary_color', 'renewal_date']
      : ['name', 'logo_url', 'primary_color', 'secondary_color'];
    const safe: Record<string, any> = {};
    for (const key of ALLOWED) {
      if (patch[key as keyof typeof patch] !== undefined) safe[key] = patch[key as keyof typeof patch];
    }
    if (Object.keys(safe).length === 0) return json({ error: "No valid fields to update" }, 400);

    safe.updated_at = new Date().toISOString();

    const { error: updateErr } = await adminClient
      .from("schools")
      .update(safe)
      .eq("id", school_id);

    if (updateErr) return json({ error: updateErr.message }, 500);

    adminClient.from("audit_logs").insert({
      school_id,
      action: "school_updated",
      entity_type: "schools",
      entity_id: school_id,
      performed_by: caller.id,
      performed_at: new Date().toISOString(),
      meta: safe,
    }).then(() => {});

    return json({ success: true });

  } catch (err: any) {
    console.error("update-school error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
