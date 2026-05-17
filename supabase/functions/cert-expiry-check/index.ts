/**
 * cert-expiry-check — Supabase Edge Function
 *
 * Intended to be called daily (pg_cron or Supabase scheduled invocations).
 * For each school, scans staff_certifications, updates status to
 * 'expiring' (≤60 days) or 'expired', and inserts notification_logs
 * rows for the staff member and any HR staff in the school.
 *
 * POST /functions/v1/cert-expiry-check
 * Auth: service-role key (called by cron, not end users).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPIRY_WARNING_DAYS = 60;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db           = createClient(supabaseUrl, serviceKey);

  const today      = new Date();
  const todayISO   = today.toISOString().split("T")[0];
  const warnCutoff = new Date(today);
  warnCutoff.setDate(warnCutoff.getDate() + EXPIRY_WARNING_DAYS);
  const warnISO    = warnCutoff.toISOString().split("T")[0];

  try {
    // ── 1. Fetch all certs with expiry_date set ────────────────────────────
    const { data: certs, error: certsErr } = await db
      .from("staff_certifications")
      .select("id, school_id, staff_id, cert_type, expiry_date, status, staff:staff_id(auth_user_id, full_name)")
      .not("expiry_date", "is", null);

    if (certsErr) throw certsErr;
    if (!certs || certs.length === 0) {
      return json({ updated: 0, notifications: 0 });
    }

    // ── 2. Compute new status for each cert ───────────────────────────────
    type CertStatus = "valid" | "expiring" | "expired";

    const updates: Array<{ id: string; newStatus: CertStatus; cert: any }> = [];

    for (const cert of certs) {
      let newStatus: CertStatus = "valid";
      if (cert.expiry_date <= todayISO) {
        newStatus = "expired";
      } else if (cert.expiry_date <= warnISO) {
        newStatus = "expiring";
      }

      // Only include if status changed
      if (newStatus !== cert.status) {
        updates.push({ id: cert.id, newStatus, cert });
      }
    }

    if (updates.length === 0) {
      return json({ updated: 0, notifications: 0 });
    }

    // ── 3. Update statuses ────────────────────────────────────────────────
    const updateResults = await Promise.allSettled(
      updates.map(({ id, newStatus }) =>
        db.from("staff_certifications")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", id)
      )
    );

    const updatedCount = updateResults.filter((r) => r.status === "fulfilled").length;

    // ── 4. Build notification rows ────────────────────────────────────────
    // For each changed cert, notify the staff member + HR staff in the school.
    // We group by school_id to batch HR lookups.

    const schoolIds = [...new Set(updates.map((u) => u.cert.school_id as string))];

    // Fetch HR staff auth_user_ids per school
    const hrBySchool: Record<string, string[]> = {};
    await Promise.all(
      schoolIds.map(async (schoolId) => {
        const { data: hrRows } = await db
          .from("staff_roles")
          .select("staff:staff_id(auth_user_id)")
          .eq("school_id", schoolId)
          .eq("role", "hr");
        hrBySchool[schoolId] = (hrRows ?? [])
          .map((r: any) => r.staff?.auth_user_id)
          .filter(Boolean) as string[];
      })
    );

    const notifications: any[] = [];

    for (const { cert, newStatus } of updates) {
      const staffAuthId: string | null = (cert.staff as any)?.auth_user_id ?? null;
      const staffName:   string        = (cert.staff as any)?.full_name ?? "Staff";
      const certLabel    = cert.cert_type ?? "Certification";
      const daysLeft     = Math.ceil(
        (new Date(cert.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      const title = newStatus === "expired"
        ? `${certLabel} expired`
        : `${certLabel} expiring in ${daysLeft} days`;

      const body = newStatus === "expired"
        ? `${staffName}'s ${certLabel} expired on ${cert.expiry_date}.`
        : `${staffName}'s ${certLabel} expires on ${cert.expiry_date}.`;

      // Notify the staff member
      if (staffAuthId) {
        notifications.push({
          school_id: cert.school_id,
          recipient_user_id: staffAuthId,
          trigger_event: "cert_expiry",
          channel: "in_app",
          title,
          body,
        });
      }

      // Notify HR staff in the same school
      for (const hrUserId of hrBySchool[cert.school_id] ?? []) {
        if (hrUserId === staffAuthId) continue; // skip if HR is the same person
        notifications.push({
          school_id: cert.school_id,
          recipient_user_id: hrUserId,
          trigger_event: "cert_expiry",
          channel: "in_app",
          title,
          body,
        });
      }
    }

    let notifCount = 0;
    if (notifications.length > 0) {
      const { error: notifErr } = await db
        .from("notification_logs")
        .insert(notifications);
      if (!notifErr) notifCount = notifications.length;
    }

    return json({ updated: updatedCount, notifications: notifCount });
  } catch (err: any) {
    return json({ error: err.message ?? String(err) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
