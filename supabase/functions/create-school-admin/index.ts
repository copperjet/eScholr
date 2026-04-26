/**
 * create-school-admin — Supabase Edge Function
 *
 * POST /functions/v1/create-school-admin
 * Body: { school_id, email, full_name, password }
 * Auth: Bearer <super_admin JWT>
 *
 * Called during school onboarding to create the first admin account for a school.
 * Creates auth user (with confirmed email), staff record, staff_role, and links them.
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
      return json({ error: "Forbidden — super_admin role required" }, 403);
    }

    const { school_id, email, full_name, password } = await req.json() as {
      school_id: string;
      email: string;
      full_name: string;
      password: string;
    };

    if (!school_id || !email || !full_name || !password) {
      return json({ error: "school_id, email, full_name, password are required" }, 400);
    }
    if (password.length < 8) {
      return json({ error: "Password must be at least 8 characters" }, 400);
    }

    // Verify school exists
    const { data: school, error: schoolErr } = await adminClient
      .from("schools")
      .select("id, name")
      .eq("id", school_id)
      .single();
    if (schoolErr || !school) return json({ error: "School not found" }, 404);

    // Check email not already taken (staff or parents)
    const normalizedEmail = email.trim().toLowerCase();
    const [{ data: staffMatch }, { data: parentMatch }] = await Promise.all([
      adminClient.from("staff").select("id").eq("email", normalizedEmail).limit(1),
      adminClient.from("parents").select("id").eq("email", normalizedEmail).limit(1),
    ]);
    if ((staffMatch ?? []).length > 0 || (parentMatch ?? []).length > 0) {
      return json({ error: "An account with this email already exists" }, 409);
    }

    // Create auth user with confirmed email (no invite flow — password set immediately)
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
      app_metadata: {
        school_id,
        staff_id: null,
        parent_id: null,
        roles: ["admin"],
        active_role: "admin",
      },
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const authUserId = created.user?.id;
    if (!authUserId) return json({ error: "Failed to create auth user" }, 500);

    // Create staff record
    const { data: staff, error: staffErr } = await adminClient
      .from("staff")
      .insert({
        school_id,
        auth_user_id: authUserId,
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        status: "active",
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (staffErr) {
      console.warn("create-school-admin: staff record failed:", staffErr.message);
      // Auth user exists, but no staff record — still return success with warning
      return json({ success: true, auth_user_id: authUserId, staff_id: null, warning: "Staff record could not be created" });
    }

    // Create staff_roles record
    await adminClient.from("staff_roles").insert({
      staff_id: staff.id,
      school_id,
      role: "admin",
    });

    // Link staff_id into app_metadata
    await adminClient.auth.admin.updateUserById(authUserId, {
      app_metadata: {
        school_id,
        staff_id: staff.id,
        parent_id: null,
        roles: ["admin"],
        active_role: "admin",
      },
    });

    // Audit log (fire-and-forget)
    adminClient.from("audit_logs").insert({
      school_id,
      action: "school_admin_created",
      entity_type: "staff",
      entity_id: staff.id,
      performed_by: caller.id,
      performed_at: new Date().toISOString(),
      meta: { email: email.trim().toLowerCase(), full_name: full_name.trim() },
    }).then(() => {});

    return json({ success: true, auth_user_id: authUserId, staff_id: staff.id });

  } catch (err: any) {
    console.error("create-school-admin error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
