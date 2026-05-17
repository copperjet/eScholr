/**
 * send-absence-notification — Supabase Edge Function
 *
 * POST /functions/v1/send-absence-notification
 * Body: { school_id, student_id, stream_id, date, marked_by_name }
 *
 * Looks up the student's parent(s), retrieves their push tokens,
 * sends Expo push notification, and logs to notification_logs.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin       = createClient(supabaseUrl, serviceKey);

    const { school_id, student_id, stream_id, date, marked_by_name } = await req.json() as {
      school_id: string;
      student_id: string;
      stream_id: string;
      date: string;
      marked_by_name: string;
    };

    if (!school_id || !student_id || !stream_id || !date) {
      return json({ error: "Missing required fields" }, 400);
    }

    // ── 1. Get student name ───────────────────────────────────
    const { data: student, error: sErr } = await admin
      .from("students")
      .select("full_name")
      .eq("id", student_id)
      .eq("school_id", school_id)
      .single();

    if (sErr || !student) return json({ error: "Student not found" }, 404);

    // ── 2. Get parent(s) for this student ─────────────────────
    const { data: links } = await admin
      .from("student_parent_links")
      .select("parent_id, parents ( auth_user_id, full_name )")
      .eq("student_id", student_id)
      .eq("school_id", school_id);

    if (!links || links.length === 0) {
      return json({ sent: 0, message: "No parents linked" });
    }

    const parentUserIds = links
      .map((l: any) => l.parents?.auth_user_id)
      .filter(Boolean) as string[];

    if (parentUserIds.length === 0) {
      return json({ sent: 0, message: "Parents have no auth accounts yet" });
    }

    // ── 3. Get push tokens for these parents ──────────────────
    const { data: tokenRows } = await admin
      .from("push_tokens")
      .select("user_id, push_token")
      .in("user_id", parentUserIds);

    const tokens = (tokenRows ?? []).map((r: any) => r.push_token).filter(Boolean);

    // Format time in readable form: "08:32 AM"
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const title = `${student.full_name} marked absent`;
    const body  = `Marked at ${timeStr} by ${marked_by_name}. If unexpected, contact the school.`;
    const deepLink = `escholr://attendance/${stream_id}/${date}`;

    // ── 4. Send Expo push notifications ───────────────────────
    let pushDeliveryStatus = "delivered";
    if (tokens.length > 0) {
      const messages = tokens.map((token) => ({
        to: token,
        title,
        body,
        data: { deepLink, student_id, stream_id, date },
        sound: "default",
        priority: "high",
      }));

      try {
        const pushRes = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messages),
        });
        if (!pushRes.ok) pushDeliveryStatus = "failed";
      } catch {
        pushDeliveryStatus = "failed";
      }
    } else {
      pushDeliveryStatus = "no_device_registered";
    }

    // ── 5. Log to notification_logs for each parent ───────────
    const logRows = parentUserIds.map((userId) => ({
      school_id,
      recipient_user_id: userId,
      trigger_event: "attendance_absent",
      channel: tokens.length > 0 ? "push" : "in_app",
      title,
      body,
      deep_link_url: deepLink,
      delivery_status: pushDeliveryStatus,
      is_safeguarding: true,
      related_student_id: student_id,
    }));

    await admin.from("notification_logs").insert(logRows);

    return json({ sent: tokens.length, status: pushDeliveryStatus });
  } catch (err: any) {
    console.error("send-absence-notification error:", err);
    return json({ error: err.message ?? "Internal error" }, 500);
  }
});
