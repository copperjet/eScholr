/**
 * manage-school-notes — Supabase Edge Function
 *
 * POST /functions/v1/manage-school-notes
 * Body (list):   { action: "list",   school_id }
 * Body (create): { action: "create", school_id, body, is_pinned? }
 * Body (delete): { action: "delete", note_id, school_id }
 * Body (pin):    { action: "pin",    note_id, school_id, is_pinned }
 * Auth: Bearer <super_admin JWT>
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
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);
    const callerClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);
    const callerRoles: string[] = (caller.app_metadata as any)?.roles ?? [];
    if (!callerRoles.includes("super_admin")) {
      return json({ error: "Forbidden" }, 403);
    }

    const payload = await req.json() as {
      action: "list" | "create" | "delete" | "pin";
      school_id: string;
      note_id?: string;
      body?: string;
      is_pinned?: boolean;
    };

    const { action, school_id } = payload;
    if (!school_id) return json({ error: "school_id required" }, 400);

    switch (action) {
      case "list": {
        const { data: notes, error } = await adminClient
          .from("school_notes")
          .select("id, body, is_pinned, author_id, created_at, updated_at")
          .eq("school_id", school_id)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 500);
        return json({ notes: notes ?? [] });
      }

      case "create": {
        const { body: noteBody, is_pinned } = payload;
        if (!noteBody?.trim()) return json({ error: "body required" }, 400);
        if (noteBody.length > 2000) return json({ error: "Note too long (max 2000 chars)" }, 400);
        const { data: note, error } = await adminClient
          .from("school_notes")
          .insert({
            school_id,
            author_id: caller.id,
            body: noteBody.trim(),
            is_pinned: is_pinned ?? false,
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ note });
      }

      case "delete": {
        const { note_id } = payload;
        if (!note_id) return json({ error: "note_id required" }, 400);
        const { error } = await adminClient
          .from("school_notes")
          .delete()
          .eq("id", note_id)
          .eq("school_id", school_id);
        if (error) return json({ error: error.message }, 500);
        return json({ success: true });
      }

      case "pin": {
        const { note_id, is_pinned } = payload;
        if (!note_id) return json({ error: "note_id required" }, 400);
        const { data: note, error } = await adminClient
          .from("school_notes")
          .update({ is_pinned: is_pinned ?? false, updated_at: new Date().toISOString() })
          .eq("id", note_id)
          .eq("school_id", school_id)
          .select()
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ note });
      }

      default:
        return json({ error: "Invalid action" }, 400);
    }

  } catch (err: any) {
    console.error("manage-school-notes error:", err);
    return json({ error: err.message ?? "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
