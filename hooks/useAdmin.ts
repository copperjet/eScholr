/**
 * Admin utility hooks — marks windows, semester management, year-end promotion.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export interface MarksWindow {
  id: string;
  school_id: string;
  semester_id: string;
  semester_name: string;
  subject_id: string;
  subject_name: string;
  stream_id: string;
  stream_name: string;
  grade_name: string;
  assessment_type: 'FA1' | 'FA2' | 'Summative';
  opens_at: string;
  closes_at: string;
  is_open: boolean;
  locked_by_name: string | null;
}

export interface Semester {
  id: string;
  school_id: string;
  name: string;
  academic_year: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export type PromotionOutcome = 'promote' | 'graduate' | 'repeat';

export interface StudentPromotionRecord {
  student_id: string;
  full_name: string;
  student_number: string;
  photo_url: string | null;
  stream_name: string;
  grade_name: string;
  overall_percentage: number | null;
  attendance_rate: number | null;
  outcome: PromotionOutcome | null;
  target_stream_id: string | null;
}

// ─── marks windows ────────────────────────────────────────────────────────────

export function useMarksWindows(schoolId: string) {
  return useQuery<MarksWindow[]>({
    queryKey: ['marks-windows', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const { data: sem } = await db
        .from('semesters')
        .select('id, name')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .limit(1)
        .single();
      if (!sem) return [];

      const { data, error } = await db
        .from('marks_windows')
        .select(`
          id, school_id, semester_id, subject_id, stream_id,
          assessment_type, opens_at, closes_at, is_open,
          subjects ( name ),
          streams ( name, grades ( name ) ),
          staff:locked_by ( full_name )
        `)
        .eq('school_id', schoolId)
        .eq('semester_id', sem.id)
        .order('assessment_type')
        .order('streams(name)');
      if (error) throw error;

      return ((data ?? []) as any[]).map((r: any): MarksWindow => ({
        id: r.id,
        school_id: r.school_id,
        semester_id: r.semester_id,
        semester_name: sem.name,
        subject_id: r.subject_id,
        subject_name: r.subjects?.name ?? '—',
        stream_id: r.stream_id,
        stream_name: r.streams?.name ?? '—',
        grade_name: r.streams?.grades?.name ?? '—',
        assessment_type: r.assessment_type,
        opens_at: r.opens_at,
        closes_at: r.closes_at,
        is_open: r.is_open ?? false,
        locked_by_name: r.staff?.full_name ?? null,
      }));
    },
  });
}

export function useToggleMarksWindow(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { windowId: string; open: boolean; staffId: string }) => {
      const db = supabase as any;
      const { error } = await db
        .from('marks_windows')
        .update({
          is_open: params.open,
          locked_by: params.open ? null : params.staffId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.windowId)
        .eq('school_id', schoolId);
      if (error) throw error;

      db.from('audit_logs').insert({
        school_id: schoolId,
        action: params.open ? 'marks_window_opened' : 'marks_window_unlocked',
        entity_type: 'marks_windows',
        entity_id: params.windowId,
        performed_by: params.staffId,
        performed_at: new Date().toISOString(),
        meta: { open: params.open },
      }).then(() => {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marks-windows', schoolId] }),
  });
}

export function useBulkSetMarksWindows(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { semesterId: string; open: boolean; staffId: string }) => {
      const db = supabase as any;
      const { error } = await db
        .from('marks_windows')
        .update({
          is_open: params.open,
          locked_by: params.open ? null : params.staffId,
          updated_at: new Date().toISOString(),
        })
        .eq('school_id', schoolId)
        .eq('semester_id', params.semesterId);
      if (error) throw error;

      db.from('audit_logs').insert({
        school_id: schoolId,
        action: params.open ? 'marks_window_opened' : 'marks_window_unlocked',
        entity_type: 'marks_windows',
        entity_id: null,
        performed_by: params.staffId,
        performed_at: new Date().toISOString(),
        meta: { bulk: true, open: params.open, semesterId: params.semesterId },
      }).then(() => {});
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['marks-windows', schoolId] }),
  });
}

// ─── semesters ────────────────────────────────────────────────────────────────

export function useSemesters(schoolId: string) {
  return useQuery<Semester[]>({
    queryKey: ['semesters', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('semesters')
        .select('id, school_id, name, academic_year, start_date, end_date, is_active, created_at')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Semester[];
    },
  });
}

export function useCreateSemester(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      academicYear: string;
      startDate: string;
      endDate: string;
    }) => {
      const db = supabase as any;
      const { error } = await db.from('semesters').insert({
        school_id: schoolId,
        name: params.name,
        academic_year: params.academicYear,
        start_date: params.startDate,
        end_date: params.endDate,
        is_active: false,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['semesters', schoolId] }),
  });
}

export function useActivateSemester(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (semesterId: string) => {
      const db = supabase as any;
      // Deactivate all first
      await db.from('semesters').update({ is_active: false }).eq('school_id', schoolId);
      const { error } = await db
        .from('semesters')
        .update({ is_active: true })
        .eq('id', semesterId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['semesters', schoolId] });
      qc.invalidateQueries({ queryKey: ['finance-summary'] });
      qc.invalidateQueries({ queryKey: ['marks-windows'] });
    },
  });
}

// ─── year-end promotion ───────────────────────────────────────────────────────

export function useStudentsForPromotion(schoolId: string) {
  return useQuery<StudentPromotionRecord[]>({
    queryKey: ['students-promotion', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data: sem } = await db
        .from('semesters')
        .select('id')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .limit(1)
        .single();
      if (!sem) return [];

      const { data, error } = await db
        .from('students')
        .select(`
          id, full_name, student_number, photo_url,
          streams ( name, grades ( name ) )
        `)
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .order('full_name');
      if (error) throw error;

      // Fetch overall % from reports for this semester
      const { data: reports } = await db
        .from('reports')
        .select('student_id, overall_percentage')
        .eq('school_id', schoolId)
        .eq('semester_id', sem.id);
      const reportMap: Record<string, number | null> = {};
      ((reports ?? []) as any[]).forEach((r: any) => { reportMap[r.student_id] = r.overall_percentage; });

      return ((data ?? []) as any[]).map((s: any): StudentPromotionRecord => ({
        student_id: s.id,
        full_name: s.full_name,
        student_number: s.student_number,
        photo_url: s.photo_url ?? null,
        stream_name: s.streams?.name ?? '—',
        grade_name: s.streams?.grades?.name ?? '—',
        overall_percentage: reportMap[s.id] ?? null,
        attendance_rate: null,
        outcome: null,
        target_stream_id: null,
      }));
    },
  });
}

export function useRunPromotion(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      records: StudentPromotionRecord[];
      newSemesterId: string;
      staffId: string;
    }) => {
      const db = supabase as any;
      const now = new Date().toISOString();

      for (const rec of params.records) {
        if (!rec.outcome) continue;

        if (rec.outcome === 'graduate') {
          // Deactivate student
          await db
            .from('students')
            .update({ is_active: false, updated_at: now })
            .eq('id', rec.student_id)
            .eq('school_id', schoolId);
        } else {
          // promote → move to target stream if set; repeat → stay in same stream
          const targetStreamId = rec.outcome === 'promote' && rec.target_stream_id
            ? rec.target_stream_id
            : undefined;

          if (targetStreamId) {
            await db
              .from('students')
              .update({ stream_id: targetStreamId, updated_at: now })
              .eq('id', rec.student_id)
              .eq('school_id', schoolId);
          }

          // Create new year record
          await db.from('student_year_records').insert({
            school_id: schoolId,
            student_id: rec.student_id,
            semester_id: params.newSemesterId,
            stream_id: targetStreamId ?? null,
            created_at: now,
          });
        }
      }

      // Audit
      db.from('audit_logs').insert({
        school_id: schoolId,
        action: 'year_end_promotion',
        entity_type: 'students',
        performed_by: params.staffId,
        performed_at: now,
        meta: {
          total: params.records.filter((r) => r.outcome).length,
          promoted: params.records.filter((r) => r.outcome === 'promote').length,
          graduated: params.records.filter((r) => r.outcome === 'graduate').length,
          repeated: params.records.filter((r) => r.outcome === 'repeat').length,
        },
      }).then(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['students-promotion', schoolId] });
    },
  });
}
