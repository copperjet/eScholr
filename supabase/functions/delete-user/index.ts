/**
 * delete-user — Supabase Edge Function
 *
 * POST /functions/v1/delete-user
 * Body: { user_id: string, type: 'staff' | 'parent' | 'student', record_id: string, school_id: string }
 * Auth: Bearer <admin JWT> (caller must be school_super_admin or admin)
 *
 * Hard deletes a user from Supabase Auth and optionally anonymizes or deletes
 * the associated staff/parent/student record.
 *
 * WARNING: This is irreversible. Use with caution.
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // ── Verify caller is admin/super_admin ────────────────────
    const { data: { user: caller } } = await userClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);
    const callerRoles: string[] = (caller.app_metadata as any)?.roles ?? [];
    const allowed = ["admin", "super_admin", "school_super_admin"];
    if (!callerRoles.some((r) => allowed.includes(r))) {
      return json({ error: "Forbidden — admin role required" }, 403);
    }

    const { user_id, type, record_id, school_id, mode = 'anonymize' } = await req.json() as {
      user_id: string;
      type: 'staff' | 'parent' | 'student';
      record_id: string;
      school_id: string;
      mode?: 'delete' | 'anonymize';
    };

    if (!user_id || !type || !record_id || !school_id) {
      return json({ error: "user_id, type, record_id, school_id required" }, 400);
    }

    // ── Verify caller belongs to same school (school-scoped admins only) ──
    const callerSchoolId = (caller.app_metadata as any)?.school_id;
    const isPlatformAdmin = callerRoles.includes("super_admin") && !callerSchoolId;
    if (!isPlatformAdmin && callerSchoolId !== school_id) {
      return json({ error: "Forbidden — can only delete users from your school" }, 403);
    }

    // ── Delete auth user (this also invalidates all sessions) ───────────
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(user_id);
    if (deleteAuthError) {
      // User might already be deleted, continue with record cleanup
      console.log("Auth delete warning:", deleteAuthError.message);
    }

    // ── Handle record: anonymize or hard delete ──────────────────────────
    const timestamp = new Date().toISOString();
    const anonymizedEmail = `deleted_${record_id.slice(0, 8)}@deleted.local`;
    const anonymizedPhone = `0000000000`;

    if (mode === 'delete') {
      // Hard delete the record and all related data
      if (type === 'staff') {
        // Delete staff_roles first (FK constraint)
        await admin.from("staff_roles").delete().eq("staff_id", record_id);
        // Delete hrt_assignments
        await admin.from("hrt_assignments").delete().eq("staff_id", record_id);
        // Delete subject_teacher_assignments
        await admin.from("subject_teacher_assignments").delete().eq("staff_id", record_id);
        // Delete leave_requests
        await admin.from("leave_requests").delete().eq("staff_id", record_id);
        // Finally delete staff
        await admin.from("staff").delete().eq("id", record_id);
      } else if (type === 'parent') {
        // Delete student_parent_links
        await admin.from("student_parent_links").delete().eq("parent_id", record_id);
        // Delete parent
        await admin.from("parents").delete().eq("id", record_id);
      } else if (type === 'student') {
        // Delete student_parent_links
        await admin.from("student_parent_links").delete().eq("student_id", record_id);
        // Delete attendance_records
        await admin.from("attendance_records").delete().eq("student_id", record_id);
        // Delete marks
        await admin.from("marks").delete().eq("student_id", record_id);
        // Delete subject_enrollments
        await admin.from("subject_enrollments").delete().eq("student_id", record_id);
        // Delete invoices (cascade to invoice_items via FK)
        await admin.from("invoices").delete().eq("student_id", record_id);
        // Finally delete student
        await admin.from("students").delete().eq("id", record_id);
      }
    } else {
      // Anonymize: keep record but scrub PII and mark as deleted
      const updates: any = {
        status: 'deleted',
        email: anonymizedEmail,
        phone: anonymizedPhone,
        auth_user_id: null,
        updated_at: timestamp,
      };

      if (type === 'staff') {
        // Add suffix to name to indicate deletion
        const { data: staff } = await admin.from("staff").select("full_name").eq("id", record_id).single();
        if (staff) {
          updates.full_name = `${staff.full_name} (Deleted ${timestamp.slice(0, 10)})`;
        }
        await admin.from("staff").update(updates).eq("id", record_id);
        // Also anonymize in staff_roles (no PII there, just keep)
      } else if (type === 'parent') {
        const { data: parent } = await admin.from("parents").select("full_name").eq("id", record_id).single();
        if (parent) {
          updates.full_name = `${parent.full_name} (Deleted ${timestamp.slice(0, 10)})`;
        }
        await admin.from("parents").update(updates).eq("id", record_id);
      } else if (type === 'student') {
        const { data: student } = await admin.from("students").select("full_name").eq("id", record_id).single();
        if (student) {
          updates.full_name = `${student.full_name} (Deleted ${timestamp.slice(0, 10)})`;
        }
        await admin.from("students").update(updates).eq("id", record_id);
      }
    }

    return json({
      success: true,
      message: `User ${mode === 'delete' ? 'hard deleted' : 'anonymized'}`,
      user_id,
      record_id,
      type,
    });

  } catch (err: any) {
    console.error("delete-user error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
