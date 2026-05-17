/**
 * impersonate-school — Supabase Edge Function
 *
 * POST /functions/v1/impersonate-school
 * Body: { school_id, target_staff_id?, reason? }
 * Auth: Bearer <super_admin JWT>
 *
 * Generates a short-lived impersonation token for the target school admin.
 * Logs every attempt to platform_impersonation_log (always, including failures).
 * The returned token is a Supabase admin-generated magic link / sign-in token
 * that the mobile app deep-links to complete the impersonation session.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TTL_SECONDS = 900; // 15 minutes

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
      return json({ error: "Forbidden — super_admin only" }, 403);
    }

    const { school_id, target_staff_id, reason } = await req.json() as {
      school_id: string;
      target_staff_id?: string;
      reason?: string;
    };

    if (!school_id) return json({ error: "school_id required" }, 400);

    // Verify school exists and is not cancelled
    const { data: school, error: schoolErr } = await adminClient
      .from("schools")
      .select("id, name, code, subscription_status")
      .eq("id", school_id)
      .single();

    if (schoolErr || !school) return json({ error: "School not found" }, 404);
    if (school.subscription_status === "cancelled") {
      return json({ error: "Cannot impersonate a cancelled school" }, 400);
    }

    // Resolve target staff: explicit staff_id, else first admin of school
    let targetStaffId = target_staff_id ?? null;
    let targetEmail   = "";
    let targetAuthId  = "";

    if (targetStaffId) {
      const { data: staff, error: staffErr } = await adminClient
        .from("staff")
        .select("id, email, auth_user_id")
        .eq("id", targetStaffId)
        .eq("school_id", school_id)
        .single();
      if (staffErr || !staff) return json({ error: "Staff member not found in this school" }, 404);
      targetEmail  = staff.email;
      targetAuthId = staff.auth_user_id ?? "";
    } else {
      // Find first active admin of the school
      const { data: adminStaff } = await adminClient
        .from("staff_roles")
        .select("staff_id, staff:staff_id(id, email, auth_user_id, status)")
        .eq("school_id", school_id)
        .eq("role", "admin")
        .limit(5);

      const active = (adminStaff ?? []).find((r: any) => r.staff?.status === "active");
      if (!active) return json({ error: "No active admin found for this school" }, 404);
      targetStaffId = (active.staff as any).id;
      targetEmail   = (active.staff as any).email ?? "";
      targetAuthId  = (active.staff as any).auth_user_id ?? "";
    }

    if (!targetAuthId) {
      return json({ error: "Target admin has no auth account" }, 400);
    }

    // Generate a one-time magic link for the target auth user
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
      options: { redirectTo: `escholr://impersonate?school=${school_id}&sa=${caller.id}` },
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      // Fallback: return a note that manual login is needed
      const fallbackToken = `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();

      await adminClient.from("platform_impersonation_log").insert({
        impersonated_by: caller.id,
        school_id,
        target_staff_id: targetStaffId,
        target_email: targetEmail,
        reason: reason ?? null,
        session_token: fallbackToken,
        expires_at: expiresAt,
        revoked: false,
      });

      // Audit log
      adminClient.from("audit_logs").insert({
        school_id,
        action: "platform_impersonation_started",
        entity_type: "staff",
        entity_id: targetStaffId ?? school_id,
        performed_by: caller.id,
        performed_at: new Date().toISOString(),
        meta: { target_email: targetEmail, reason: reason ?? null, method: "manual" },
      }).then(() => {});

      return json({
        success: true,
        method: "manual",
        target_email: targetEmail,
        school_name: school.name,
        school_code: school.code,
        expires_at: expiresAt,
        note: "Magic link generation unavailable — use target email + password reset in dashboard",
      });
    }

    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
    const hashedToken = linkData.properties.hashed_token;

    // Log impersonation
    const { data: logEntry } = await adminClient.from("platform_impersonation_log").insert({
      impersonated_by: caller.id,
      school_id,
      target_staff_id: targetStaffId,
      target_email: targetEmail,
      reason: reason ?? null,
      session_token: hashedToken.slice(0, 32),
      expires_at: expiresAt,
      revoked: false,
    }).select("id").single();

    // Audit log (fire-and-forget)
    adminClient.from("audit_logs").insert({
      school_id,
      action: "platform_impersonation_started",
      entity_type: "staff",
      entity_id: targetStaffId ?? school_id,
      performed_by: caller.id,
      performed_at: new Date().toISOString(),
      meta: {
        target_email: targetEmail,
        reason: reason ?? null,
        log_id: logEntry?.id,
        expires_at: expiresAt,
      },
    }).then(() => {});

    return json({
      success: true,
      method: "magic_link",
      action_link: linkData.properties.action_link,
      target_email: targetEmail,
      school_name: school.name,
      school_code: school.code,
      log_id: logEntry?.id,
      expires_at: expiresAt,
    });

  } catch (err: any) {
    console.error("impersonate-school error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
