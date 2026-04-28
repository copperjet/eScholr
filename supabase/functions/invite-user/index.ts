/**
 * invite-user — Supabase Edge Function
 *
 * POST /functions/v1/invite-user
 * Body: { staff_id?: string, parent_id?: string, student_id?: string, email: string, full_name: string, school_id: string }
 * Auth: Bearer <admin JWT> (caller must be admin/super_admin/school_super_admin)
 *
 * Creates a Supabase auth account WITH a generated temp password,
 * sets app_metadata + user_metadata.must_reset_password = true,
 * links to the staff/parent/student record, and returns the temp
 * password so the admin can hand it to the user.
 *
 * The user is forced to change the password on first login (gate
 * in app/(app)/_layout.tsx checks user_metadata.must_reset_password).
 */

// 12-char temp password: 8 letters + 4 digits, easy to read out (no I/O/0/1).
function generateTempPassword(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}
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
    const allowed = ["admin", "super_admin", "school_super_admin"];
    if (!callerRoles.some((r) => allowed.includes(r))) {
      return json({ error: "Forbidden — admin role required" }, 403);
    }

    const { staff_id, parent_id, student_id, email, full_name, school_id } = await req.json() as {
      staff_id?: string; parent_id?: string; student_id?: string; email: string; full_name: string; school_id: string;
    };
    if (!email || !full_name || !school_id) return json({ error: "email, full_name, school_id required" }, 400);
    if (!staff_id && !parent_id && !student_id) return json({ error: "staff_id, parent_id, or student_id required" }, 400);

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
    } else if (student_id) {
      roles = ["student"];
      activeRole = "student";
    }

    // ── Create auth user with a temp password ─────────────────
    const tempPassword = generateTempPassword();
    const { data: createData, error: createErr } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name,
        must_reset_password: true,
      },
      app_metadata: {
        school_id,
        staff_id: staff_id ?? null,
        parent_id: parent_id ?? null,
        student_id: student_id ?? null,
        roles,
        active_role: activeRole,
      },
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const authUserId = createData.user?.id;
    if (!authUserId) return json({ error: "Failed to create auth user" }, 500);

    // ── Link auth_user_id to staff / parent / student record ────────────
    if (staff_id) {
      await admin.from("staff").update({ auth_user_id: authUserId }).eq("id", staff_id);
    } else if (parent_id) {
      await admin.from("parents").update({ auth_user_id: authUserId }).eq("id", parent_id);
    } else if (student_id) {
      await admin.from("students").update({ auth_user_id: authUserId }).eq("id", student_id);
    }

    return json({
      success: true,
      auth_user_id: authUserId,
      email: email.trim().toLowerCase(),
      temp_password: tempPassword,
    });

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
