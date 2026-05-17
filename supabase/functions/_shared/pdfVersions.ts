/**
 * Shared helpers for the unified pdf_versions table.
 *
 * Each successful PDF render produces a new version row. The DB
 * trigger trg_pdf_versions_current automatically flips older
 * versions' is_current to false.
 */
import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { DocType } from "./pdfUpload.ts";

export async function nextVersionNumber(
  admin: SupabaseClient,
  docType: DocType,
  docId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("pdf_versions")
    .select("version_number")
    .eq("doc_type", docType)
    .eq("doc_id", docId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`nextVersionNumber: ${error.message}`);
  return ((data?.version_number as number | undefined) ?? 0) + 1;
}

export interface InsertVersionArgs {
  docType:           DocType;
  docId:             string;
  schoolId:          string;
  versionNumber:     number;
  pdfUrl:            string;
  verificationToken?: string | null;
}

export async function insertVersion(
  admin: SupabaseClient,
  args: InsertVersionArgs,
): Promise<void> {
  const { error } = await admin.from("pdf_versions").insert({
    school_id:          args.schoolId,
    doc_type:           args.docType,
    doc_id:             args.docId,
    version_number:     args.versionNumber,
    pdf_url:            args.pdfUrl,
    verification_token: args.verificationToken ?? null,
    is_current:         true,
    created_at:         new Date().toISOString(),
  });
  if (error) throw new Error(`insertVersion: ${error.message}`);
}

/**
 * Mirror the new pdf_url + success status onto the parent document
 * table so client code reading the parent row sees the latest
 * artifact without joining pdf_versions.
 */
export async function markParentSuccess(
  admin: SupabaseClient,
  docType: DocType,
  docId: string,
  pdfUrl: string,
): Promise<void> {
  const now = new Date().toISOString();
  const baseUpdate = {
    pdf_url:          pdfUrl,
    pdf_status:       "success",
    pdf_error:        null,
    pdf_generated_at: now,
  };

  if (docType === "report") {
    await admin.from("reports").update({ ...baseUpdate, updated_at: now }).eq("id", docId);
  } else if (docType === "invoice") {
    await admin.from("invoices").update(baseUpdate).eq("id", docId);
  } else if (docType === "receipt") {
    await admin.from("finance_records")
      .update({ ...baseUpdate, receipt_url: pdfUrl })
      .eq("id", docId);
  } else if (docType === "transcript") {
    await admin.from("transcripts")
      .update({ ...baseUpdate, status: "ready" })
      .eq("id", docId);
  }
}

export async function markParentFailed(
  admin: SupabaseClient,
  docType: DocType,
  docId: string,
  err: string,
): Promise<void> {
  const truncated = err.slice(0, 500);
  if (docType === "report") {
    await admin.from("reports")
      .update({ pdf_status: "failed", pdf_error: truncated, updated_at: new Date().toISOString() })
      .eq("id", docId);
  } else if (docType === "invoice") {
    await admin.from("invoices")
      .update({ pdf_status: "failed", pdf_error: truncated })
      .eq("id", docId);
  } else if (docType === "receipt") {
    await admin.from("finance_records")
      .update({ pdf_status: "failed", pdf_error: truncated })
      .eq("id", docId);
  } else if (docType === "transcript") {
    await admin.from("transcripts")
      .update({ pdf_status: "failed", pdf_error: truncated, status: "failed" })
      .eq("id", docId);
  }
}

export async function markParentGenerating(
  admin: SupabaseClient,
  docType: DocType,
  docId: string,
): Promise<void> {
  if (docType === "report") {
    await admin.from("reports")
      .update({ pdf_status: "generating", pdf_error: null, updated_at: new Date().toISOString() })
      .eq("id", docId);
  } else if (docType === "invoice") {
    await admin.from("invoices")
      .update({ pdf_status: "generating", pdf_error: null })
      .eq("id", docId);
  } else if (docType === "receipt") {
    await admin.from("finance_records")
      .update({ pdf_status: "generating", pdf_error: null })
      .eq("id", docId);
  } else if (docType === "transcript") {
    await admin.from("transcripts")
      .update({ pdf_status: "generating", pdf_error: null, status: "generating" })
      .eq("id", docId);
  }
}

export function newVerificationToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
