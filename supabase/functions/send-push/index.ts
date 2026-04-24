/**
 * send-push — Unified Supabase Edge Function
 *
 * POST /functions/v1/send-push
 * Authorization: Bearer <service_role_key>
 *
 * Body (one of):
 *   { type: "user",     school_id, user_ids: string[],           title, body, data?, is_safeguarding? }
 *   { type: "role",     school_id, roles: string[],              title, body, data?, is_safeguarding? }
 *   { type: "stream",   school_id, stream_id,                    title, body, data?, is_safeguarding? }
 *   { type: "grade",    school_id, grade_id,                     title, body, data?, is_safeguarding? }
 *   { type: "school",   school_id,                               title, body, data?, is_safeguarding? }
 *
 * Supports triggers:
 *   attendance_absence | report_released | announcement | daybook_sent | marks_window_open | generic
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

interface SendPushBody {
  type: "user" | "role" | "stream" | "grade" | "school";
  school_id: string;
  user_ids?: string[];
  roles?: string[];
  stream_id?: string;
  grade_id?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  trigger_event?: string;
  is_safeguarding?: boolean;
  related_student_id?: string;
  deep_link_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const payload = (await req.json()) as SendPushBody;
    const {
      type, school_id, user_ids, roles, stream_id, grade_id,
      title, body, data = {}, trigger_event = "generic",
      is_safeguarding = false, related_student_id = null, deep_link_url = null,
    } = payload;

    if (!school_id || !title || !body) {
      return json({ error: "school_id, title, and body are required" }, 400);
    }

    // ── Resolve target user IDs ───────────────────────────────────────────────
    let targetUserIds: string[] = [];

    if (type === "user" && user_ids?.length) {
      targetUserIds = user_ids;
    } else if (type === "role" && roles?.length) {
      // Staff with matching roles
      const { data: staffRows } = await db
        .from("staff_roles")
        .select("staff_id")
        .eq("school_id", school_id)
        .in("role", roles);
      const staffIds = (staffRows ?? []).map((r: any) => r.staff_id);
      if (staffIds.length) {
        const { data: authRows } = await db
          .from("staff")
          .select("auth_user_id")
          .eq("school_id", school_id)
          .in("id", staffIds)
          .not("auth_user_id", "is", null);
        targetUserIds = (authRows ?? []).map((r: any) => r.auth_user_id);
      }
    } else if (type === "stream" && stream_id) {
      // Parents of students in the stream
      const { data: sLinks } = await db
        .from("student_parent_links")
        .select("parent:parents(auth_user_id)")
        .eq("school_id", school_id)
        .in(
          "student_id",
          db.from("students").select("id").eq("school_id", school_id).eq("stream_id", stream_id).eq("status", "active")
        );
      targetUserIds = (sLinks ?? [])
        .map((r: any) => r.parent?.auth_user_id)
        .filter(Boolean);
    } else if (type === "grade" && grade_id) {
      // Parents of students in all streams of the grade
      const { data: sLinks } = await db
        .from("student_parent_links")
        .select("parent:parents(auth_user_id)")
        .eq("school_id", school_id)
        .in(
          "student_id",
          db.from("students").select("id").eq("school_id", school_id).eq("grade_id", grade_id).eq("status", "active")
        );
      targetUserIds = (sLinks ?? [])
        .map((r: any) => r.parent?.auth_user_id)
        .filter(Boolean);
    } else if (type === "school") {
      // All staff + all parents in school
      const [staffRes, parentsRes] = await Promise.all([
        db.from("staff").select("auth_user_id").eq("school_id", school_id).eq("status", "active").not("auth_user_id", "is", null),
        db.from("parents").select("auth_user_id").eq("school_id", school_id).not("auth_user_id", "is", null),
      ]);
      const staffUids = (staffRes.data ?? []).map((r: any) => r.auth_user_id);
      const parentUids = (parentsRes.data ?? []).map((r: any) => r.auth_user_id);
      targetUserIds = [...new Set([...staffUids, ...parentUids])];
    }

    if (!targetUserIds.length) {
      return json({ sent: 0, message: "No target users found" });
    }

    // ── Fetch push tokens ─────────────────────────────────────────────────────
    const { data: tokenRows } = await db
      .from("push_tokens")
      .select("user_id, push_token")
      .eq("school_id", school_id)
      .in("user_id", targetUserIds);

    const tokens = (tokenRows ?? []).map((r: any) => r.push_token).filter(Boolean);

    let sent = 0;
    let failed = 0;

    if (tokens.length) {
      // ── Batch Expo push (max 100 per request) ─────────────────────────────
      const BATCH = 100;
      for (let i = 0; i < tokens.length; i += BATCH) {
        const batch = tokens.slice(i, i + BATCH).map((t: string) => ({
          to: t,
          title,
          body,
          data: { ...data, deep_link_url, trigger_event },
          sound: "default",
          badge: 1,
          channelId: is_safeguarding ? "safeguarding" : "default",
        }));

        const resp = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(batch),
        });

        if (resp.ok) {
          const result = await resp.json();
          const data2 = result?.data ?? [];
          sent   += data2.filter((d: any) => d.status === "ok").length;
          failed += data2.filter((d: any) => d.status !== "ok").length;
        } else {
          failed += batch.length;
        }
      }
    }

    // ── Log notifications ─────────────────────────────────────────────────────
    const userIdToTokenCount: Record<string, number> = {};
    (tokenRows ?? []).forEach((r: any) => {
      userIdToTokenCount[r.user_id] = (userIdToTokenCount[r.user_id] ?? 0) + 1;
    });

    const logRows = targetUserIds.map((uid) => ({
      school_id,
      recipient_user_id: uid,
      trigger_event,
      channel: "push" as const,
      title,
      body,
      deep_link_url,
      delivery_status: (userIdToTokenCount[uid] ?? 0) > 0 ? "delivered" : "no_device_registered",
      is_safeguarding,
      is_read: false,
      related_student_id,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }));

    if (logRows.length) {
      await db.from("notification_logs").insert(logRows);
    }

    return json({ sent, failed, targeted: targetUserIds.length, tokens: tokens.length });
  } catch (err: any) {
    console.error("[send-push] Error:", err);
    return json({ error: err.message ?? "Internal error" }, 500);
  }
});
