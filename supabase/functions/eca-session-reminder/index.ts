/**
 * eca-session-reminder — Supabase Edge Function (cron)
 *
 * Called daily at 18:00 school timezone.
 * Finds activities scheduled for tomorrow's day_of_week,
 * sends reminders to patrons and parents of assigned students.
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

async function batchPush(tokens: string[], title: string, body: string, data: Record<string, unknown>) {
  if (!tokens.length) return "no_device_registered";
  const messages = tokens.map((t) => ({ to: t, title, body, data, sound: "default", priority: "normal" }));
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

    // Tomorrow's day_of_week (0=Sun..6=Sat)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDow = tomorrow.getDay();

    const { data: activities, error: actErr } = await admin
      .from("eca_activities")
      .select("id, name, school_id, start_time, location, day_of_week")
      .eq("day_of_week", tomorrowDow)
      .eq("status", "published");

    if (actErr) throw actErr;
    if (!activities?.length) return json({ processed: 0 });

    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const dayName = days[tomorrowDow];
    let totalSent = 0;

    for (const activity of activities) {
      const title = `ECA tomorrow: ${activity.name}`;
      const body  = `${dayName} at ${activity.start_time ?? ""}${activity.location ? ` — ${activity.location}` : ""}`;
      const pushData = { activity_id: activity.id, school_id: activity.school_id };

      // ── Notify patrons ─────────────────────────────────────
      const { data: patrons } = await admin
        .from("eca_activity_patrons")
        .select("staff(auth_user_id)")
        .eq("activity_id", activity.id);

      const patronUserIds = (patrons ?? [])
        .map((p: any) => p.staff?.auth_user_id)
        .filter(Boolean) as string[];

      if (patronUserIds.length) {
        const { data: patronTokens } = await admin
          .from("push_tokens").select("push_token").in("user_id", patronUserIds);
        const tokens = (patronTokens ?? []).map((r: any) => r.push_token).filter(Boolean);
        const patronTitle = `ECA session tomorrow: ${activity.name}`;
        const patronBody  = `You are a patron for this session. ${body}`;
        const ds = await batchPush(tokens, patronTitle, patronBody, pushData);
        await admin.from("notification_logs").insert(
          patronUserIds.map((uid: string) => ({
            school_id: activity.school_id, recipient_user_id: uid,
            trigger_event: "eca_session_reminder", channel: tokens.length > 0 ? "push" : "in_app",
            title: patronTitle, body: patronBody, delivery_status: ds,
          }))
        );
        totalSent += tokens.length;
      }

      // ── Notify parents of assigned students ───────────────
      const { data: assignments } = await admin
        .from("eca_assignments")
        .select("student_id")
        .eq("activity_id", activity.id)
        .eq("status", "assigned");

      const studentIds = (assignments ?? []).map((a: any) => a.student_id);
      if (!studentIds.length) continue;

      const { data: links } = await admin
        .from("student_parent_links")
        .select("parents(auth_user_id)")
        .in("student_id", studentIds);

      const parentUserIds = [...new Set(
        (links ?? []).map((l: any) => l.parents?.auth_user_id).filter(Boolean)
      )] as string[];

      if (parentUserIds.length) {
        const { data: parentTokens } = await admin
          .from("push_tokens").select("push_token").in("user_id", parentUserIds);
        const tokens = (parentTokens ?? []).map((r: any) => r.push_token).filter(Boolean);
        const ds = await batchPush(tokens, title, body, pushData);
        await admin.from("notification_logs").insert(
          parentUserIds.map((uid: string) => ({
            school_id: activity.school_id, recipient_user_id: uid,
            trigger_event: "eca_session_reminder", channel: tokens.length > 0 ? "push" : "in_app",
            title, body, delivery_status: ds,
          }))
        );
        totalSent += tokens.length;
      }
    }

    return json({ processed: activities.length, sent: totalSent });
  } catch (err: any) {
    console.error("eca-session-reminder error:", err);
    return json({ error: err.message ?? "Internal error" }, 500);
  }
});
