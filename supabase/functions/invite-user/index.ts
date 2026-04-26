/**
 * invite-user — Supabase Edge Function
 *
 * POST /functions/v1/invite-user
 * Body: { staff_id?: string, parent_id?: string, email: string, full_name: string, school_id: string }
 * Auth: Bearer <admin JWT> (caller must be admin/super_admin)
 *
 * Creates a Supabase auth account, sets app_metadata, links to staff/parent record,
 * and sends a magic-link invite email.
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

    const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin        = createClient(supabaseUrl, serviceKey);
    const user         = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // ── Verify caller is admin/super_admin ────────────────────
    const { data: { user: caller } } = await user.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);
    const callerRoles: string[] = (caller.app_metadata as any)?.roles ?? [];
    if (!callerRoles.includes("admin") && !callerRoles.includes("super_admin")) {
      return json({ error: "Forbidden — admin role required" }, 403);
    }

    const { staff_id, parent_id, email, full_name, school_id } = await req.json() as {
      staff_id?: string; parent_id?: string; email: string; full_name: string; school_id: string;
    };
    if (!email || !full_name || !school_id) return json({ error: "email, full_name, school_id required" }, 400);
    if (!staff_id && !parent_id) return json({ error: "staff_id or parent_id required" }, 400);

    // ── Get roles for staff member ────────────────────────────
    let roles: string[] = ["parent"];
    let activeRole = "parent";
    if (staff_id) {
      const { data: roleRows } = await admin
        .from("staff_roles")
        .select("role")
        .eq("staff_id", staff_id);
      roles = (roleRows ?? []).map((r: any) => r.role);
      activeRole = roles[0] ?? "hrt";
    }

    // ── Create auth user via admin invite ─────────────────────
    const redirectTo = Deno.env.get("APP_REDIRECT_URL") ?? "escholr://";
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo,
    });
    if (inviteErr) return json({ error: inviteErr.message }, 400);

    const authUserId = inviteData.user?.id;
    if (!authUserId) return json({ error: "Failed to create auth user" }, 500);

    // ── Set app_metadata immediately (bypass JWT hook bootstrap) ─
    await admin.auth.admin.updateUserById(authUserId, {
      app_metadata: {
        school_id,
        staff_id: staff_id ?? null,
        parent_id: parent_id ?? null,
        roles,
        active_role: activeRole,
      },
    });

    // ── Link auth_user_id to staff / parent record ────────────
    if (staff_id) {
      await admin.from("staff").update({ auth_user_id: authUserId }).eq("id", staff_id);
    } else if (parent_id) {
      await admin.from("parents").update({ auth_user_id: authUserId }).eq("id", parent_id);
    }

    return json({ success: true, auth_user_id: authUserId });

  } catch (err: any) {
    console.error("invite-user error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
