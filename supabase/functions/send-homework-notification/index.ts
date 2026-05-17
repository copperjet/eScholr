import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// @ts-ignore - Edge function environment has different module resolution
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// @ts-ignore - Deno global is available in edge function environment
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { event_type, school_id, homework_id, subject_name, title, due_date, stream_id, student_id, score, max_score } = await req.json();

    if (!school_id || !homework_id || !event_type) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      // @ts-ignore - Deno.env is available in edge function environment
      Deno.env.get("SUPABASE_URL") ?? "",
      // @ts-ignore - Deno.env is available in edge function environment
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (event_type === "assigned") {
      // Get homework details with subject and stream info
      const { data: homework, error: homeworkError } = await supabase
        .from("homework_assignments")
        .select(`
          title,
          description,
          due_date,
          max_score,
          subjects(name),
          streams(name)
        `)
        .eq("id", homework_id)
        .single();

      if (homeworkError) throw homeworkError;

      // Get all students in the stream
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("id, full_name, auth_user_id")
        .eq("stream_id", stream_id)
        .eq("school_id", school_id)
        .eq("status", "active");

      if (studentsError) throw studentsError;

      // Create notifications for each student
      for (const student of students) {
        // Student notification (skip if student has no auth account)
        if (student.auth_user_id) {
          await supabase.from("notification_logs").insert({
            school_id,
            recipient_user_id: student.auth_user_id,
            trigger_event: "homework_assigned",
            channel: "push",
            title: "New Homework Assigned",
            body: `${homework.subjects?.name || "Subject"}: ${homework.title} due on ${new Date(homework.due_date).toLocaleDateString()}`,
            deep_link_url: "/(app)/(student)/homework",
            related_student_id: student.id,
          });
        }

        // Get parents for this student — join to parents table to get auth_user_id
        const { data: parentLinks } = await supabase
          .from("student_parent_links")
          .select("parents:parent_id(id, auth_user_id)")
          .eq("student_id", student.id)
          .eq("school_id", school_id);

        // Create notifications for each parent
        for (const link of (parentLinks ?? [])) {
          const parent = (link as any).parents;
          if (!parent?.auth_user_id) continue;
          await supabase.from("notification_logs").insert({
            school_id,
            recipient_user_id: parent.auth_user_id,
            trigger_event: "homework_assigned",
            channel: "push",
            title: `Homework Assigned: ${student.full_name}`,
            body: `${homework.subjects?.name || "Subject"}: ${homework.title} due on ${new Date(homework.due_date).toLocaleDateString()}`,
            deep_link_url: "/(app)/(parent)/homework",
            related_student_id: student.id,
          });
        }
      }

    } else if (event_type === "graded") {
      // Get student and homework details
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id, full_name, auth_user_id")
        .eq("id", student_id)
        .single();

      if (studentError) throw studentError;

      const { data: homework, error: homeworkError } = await supabase
        .from("homework_assignments")
        .select("title, max_score")
        .eq("id", homework_id)
        .single();

      if (homeworkError) throw homeworkError;

      // Student notification (skip if student has no auth account)
      if (student.auth_user_id) {
        await supabase.from("notification_logs").insert({
          school_id,
          recipient_user_id: student.auth_user_id,
          trigger_event: "homework_graded",
          channel: "push",
          title: "Homework Graded",
          body: `Your homework "${homework.title}" has been graded. Score: ${score}/${max_score}`,
          deep_link_url: "/(app)/(student)/homework",
          related_student_id: student.id,
        });
      }

      // Get parents for this student — join to parents table to get auth_user_id
      const { data: parentLinks } = await supabase
        .from("student_parent_links")
        .select("parents:parent_id(id, auth_user_id)")
        .eq("student_id", student.id)
        .eq("school_id", school_id);

      // Create notifications for each parent
      for (const link of (parentLinks ?? [])) {
        const parent = (link as any).parents;
        if (!parent?.auth_user_id) continue;
        await supabase.from("notification_logs").insert({
          school_id,
          recipient_user_id: parent.auth_user_id,
          trigger_event: "homework_graded",
          channel: "push",
          title: `Homework Graded: ${student.full_name}`,
          body: `Score: ${score}/${max_score} for ${homework.title}`,
          deep_link_url: "/(app)/(parent)/homework",
          related_student_id: student.id,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in homework notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
