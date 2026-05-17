import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

interface ExportRequest {
  school_id: string;
  triggered_by: string; // staff_id
  tables?: string[]; // optional: specific tables to export
}

// Google Drive API endpoints
const GOOGLE_DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

Deno.serve(async (req: Request) => {
  // Verify JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse request
  let body: ExportRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { school_id, triggered_by, tables } = body;
  if (!school_id || !triggered_by) {
    return new Response(JSON.stringify({ error: 'Missing school_id or triggered_by' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create Supabase admin client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get Google Drive credentials from backup_destinations
  const { data: destination, error: destError } = await supabase
    .from('backup_destinations')
    .select('*')
    .eq('school_id', school_id)
    .eq('provider', 'google_drive')
    .single();

  if (destError || !destination) {
    return new Response(JSON.stringify({ error: 'Google Drive not configured for this school' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Tables to export
  const tablesToExport = tables ?? [
    'students',
    'staff',
    'parents',
    'attendance_records',
    'marks',
    'reports',
    'finance_records',
    'payment_transactions',
    'invoices',
    'day_book_entries',
    'leave_requests',
  ];

  const exportData: Record<string, any[]> = {};
  const recordCounts: Record<string, number> = {};

  // Export each table
  for (const table of tablesToExport) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('school_id', school_id)
        .limit(10000); // Safety limit

      if (error) {
        console.error(`Error exporting ${table}:`, error);
        exportData[table] = [];
        recordCounts[table] = 0;
      } else {
        exportData[table] = data ?? [];
        recordCounts[table] = (data ?? []).length;
      }
    } catch (e) {
      console.error(`Exception exporting ${table}:`, e);
      exportData[table] = [];
      recordCounts[table] = 0;
    }
  }

  // Create JSON payload
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `escholr-backup-${school_id.substring(0, 8)}-${timestamp}.json`;
  const jsonContent = JSON.stringify({
    school_id,
    exported_at: new Date().toISOString(),
    exported_by: triggered_by,
    tables: tablesToExport,
    data: exportData,
    record_counts: recordCounts,
  }, null, 2);

  // Upload to Google Drive
  const accessToken = destination.access_token_encrypted; // Should be decrypted, but for now assume it's plaintext or implement decryption
  // TODO: Implement token encryption/decryption with Supabase Vault or similar

  let uploadResult: { fileId?: string; fileUrl?: string; error?: string } = {};

  try {
    // Refresh access token if needed using refresh_token
    // For now, assume access token is valid
    const metadata = {
      name: filename,
      mimeType: 'application/json',
      parents: destination.folder_id ? [destination.folder_id] : undefined,
    };

    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelimiter = "\r\n--" + boundary + "--";

    const multipartBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      jsonContent +
      closeDelimiter;

    const uploadRes = await fetch(GOOGLE_DRIVE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body: multipartBody,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      uploadResult = { error: `Google Drive upload failed: ${errText}` };
    } else {
      const uploadData = await uploadRes.json();
      uploadResult = {
        fileId: uploadData.id,
        fileUrl: `https://drive.google.com/file/d/${uploadData.id}/view`,
      };
    }
  } catch (e: any) {
    uploadResult = { error: `Upload exception: ${e.message}` };
  }

  // Log the backup
  const { data: logEntry, error: logError } = await supabase
    .from('backup_logs')
    .insert({
      school_id,
      destination_id: destination.id,
      triggered_by,
      status: uploadResult.error ? 'failed' : 'success',
      file_name: filename,
      file_size_bytes: new Blob([jsonContent]).size,
      file_id: uploadResult.fileId,
      tables_included: tablesToExport,
      record_counts: recordCounts,
      error_message: uploadResult.error,
    })
    .select()
    .single();

  // Update destination last_backup info
  if (!uploadResult.error) {
    await supabase
      .from('backup_destinations')
      .update({
        last_backup_at: new Date().toISOString(),
        last_backup_status: 'success',
        last_backup_file_id: uploadResult.fileId,
      })
      .eq('id', destination.id);
  }

  return new Response(
    JSON.stringify({
      success: !uploadResult.error,
      filename,
      file_id: uploadResult.fileId,
      file_url: uploadResult.fileUrl,
      tables_exported: tablesToExport.length,
      record_counts: recordCounts,
      total_records: Object.values(recordCounts).reduce((a, b) => a + b, 0),
      error: uploadResult.error,
      log_id: logEntry?.id,
    }),
    {
      status: uploadResult.error ? 500 : 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
});
