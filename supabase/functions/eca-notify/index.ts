/**
 * eca-notify — Supabase Edge Function
 *
 * POST /functions/v1/eca-notify
 * Body: { event, school_id, student_id, activity_id?, category_id? }
 *
 * Events: eca_choices_open | eca_assignment_made | eca_session_reminder |
 *         eca_promoted_from_waitlist
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore
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

async function sendPush(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  if (!tokens.length) return "no_device_registered";
  const messages = tokens.map((t) => ({ to: t, title, body, data, sound: "default", priority: "high" }));
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    return res.ok ? "delivered" : "failed";
  } catch {
    return "failed";
  }
}

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // @ts-ignore
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // @ts-ignore
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin       = createClient(supabaseUrl, serviceKey);

    const { event, school_id, student_id, activity_id, category_id } = await req.json() as {
      event:        string;
      school_id:    string;
      student_id?:  string;
      activity_id?: string;
      category_id?: string;
    };

    if (!event || !school_id) return json({ error: "Missing event or school_id" }, 400);

    switch (event) {
      // ── Activity published: notify eligible parents ────────────
      case "eca_choices_open": {
        if (!activity_id) return json({ error: "activity_id required" }, 400);

        const { data: activity } = await admin
          .from("eca_activities")
          .select("name, choice_window_end, category_id, eca_activity_eligible_streams(stream_id)")
          .eq("id", activity_id)
          .single();

        if (!activity) return json({ error: "activity not found" }, 404);

        const streamIds = (activity.eca_activity_eligible_streams ?? []).map((r: any) => r.stream_id);
        if (!streamIds.length) return json({ sent: 0 });

        const { data: students } = await admin
          .from("students")
          .select("id")
          .in("stream_id", streamIds)
          .eq("school_id", school_id)
          .eq("status", "active");

        const studentIds = (students ?? []).map((s: any) => s.id);
        if (!studentIds.length) return json({ sent: 0 });

        const { data: links } = await admin
          .from("student_parent_links")
          .select("parent_id, parents(auth_user_id)")
          .in("student_id", studentIds);

        const parentUserIds = [...new Set(
          (links ?? []).map((l: any) => l.parents?.auth_user_id).filter(Boolean)
        )] as string[];

        const { data: tokenRows } = await admin
          .from("push_tokens")
          .select("push_token")
          .in("user_id", parentUserIds);

        const tokens = (tokenRows ?? []).map((r: any) => r.push_token).filter(Boolean);
        const endDate = activity.choice_window_end
          ? new Date(activity.choice_window_end).toLocaleDateString()
          : "soon";

        const title = `ECA sign-up open: ${activity.name}`;
        const body  = `Choices open until ${endDate}. Log in to select activities for your child.`;
        const deliveryStatus = await sendPush(tokens, title, body, { activity_id, school_id });

        await admin.from("notification_logs").insert(
          parentUserIds.map((uid: string) => ({
            school_id, recipient_user_id: uid,
            trigger_event: "eca_choices_open", channel: tokens.length > 0 ? "push" : "in_app",
            title, body, delivery_status: deliveryStatus,
          }))
        );

        return json({ sent: tokens.length });
      }

      // ── Promoted from waitlist ─────────────────────────────────
      case "eca_promoted_from_waitlist": {
        if (!student_id || !activity_id) return json({ error: "student_id and activity_id required" }, 400);

        const { data: student } = await admin
          .from("students").select("full_name").eq("id", student_id).single();
        const { data: activity } = await admin
          .from("eca_activities").select("name").eq("id", activity_id).single();

        const title = `${student?.full_name ?? "Student"} promoted from waitlist`;
        const body  = `A space opened in ${activity?.name ?? "an activity"}. Your child has been assigned.`;

        const { data: links } = await admin
          .from("student_parent_links")
          .select("parents(auth_user_id)")
          .eq("student_id", student_id);

        const parentUserIds = (links ?? []).map((l: any) => l.parents?.auth_user_id).filter(Boolean) as string[];
        const { data: tokenRows } = await admin
          .from("push_tokens").select("push_token").in("user_id", parentUserIds);
        const tokens = (tokenRows ?? []).map((r: any) => r.push_token).filter(Boolean);
        const deliveryStatus = await sendPush(tokens, title, body, { student_id, activity_id });

        await admin.from("notification_logs").insert(
          parentUserIds.map((uid: string) => ({
            school_id, recipient_user_id: uid,
            trigger_event: "eca_promoted_from_waitlist", channel: tokens.length > 0 ? "push" : "in_app",
            title, body, delivery_status: deliveryStatus, related_student_id: student_id,
          }))
        );
        return json({ sent: tokens.length });
      }

      // ── Session reminder ───────────────────────────────────────
      case "eca_session_reminder": {
        // For single activity reminder; bulk handled by eca-session-reminder cron fn
        if (!activity_id) return json({ error: "activity_id required" }, 400);

        const { data: activity } = await admin
          .from("eca_activities")
          .select("name, day_of_week, start_time, location")
          .eq("id", activity_id).single();

        const { data: assignments } = await admin
          .from("eca_assignments")
          .select("student_id, students(full_name, auth_user_id), eca_activity_patrons!activity_id(staff_id, staff(auth_user_id))")
          .eq("activity_id", activity_id)
          .eq("status", "assigned");

        const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const dayName = activity?.day_of_week != null ? days[activity.day_of_week] : "tomorrow";
        const title = `ECA session tomorrow: ${activity?.name ?? "Activity"}`;
        const body  = `${dayName} at ${activity?.start_time ?? ""}${activity?.location ? ` — ${activity.location}` : ""}`;

        const studentIds = (assignments ?? []).map((a: any) => a.student_id);
        const { data: links } = await admin
          .from("student_parent_links").select("parents(auth_user_id)").in("student_id", studentIds);
        const parentUserIds = [...new Set(
          (links ?? []).map((l: any) => l.parents?.auth_user_id).filter(Boolean)
        )] as string[];

        const { data: tokenRows } = await admin
          .from("push_tokens").select("push_token").in("user_id", parentUserIds);
        const tokens = (tokenRows ?? []).map((r: any) => r.push_token).filter(Boolean);
        const deliveryStatus = await sendPush(tokens, title, body, { activity_id });

        await admin.from("notification_logs").insert(
          parentUserIds.map((uid: string) => ({
            school_id, recipient_user_id: uid,
            trigger_event: "eca_session_reminder", channel: tokens.length > 0 ? "push" : "in_app",
            title, body, delivery_status: deliveryStatus,
          }))
        );
        return json({ sent: tokens.length });
      }

      default:
        return json({ error: `Unknown event: ${event}` }, 400);
    }
  } catch (err: any) {
    console.error("eca-notify error:", err);
    return json({ error: err.message ?? "Internal error" }, 500);
  }
});
