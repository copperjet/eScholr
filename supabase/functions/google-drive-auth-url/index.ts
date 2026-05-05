/**
 * Returns a Google OAuth authorization URL.
 * Client secret stays server-side.
 *
 * Required secrets (set via `supabase secrets set`):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI   (e.g. https://<your-project>.supabase.co/functions/v1/google-drive-auth-callback)
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { school_id, staff_id } = await req.json();
    if (!school_id) throw new Error('school_id required');

    const clientId    = Deno.env.get('GOOGLE_CLIENT_ID');
    const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI');
    if (!clientId || !redirectUri) throw new Error('GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI not configured');

    const state = btoa(JSON.stringify({ school_id, staff_id: staff_id ?? null, ts: Date.now() }));

    const params = new URLSearchParams({
      client_id:    clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    return new Response(
      JSON.stringify({ url, redirect_uri: redirectUri }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
