/**
 * create-platform-admin — Supabase Edge Function
 *
 * POST /functions/v1/create-platform-admin
 * Body: { bootstrap_token, email, full_name, password }
 * Auth: None required (uses bootstrap token instead)
 *
 * Bootstrap endpoint to create the first eScholr platform admin.
 * Requires BOOTSTRAP_TOKEN environment variable set in Supabase.
 * Token should be long random string, rotated after first use or kept secret.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { bootstrap_token, email, full_name, password } = await req.json() as {
      bootstrap_token?: string;
      email?: string;
      full_name?: string;
      password?: string;
    };

    if (!bootstrap_token || !email || !full_name || !password) {
      return json({ error: "bootstrap_token, email, full_name, password required" }, 400);
    }

    // Verify bootstrap token
    const validToken = Deno.env.get("BOOTSTRAP_TOKEN");
    if (!validToken) {
      console.error("BOOTSTRAP_TOKEN not set in environment");
      return json({ error: "Bootstrap not available" }, 500);
    }

    if (bootstrap_token !== validToken) {
      return json({ error: "Invalid bootstrap token" }, 401);
    }

    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Check if platform admin already exists (count super_admin roles)
    const { data: existing, error: checkErr } = await adminClient
      .rpc("count_super_admins");

    if (!checkErr && existing && existing > 0) {
      return json({
        error: "Platform admin already exists. Use create-school-admin for subsequent admins.",
      }, 409);
    }

    // Create auth user
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
      app_metadata: {
        school_id: null,
        roles: ["super_admin"],
        active_role: "super_admin",
      },
    });

    if (createErr) return json({ error: createErr.message }, 400);

    const authUserId = created.user?.id;
    if (!authUserId) return json({ error: "Failed to create auth user" }, 500);

    // Log bootstrap event
    await adminClient.from("audit_logs").insert({
      school_id: null,
      action: "platform_admin_bootstrapped",
      entity_type: "auth_users",
      entity_id: authUserId,
      performed_by: authUserId,
      performed_at: new Date().toISOString(),
      meta: { email: email.trim().toLowerCase(), full_name: full_name.trim() },
    }).then(() => {});

    return json({
      success: true,
      auth_user_id: authUserId,
      message: "Platform admin created. Log in via platform-login screen.",
    });

  } catch (err: any) {
    console.error("create-platform-admin error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
