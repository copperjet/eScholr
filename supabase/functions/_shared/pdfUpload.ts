/**
 * Shared PDF upload helper.
 * Standardised storage path: `{schoolId}/{docType}/{docId}/v{n}.pdf`.
 * All PDF generators in this project route through here so bucket
 * names and path conventions stay consistent.
 */
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type DocType = "report" | "invoice" | "receipt" | "transcript";

const BUCKET_BY_DOC_TYPE: Record<DocType, string> = {
  report:     "school-reports",
  invoice:    "receipts",
  receipt:    "receipts",
  transcript: "school-assets",
};

export function bucketFor(docType: DocType): string {
  return BUCKET_BY_DOC_TYPE[docType];
}

export function storagePath(
  docType: DocType,
  schoolId: string,
  docId: string,
  versionNumber: number,
): string {
  return `${schoolId}/${docType}/${docId}/v${versionNumber}.pdf`;
}

export interface UploadResult {
  pdfUrl: string;
  bucket: string;
  path: string;
}

/**
 * Uploads PDF bytes to the doc-type-appropriate bucket and returns
 * the public URL. Throws on failure.
 */
export async function uploadPdf(
  admin: SupabaseClient,
  args: {
    docType: DocType;
    schoolId: string;
    docId: string;
    versionNumber: number;
    bytes: Uint8Array;
  },
): Promise<UploadResult> {
  const bucket = bucketFor(args.docType);
  const path   = storagePath(args.docType, args.schoolId, args.docId, args.versionNumber);

  const { error: upErr } = await admin
    .storage
    .from(bucket)
    .upload(path, args.bytes, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "31536000",
    });

  if (upErr) throw new Error(`upload failed (${bucket}/${path}): ${upErr.message}`);

  const { data: urlData } = admin.storage.from(bucket).getPublicUrl(path);
  return { pdfUrl: urlData.publicUrl, bucket, path };
}

/**
 * Convenience client builder using service role. Edge functions
 * call this so they don't all re-derive env vars.
 */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
