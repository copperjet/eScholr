/**
 * eca-allocate — Supabase Edge Function
 *
 * POST /functions/v1/eca-allocate
 * Body: { student_id, category_id, choices: [{rank, activity_id}] }
 *
 * Calls eca_submit_choices RPC (validates, upserts choices, allocates FCFS),
 * then sends push notification to parent with result.
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

// @ts-ignore
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    // @ts-ignore
    const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
    // @ts-ignore
    const anonKey        = Deno.env.get("SUPABASE_ANON_KEY")!;
    // @ts-ignore
    const serviceKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // User-context client (anon key + caller JWT) so auth.uid() resolves inside the RPC.
    const userClient     = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    // Admin client for post-allocation lookups (parent IDs, push tokens).
    const admin          = createClient(supabaseUrl, serviceKey);

    const { student_id, category_id, choices } = await req.json() as {
      student_id:  string;
      category_id: string;
      choices:     Array<{ rank: number; activity_id: string }>;
    };

    if (!student_id || !category_id || !choices?.length) {
      return json({ error: "Missing required fields" }, 400);
    }

    // Call allocation RPC (runs as authenticated parent user)
    const { data: assignment, error: rpcErr } = await userClient.rpc(
      "eca_submit_choices",
      {
        p_student_id:  student_id,
        p_category_id: category_id,
        // supabase-js serializes the body to JSON; pg receives JSONB array directly.
        p_choices:     choices.map((c) => ({ rank: c.rank, activity_id: c.activity_id })),
      }
    );

    if (rpcErr) return json({ error: rpcErr.message }, 400);

    // ── Notify parent ─────────────────────────────────────────
    const { data: student } = await admin
      .from("students")
      .select("full_name, stream_id")
      .eq("id", student_id)
      .single();

    const { data: links } = await admin
      .from("student_parent_links")
      .select("parent_id, parents ( auth_user_id )")
      .eq("student_id", student_id);

    const parentUserIds = (links ?? [])
      .map((l: any) => l.parents?.auth_user_id)
      .filter(Boolean) as string[];

    if (parentUserIds.length > 0) {
      let activityName = "an activity";
      if (assignment?.activity_id) {
        const { data: act } = await admin
          .from("eca_activities")
          .select("name, school_id")
          .eq("id", assignment.activity_id)
          .single();
        if (act) activityName = act.name;
      }

      const isWaitlisted = assignment?.status === "waitlisted";
      const title = isWaitlisted
        ? `${student?.full_name ?? "Student"} on ECA waitlist`
        : `${student?.full_name ?? "Student"} assigned to ${activityName}`;
      const body = isWaitlisted
        ? `All choices are currently full. You are on the waitlist and will be notified if a space opens.`
        : `Assigned to ${activityName} (choice #${assignment.assigned_from_choice_rank ?? 1}).`;

      const { data: tokenRows } = await admin
        .from("push_tokens")
        .select("push_token")
        .in("user_id", parentUserIds);

      const tokens = (tokenRows ?? []).map((r: any) => r.push_token).filter(Boolean);

      let deliveryStatus = "delivered";
      if (tokens.length > 0) {
        const messages = tokens.map((token: string) => ({
          to: token,
          title,
          body,
          data: { student_id, category_id, assignment_id: assignment?.id },
          sound: "default",
          priority: "high",
        }));
        try {
          const pushRes = await fetch(EXPO_PUSH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(messages),
          });
          if (!pushRes.ok) deliveryStatus = "failed";
        } catch {
          deliveryStatus = "failed";
        }
      } else {
        deliveryStatus = "no_device_registered";
      }

      const schoolId = assignment?.school_id;
      if (schoolId) {
        await admin.from("notification_logs").insert(
          parentUserIds.map((uid: string) => ({
            school_id:         schoolId,
            recipient_user_id: uid,
            trigger_event:     "eca_assignment_made",
            channel:           tokens.length > 0 ? "push" : "in_app",
            title,
            body,
            delivery_status:   deliveryStatus,
            related_student_id: student_id,
          }))
        );
      }
    }

    return json({ assignment });
  } catch (err: any) {
    console.error("eca-allocate error:", err);
    return json({ error: err.message ?? "Internal error" }, 500);
  }
});
