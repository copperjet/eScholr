import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export interface StaffDocument {
  id: string;
  school_id: string;
  staff_id: string;
  doc_type: string;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  notes: string | null;
  uploader?: { full_name: string };
}

// ─── queries ──────────────────────────────────────────────────────────────────

export function useStaffDocuments(staffId: string | null, schoolId: string) {
  return useQuery<StaffDocument[]>({
    queryKey: ['hr-staff-documents', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      if (!staffId) return [];
      const { data, error } = await (supabase as any)
        .from('staff_documents')
        .select('*, uploader:uploaded_by(full_name)')
        .eq('staff_id', staffId)
        .eq('school_id', schoolId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as StaffDocument[];
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

const BUCKET = 'staff-documents';

export function useUploadStaffDocument(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      staffId: string;
      uploadedBy: string | null;
      docType: string;
      fileName: string;
      fileUri: string;        // local file URI (React Native) or base64 data URI
      mimeType?: string;
      notes?: string;
    }) => {
      // uploadedBy may be empty string when staff has no staffId yet — normalise to null
      const { staffId, docType, fileName, fileUri, mimeType = 'application/octet-stream', notes } = params;
      const uploadedBy = params.uploadedBy || null;
      const storagePath = `${schoolId}/${staffId}/${Date.now()}_${fileName}`;

      // Fetch file as blob (works for both local URIs and data URIs)
      const response = await fetch(fileUri);
      const blob = await response.blob();

      const { error: uploadErr } = await (supabase as any).storage
        .from(BUCKET)
        .upload(storagePath, blob, { contentType: mimeType, upsert: false });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = (supabase as any).storage
        .from(BUCKET)
        .getPublicUrl(storagePath);

      const { error: insertErr } = await (supabase as any)
        .from('staff_documents')
        .insert({
          school_id: schoolId,
          staff_id: staffId,
          doc_type: docType,
          file_url: urlData.publicUrl,
          file_name: fileName,
          uploaded_by: uploadedBy,
          notes: notes ?? null,
        });
      if (insertErr) throw insertErr;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-staff-documents', vars.staffId, schoolId] });
    },
  });
}

export function useDeleteStaffDocument(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, staffId, fileUrl }: { id: string; staffId: string; fileUrl: string }) => {
      // Best-effort storage deletion (ignore errors — URL may be external)
      try {
        const url = new URL(fileUrl);
        const pathParts = url.pathname.split(`/${BUCKET}/`);
        if (pathParts.length === 2) {
          await (supabase as any).storage.from(BUCKET).remove([pathParts[1]]);
        }
      } catch (_) { /* external URL or parse error — skip */ }

      const { error } = await (supabase as any)
        .from('staff_documents')
        .delete()
        .eq('id', id)
        .eq('school_id', schoolId);
      if (error) throw error;
      return staffId;
    },
    onSuccess: (staffId) => {
      qc.invalidateQueries({ queryKey: ['hr-staff-documents', staffId, schoolId] });
    },
  });
}
