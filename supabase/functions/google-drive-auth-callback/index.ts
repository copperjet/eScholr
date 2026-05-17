/**
 * Exchanges OAuth code for tokens, creates/updates eScholr Backups folder,
 * and saves encrypted tokens to backup_destinations.
 *
 * Required secrets:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { callback_url, school_id, staff_id } = await req.json();
    if (!callback_url || !school_id) throw new Error('callback_url and school_id required');

    const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
    const redirectUri  = Deno.env.get('GOOGLE_REDIRECT_URI')!;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Google OAuth secrets not configured');
    }

    // Extract code from callback URL
    const url = new URL(callback_url);
    const code = url.searchParams.get('code');
    if (!code) throw new Error('No code in callback URL');

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description ?? 'Token exchange failed');

    const accessToken  = tokenData.access_token  as string;
    const refreshToken = tokenData.refresh_token as string ?? '';
    const expiresIn    = tokenData.expires_in    as number ?? 3600;
    const expiresAt    = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Get or create "eScholr Backups" folder
    const folderName = 'eScholr Backups';
    let folderId: string;
    let existingFolder: any;

    const searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchRes.json();
    existingFolder = (searchData.files ?? [])[0];

    if (existingFolder) {
      folderId = existingFolder.id;
    } else {
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }),
      });
      const createData = await createRes.json();
      folderId = createData.id;
    }

    // Save destination to Supabase
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: upsertErr } = await supabase
      .from('backup_destinations')
      .upsert({
        school_id,
        provider: 'google_drive',
        access_token_encrypted: accessToken,
        refresh_token_encrypted: refreshToken,
        token_expires_at: expiresAt,
        folder_id: folderId,
        folder_name: folderName,
        configured_by: staff_id ?? null,
        schedule: 'manual',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'school_id,provider' });

    if (upsertErr) throw new Error(upsertErr.message);

    return new Response(
      JSON.stringify({ success: true, folder_id: folderId, folder_name: folderName }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
