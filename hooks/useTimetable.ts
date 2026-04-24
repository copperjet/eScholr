import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const db = supabase as any;

export interface TimetableDocument {
  id: string;
  school_id: string;
  grade_id: string | null;
  stream_id: string | null;
  label: string;
  file_url: string;
  file_type: 'pdf' | 'image';
  file_name: string;
  file_size_bytes: number | null;
  effective_from: string;
  uploaded_by: string;
  is_current: boolean;
  created_at: string;
  // joined
  grade_name?: string;
  stream_name?: string;
}

export interface UploadTimetableInput {
  school_id: string;
  grade_id?: string | null;
  stream_id?: string | null;
  label: string;
  file_url: string;
  file_type: 'pdf' | 'image';
  file_name: string;
  file_size_bytes?: number | null;
  effective_from: string;
  uploaded_by: string;
}

export function useTimetableDocuments(schoolId: string) {
  return useQuery<TimetableDocument[]>({
    queryKey: ['timetables', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await db
        .from('timetable_documents')
        .select(`
          id, school_id, grade_id, stream_id, label, file_url, file_type,
          file_name, file_size_bytes, effective_from, uploaded_by, is_current, created_at,
          grade:grades(name),
          stream:streams(name)
        `)
        .eq('school_id', schoolId)
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        grade_name: r.grade?.name ?? null,
        stream_name: r.stream?.name ?? null,
      })) as TimetableDocument[];
    },
  });
}

export function useCurrentTimetable(schoolId: string, gradeId?: string | null, streamId?: string | null) {
  return useQuery<TimetableDocument | null>({
    queryKey: ['timetable-current', schoolId, gradeId, streamId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      let q = db
        .from('timetable_documents')
        .select('id, school_id, grade_id, stream_id, label, file_url, file_type, file_name, effective_from, is_current, created_at')
        .eq('school_id', schoolId)
        .eq('is_current', true);
      if (gradeId)  q = q.eq('grade_id', gradeId);
      if (streamId) q = q.eq('stream_id', streamId);
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw error;
      return (data as TimetableDocument | null);
    },
  });
}

export function useUploadTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UploadTimetableInput) => {
      // Mark existing current record inactive first
      if (input.grade_id || input.stream_id) {
        let upd = db.from('timetable_documents').update({ is_current: false }).eq('school_id', input.school_id).eq('is_current', true);
        if (input.grade_id)  upd = upd.eq('grade_id', input.grade_id);
        if (input.stream_id) upd = upd.eq('stream_id', input.stream_id);
        await upd;
      }

      const { data, error } = await db.from('timetable_documents').insert({
        school_id: input.school_id,
        grade_id: input.grade_id ?? null,
        stream_id: input.stream_id ?? null,
        label: input.label.trim(),
        file_url: input.file_url,
        file_type: input.file_type,
        file_name: input.file_name,
        file_size_bytes: input.file_size_bytes ?? null,
        effective_from: input.effective_from,
        uploaded_by: input.uploaded_by,
        is_current: true,
        created_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['timetables', vars.school_id] });
      qc.invalidateQueries({ queryKey: ['timetable-current', vars.school_id] });
    },
  });
}

export function useDeleteTimetable(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('timetable_documents').delete().eq('id', id).eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timetables', schoolId] });
      qc.invalidateQueries({ queryKey: ['timetable-current', schoolId] });
    },
  });
}

/** Upload file to Supabase Storage `timetables` bucket and return public URL. */
export async function uploadTimetableFile(opts: {
  schoolId: string;
  fileName: string;
  base64: string;
  mimeType: string;
}): Promise<string> {
  const { schoolId, fileName, base64, mimeType } = opts;
  const path = `${schoolId}/${Date.now()}_${fileName}`;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const { error } = await (supabase.storage as any)
    .from('timetables')
    .upload(path, bytes, { contentType: mimeType, upsert: true });
  if (error) throw error;

  const { data } = (supabase.storage as any).from('timetables').getPublicUrl(path);
  return data.publicUrl as string;
}
