import { createClient } from 'jsr:@supabase/supabase-js@2';

interface RequestBody {
  sessionId: string;
  docKey: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { sessionId, docKey, fileName, contentType, fileSize } = await req.json() as RequestBody;

    // Validate inputs
    if (!sessionId || !docKey || !fileName || !contentType || !fileSize) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file size (10 MB max)
    const maxFileSizeBytes = 10 * 1024 * 1024;
    if (fileSize > maxFileSizeBytes) {
      return new Response(
        JSON.stringify({ error: `File exceeds 10 MB limit (${(fileSize / 1024 / 1024).toFixed(2)} MB)` }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate file type (PDF, JPG, PNG)
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(contentType)) {
      return new Response(
        JSON.stringify({ error: 'Only PDF, JPG, and PNG files are allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role (can issue unsigned URLs)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate upload path: pending/<sessionId>/<docKey>/<fileName>
    const uploadPath = `pending/${sessionId}/${docKey}/${fileName}`;

    // Issue signed URL (5 minute expiration)
    const { data, error } = await supabase.storage
      .from('admissions-documents')
      .createSignedUploadUrl(uploadPath, 5 * 60); // 5 minutes

    if (error) {
      console.error('Error creating signed URL:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to create signed URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        uploadUrl: data.signedUrl,
        uploadPath,
        expiresIn: 300, // 5 minutes in seconds
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
