import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────

export const CREED_TRAITS = [
  { key: 'creativity',  label: 'Creativity' },
  { key: 'respect',     label: 'Respect'    },
  { key: 'excellence',  label: 'Excellence' },
  { key: 'empathy',     label: 'Empathy'    },
  { key: 'discipline',  label: 'Discipline' },
] as const;

export type TraitKey = typeof CREED_TRAITS[number]['key'];

export const CAMBRIDGE_RATINGS = ['A*', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'U'] as const;
export const DEVELOPMENTAL_RATINGS = ['Exceeding', 'Secure', 'Developing', 'Emerging'] as const;

export interface CreedRecord {
  id: string;
  student_id: string;
  creativity:  string | null;
  respect:     string | null;
  excellence:  string | null;
  empathy:     string | null;
  discipline:  string | null;
  is_locked:   boolean;
}

export interface CharacterFramework {
  is_enabled:    boolean;
  value_names:   string[];
  rating_scale:  'cambridge' | 'developmental';
}

// ── Character framework (cached) ─────────────────────────────

export function useCharacterFramework(schoolId: string) {
  return useQuery<CharacterFramework | null>({
    queryKey: ['character-framework', schoolId],
    enabled: !!schoolId,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('character_frameworks')
        .select('is_enabled, value_names, rating_scale')
        .eq('school_id', schoolId)
        .maybeSingle();
      if (error || !data) return null;
      return data as any as CharacterFramework;
    },
  });
}

// ── CREED records for a stream ────────────────────────────────

export function useCreedForStream(
  streamId: string | undefined,
  semesterId: string | undefined,
  schoolId: string,
) {
  return useQuery<{
    students: { id: string; full_name: string; student_number: string; photo_url: string | null }[];
    records: Record<string, CreedRecord>;
  }>({
    queryKey: ['creed-stream', streamId, semesterId, schoolId],
    enabled: !!streamId && !!semesterId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const [studentsRes, creedRes] = await Promise.all([
        (supabase as any)
          .from('students')
          .select('id, full_name, student_number, photo_url')
          .eq('school_id', schoolId)
          .eq('stream_id', streamId!)
          .eq('status', 'active')
          .order('full_name'),
        (supabase as any)
          .from('character_records')
          .select('id, student_id, creativity, respect, excellence, empathy, discipline, is_locked')
          .eq('school_id', schoolId)
          .eq('semester_id', semesterId!),
      ]);

      const records: Record<string, CreedRecord> = {};
      ((creedRes.data ?? []) as any[]).forEach((r: any) => {
        records[r.student_id] = r as CreedRecord;
      });

      return {
        students: (studentsRes.data ?? []) as any[],
        records,
      };
    },
  });
}

// ── Save CREED mutation ───────────────────────────────────────

export function useUpdateCreed(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId:  string;
      semesterId: string;
      enteredBy:  string;
      trait:      TraitKey;
      value:      string;
      existingId?: string;
    }) => {
      const { studentId, semesterId, enteredBy, trait, value, existingId } = params;

      if (existingId) {
        const db = supabase as any;
        const { error } = await db
          .from('character_records')
          .update({
            [trait]:     value,
            entered_by:  enteredBy,
            updated_at:  new Date().toISOString(),
          })
          .eq('id', existingId)
          .eq('school_id', schoolId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('character_records')
          .upsert(
            {
              school_id:   schoolId,
              student_id:  studentId,
              semester_id: semesterId,
              entered_by:  enteredBy,
              [trait]:     value,
              updated_at:  new Date().toISOString(),
            } as any,
            { onConflict: 'student_id,semester_id' },
          );
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['creed-stream'] });
    },
  });
}
