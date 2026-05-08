import { createClient } from 'jsr:@supabase/supabase-js@2';

interface RequestBody {
  applicationId: string;
  sendInvite?: boolean;
  inviteEmail?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { applicationId, sendInvite = false, inviteEmail } = await req.json() as RequestBody;

    if (!applicationId) {
      return new Response(
        JSON.stringify({ error: 'applicationId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('authorization')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const userClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          authorization: authHeader,
        },
      },
    });

    // Get caller user to validate staff role
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get application details
    const { data: application, error: appError } = await supabase
      .from('admissions_applications')
      .select(`
        id, school_id, full_name, date_of_birth, gender,
        parent_name, parent_phone, parent_email, parent_relationship,
        grade_applying_for, inquiry_id, streams (id, grades (id))
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return new Response(
        JSON.stringify({ error: 'Application not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate caller is staff of the school
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('school_id, role')
      .eq('id', user.id)
      .single();

    if (!callerProfile || callerProfile.school_id !== application.school_id || !['admin', 'school_admin', 'front_desk'].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Start advisory lock to ensure atomicity
    await supabase.rpc('pg_advisory_xact_lock', {
      key: BigInt(applicationId.substring(0, 8), 16), // Convert part of UUID to int
    });

    // 1. Create student record
    const { data: student, error: studentError } = await supabase
      .from('students')
      .insert({
        full_name: application.full_name,
        date_of_birth: application.date_of_birth,
        gender: application.gender,
        school_id: application.school_id,
        stream_id: application.streams?.id,
        status: 'active',
      })
      .select()
      .single();

    if (studentError) {
      throw new Error(`Failed to create student: ${studentError.message}`);
    }

    // 2. Create or dedupe parent
    const { data: parent, error: parentError } = await supabase
      .from('parents')
      .upsert(
        {
          full_name: application.parent_name,
          phone: application.parent_phone,
          email: application.parent_email,
          school_id: application.school_id,
        },
        { onConflict: 'phone,school_id' }
      )
      .select()
      .single();

    if (parentError) {
      throw new Error(`Failed to upsert parent: ${parentError.message}`);
    }

    // 3. Create student_parent_link
    const { error: linkError } = await supabase
      .from('student_parent_links')
      .insert({
        student_id: student.id,
        parent_id: parent.id,
        relationship: application.parent_relationship || 'parent',
      });

    if (linkError) {
      throw new Error(`Failed to link parent: ${linkError.message}`);
    }

    // 4. Update application status
    const { error: updateError } = await supabase
      .from('admissions_applications')
      .update({
        status: 'enrolled',
        converted_student_id: student.id,
      })
      .eq('id', applicationId);

    if (updateError) {
      throw new Error(`Failed to update application: ${updateError.message}`);
    }

    // 5. If inquiry exists, update its status
    if (application.inquiry_id) {
      await supabase
        .from('inquiries')
        .update({
          status: 'enrolled',
          converted_student_id: student.id,
        })
        .eq('id', application.inquiry_id);

      // Log conversion note
      await supabase
        .from('inquiry_notes')
        .insert({
          inquiry_id: application.inquiry_id,
          school_id: application.school_id,
          author_id: user.id,
          body: `Converted to enrolled student: ${student.full_name}`,
          kind: 'conversion',
          meta: { student_id: student.id },
        });
    }

    // 6. Optionally send invite
    if (sendInvite && inviteEmail) {
      try {
        await supabase.functions.invoke('invite-user', {
          body: {
            email: inviteEmail,
            studentId: student.id,
            inviteType: 'parent',
          },
        });
      } catch (err) {
        console.warn('Failed to send invite:', err);
        // Don't fail the entire operation if invite fails
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        student: {
          id: student.id,
          full_name: student.full_name,
          student_number: student.student_number,
        },
        parent: {
          id: parent.id,
          full_name: parent.full_name,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error:', err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
