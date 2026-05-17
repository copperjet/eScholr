import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────

export interface GradingScale {
  grade_label: string;
  min_percentage: number;
  max_percentage: number;
}

export interface MarkRecord {
  id: string;
  student_id: string;
  subject_id: string;
  assessment_type: string;
  value: number | null;
  is_excused: boolean;
  excused_reason: string | null;
  is_locked: boolean;
}

export interface AssignmentDetail {
  id: string;
  subject_id: string;
  stream_id: string;
  semester_id: string;
  subjectName: string;
  streamName: string;
  gradeName: string;
  sectionName: string;
  semesterName: string;
  isWindowOpen: boolean;
  isIGCSE: boolean;
}

export interface StudentMarkRow {
  id: string;
  full_name: string;
  student_number: string;
  photo_url: string | null;
  fa1: MarkRecord | null;
  fa2: MarkRecord | null;
  summative: MarkRecord | null;
}

export interface ProgressRow {
  assignmentId: string;
  subjectName: string;
  streamName: string;
  gradeName: string;
  semesterId: string;
  isWindowOpen: boolean;
  entered: number;
  total: number;
}

// IGCSE / A Level detection by section name
const IGCSE_SECTIONS = ['igcse', 'as level', 'a level', 'a-level', 'sixth form'];
export function isIGCSESection(sectionName: string): boolean {
  return IGCSE_SECTIONS.some((s) => sectionName.toLowerCase().includes(s));
}

// ── Grade helper ──────────────────────────────────────────────

export function getGradeLabel(total: number | null, scales: GradingScale[]): string {
  if (total === null || total === undefined) return '—';
  const scale = scales.find((s) => total >= s.min_percentage && total <= s.max_percentage);
  return scale?.grade_label ?? '—';
}

export function computeTotal(
  fa1: number | null,
  fa2: number | null,
  sum: number | null,
  isIGCSE: boolean,
): number | null {
  if (isIGCSE) return sum;
  if (fa1 === null || fa2 === null || sum === null) return null;
  return Math.round((fa1 * 0.2 + fa2 * 0.2 + sum * 0.6) * 10) / 10;
}

// ── Grading scale (cached forever) ───────────────────────────

export function useGradingScale(schoolId: string) {
  return useQuery<GradingScale[]>({
    queryKey: ['grading-scale', schoolId],
    enabled: !!schoolId,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('grading_scales')
        .select('grade_label, min_percentage, max_percentage')
        .eq('school_id', schoolId)
        .order('min_percentage', { ascending: false });
      if (error) throw error;
      return (data ?? []) as GradingScale[];
    },
  });
}

// ── ST assignment list with progress ─────────────────────────

export function useMarksProgress(staffId: string | null, schoolId: string) {
  return useQuery<ProgressRow[]>({
    queryKey: ['marks-progress', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data: assignments, error } = await (supabase as any)
        .from('subject_teacher_assignments')
        .select(`
          id, subject_id, stream_id, semester_id,
          subjects ( name ),
          streams ( name, grades ( name ) ),
          semesters ( name, is_active, marks_window_open )
        `)
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId);

      if (error) throw error;
      const asgns = (assignments ?? []) as any[];

      if (asgns.length === 0) return [];

      // Student counts per stream
      const streamIds = [...new Set(asgns.map((a: any) => a.stream_id))];
      const { data: students } = await (supabase as any)
        .from('students')
        .select('id, stream_id')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .in('stream_id', streamIds);

      const countByStream: Record<string, number> = {};
      (students ?? []).forEach((s: any) => {
        countByStream[s.stream_id] = (countByStream[s.stream_id] ?? 0) + 1;
      });

      // Entered marks counts per assignment
      const semesterIds = [...new Set(asgns.map((a: any) => a.semester_id))];
      const subjectIds  = [...new Set(asgns.map((a: any) => a.subject_id))];
      const { data: marks } = await (supabase as any)
        .from('marks')
        .select('student_id, subject_id, stream_id, semester_id, assessment_type, value')
        .eq('school_id', schoolId)
        .in('semester_id', semesterIds)
        .in('subject_id', subjectIds)
        .in('stream_id', streamIds);

      const marksRows = (marks ?? []) as any[];

      return asgns.map((a: any) => {
        const total = countByStream[a.stream_id] ?? 0;
        // Count unique students with at least one mark entered for this assignment
        const studentIds = new Set(
          marksRows
            .filter(
              (m: any) =>
                m.subject_id === a.subject_id &&
                m.stream_id === a.stream_id &&
                m.semester_id === a.semester_id &&
                m.value !== null,
            )
            .map((m: any) => m.student_id),
        );
        return {
          assignmentId: a.id,
          subjectName:  a.subjects?.name ?? '—',
          streamName:   a.streams?.name ?? '—',
          gradeName:    a.streams?.grades?.name ?? '—',
          semesterId:   a.semester_id,
          isWindowOpen: a.semesters?.marks_window_open ?? true,
          entered:      studentIds.size,
          total,
        };
      });
    },
  });
}

// ── Marks for a single assignment (entry screen) ─────────────

export function useMarksForAssignment(
  assignment: {
    id: string; subject_id: string; stream_id: string; semester_id: string;
    subjects?: any; streams?: any; semesters?: any;
  } | null,
  schoolId: string,
) {
  return useQuery<{ students: StudentMarkRow[]; detail: AssignmentDetail | null }>({
    queryKey: ['marks-entry', assignment?.id, schoolId],
    enabled: !!assignment && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const a = assignment!;

      const [studentsRes, marksRes] = await Promise.all([
        supabase
          .from('students')
          .select('id, full_name, student_number, photo_url')
          .eq('school_id', schoolId)
          .eq('stream_id', a.stream_id)
          .eq('status', 'active')
          .order('full_name'),
        supabase
          .from('marks')
          .select('id, student_id, subject_id, assessment_type, value, is_excused, excused_reason, is_locked')
          .eq('school_id', schoolId)
          .eq('subject_id', a.subject_id)
          .eq('stream_id', a.stream_id)
          .eq('semester_id', a.semester_id),
      ]);

      const markMap: Record<string, Record<string, MarkRecord>> = {};
      ((marksRes.data ?? []) as any[]).forEach((m: any) => {
        if (!markMap[m.student_id]) markMap[m.student_id] = {};
        markMap[m.student_id][m.assessment_type] = m as MarkRecord;
      });

      const sectionName = a.streams?.grades?.school_sections?.name ?? '';
      const detail: AssignmentDetail = {
        id:           a.id,
        subject_id:   a.subject_id,
        stream_id:    a.stream_id,
        semester_id:  a.semester_id,
        subjectName:  a.subjects?.name ?? '—',
        streamName:   a.streams?.name ?? '—',
        gradeName:    a.streams?.grades?.name ?? '—',
        sectionName,
        semesterName: a.semesters?.name ?? '—',
        isWindowOpen: a.semesters?.marks_window_open ?? true,
        isIGCSE:      isIGCSESection(sectionName),
      };

      const students: StudentMarkRow[] = ((studentsRes.data ?? []) as any[]).map((s: any) => ({
        id:             s.id,
        full_name:      s.full_name,
        student_number: s.student_number,
        photo_url:      s.photo_url ?? null,
        fa1:            markMap[s.id]?.fa1 ?? null,
        fa2:            markMap[s.id]?.fa2 ?? null,
        summative:      markMap[s.id]?.summative ?? null,
      }));

      return { students, detail };
    },
  });
}

// ── Admin marks completion matrix ─────────────────────────────

export interface MatrixRow {
  subjectId: string;
  subjectName: string;
  cells: Record<string, { entered: number; total: number; streamName: string }>;
}

export function useMarksMatrix(schoolId: string, semesterId: string | undefined) {
  return useQuery<{ rows: MatrixRow[]; streamNames: Record<string, string> }>({
    queryKey: ['marks-matrix', schoolId, semesterId],
    enabled: !!schoolId && !!semesterId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const [assignmentsRes, marksRes, studentsRes] = await Promise.all([
        supabase
          .from('subject_teacher_assignments')
          .select('subject_id, stream_id, subjects ( name ), streams ( name )')
          .eq('school_id', schoolId)
          .eq('semester_id', semesterId!),
        supabase
          .from('marks')
          .select('student_id, subject_id, stream_id, value')
          .eq('school_id', schoolId)
          .eq('semester_id', semesterId!)
          .not('value', 'is', null),
        supabase
          .from('students')
          .select('id, stream_id')
          .eq('school_id', schoolId)
          .eq('status', 'active'),
      ]);

      const assignments = (assignmentsRes.data ?? []) as any[];
      const allMarks    = (marksRes.data ?? []) as any[];
      const allStudents = (studentsRes.data ?? []) as any[];

      const countByStream: Record<string, number> = {};
      allStudents.forEach((s: any) => {
        countByStream[s.stream_id] = (countByStream[s.stream_id] ?? 0) + 1;
      });

      const enteredMap: Record<string, Record<string, Set<string>>> = {}; // subjectId → streamId → studentIds
      allMarks.forEach((m: any) => {
        if (!enteredMap[m.subject_id]) enteredMap[m.subject_id] = {};
        if (!enteredMap[m.subject_id][m.stream_id]) enteredMap[m.subject_id][m.stream_id] = new Set();
        enteredMap[m.subject_id][m.stream_id].add(m.student_id);
      });

      const streamNames: Record<string, string> = {};
      assignments.forEach((a: any) => { streamNames[a.stream_id] = a.streams?.name ?? a.stream_id; });

      const subjectMap: Record<string, MatrixRow> = {};
      assignments.forEach((a: any) => {
        if (!subjectMap[a.subject_id]) {
          subjectMap[a.subject_id] = { subjectId: a.subject_id, subjectName: a.subjects?.name ?? '—', cells: {} };
        }
        const entered = enteredMap[a.subject_id]?.[a.stream_id]?.size ?? 0;
        const total   = countByStream[a.stream_id] ?? 0;
        subjectMap[a.subject_id].cells[a.stream_id] = { entered, total, streamName: a.streams?.name ?? '' };
      });

      return { rows: Object.values(subjectMap), streamNames };
    },
  });
}

// ── Save mark mutation ────────────────────────────────────────

export function useUpdateMark(schoolId: string, assignmentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId: string;
      subjectId: string;
      streamId: string;
      semesterId: string;
      assessmentType: string;
      value: number;
      enteredBy: string;
      oldValue?: number | null;
      markId?: string;
    }) => {
      const { studentId, subjectId, streamId, semesterId, assessmentType, value, enteredBy, oldValue, markId } = params;

      const { data, error } = await (supabase as any)
        .from('marks')
        .upsert(
          {
            school_id:       schoolId,
            student_id:      studentId,
            subject_id:      subjectId,
            stream_id:       streamId,
            semester_id:     semesterId,
            assessment_type: assessmentType,
            value,
            is_excused:      false,
            entered_by:      enteredBy,
            updated_at:      new Date().toISOString(),
          } as any,
          { onConflict: 'student_id,subject_id,semester_id,assessment_type' },
        )
        .select('id')
        .single();

      if (error) throw error;

      // Audit log (fire-and-forget)
      const savedMarkId = (data as any)?.id ?? markId;
      if (savedMarkId && (oldValue !== undefined)) {
        (supabase as any).from('mark_audit_logs').insert({
          school_id:  schoolId,
          mark_id:    savedMarkId,
          student_id: studentId,
          subject_id: subjectId,
          old_value:  oldValue ?? null,
          new_value:  value,
          changed_by: enteredBy,
        } as any).then(() => {});
      }

      return data;
    },
    // ── Optimistic update — UI reflects new value instantly ──
    onMutate: async (params) => {
      if (!assignmentId) return { previous: undefined };
      const key = ['marks-entry', assignmentId, schoolId];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<{ students: StudentMarkRow[]; detail: AssignmentDetail | null }>(key);
      if (previous) {
        qc.setQueryData(key, {
          ...previous,
          students: previous.students.map((s) =>
            s.id !== params.studentId
              ? s
              : {
                  ...s,
                  [params.assessmentType]: {
                    ...(s as any)[params.assessmentType],
                    id: (s as any)[params.assessmentType]?.id ?? `optimistic-${Date.now()}`,
                    student_id: params.studentId,
                    subject_id: params.subjectId,
                    assessment_type: params.assessmentType,
                    value: params.value,
                    is_excused: false,
                    excused_reason: null,
                    is_locked: false,
                  } as MarkRecord,
                },
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous && assignmentId) {
        qc.setQueryData(['marks-entry', assignmentId, schoolId], ctx.previous);
      }
    },
    onSettled: () => {
      if (assignmentId) {
        qc.invalidateQueries({ queryKey: ['marks-entry', assignmentId, schoolId] });
      }
      qc.invalidateQueries({ queryKey: ['marks-progress'] });
      qc.invalidateQueries({ queryKey: ['marks-matrix'] });
    },
  });
}

// ── Excuse mark (N/A) mutation ────────────────────────────────

export function useExcuseMark(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId: string;
      subjectId: string;
      streamId: string;
      semesterId: string;
      enteredBy: string;
      isExcused: boolean;
      reason?: string;
    }) => {
      const { studentId, subjectId, streamId, semesterId, enteredBy, isExcused, reason } = params;
      // Upsert for all assessment types
      const types = ['fa1', 'fa2', 'summative'];
      for (const assessmentType of types) {
        await (supabase as any).from('marks').upsert(
          {
            school_id:       schoolId,
            student_id:      studentId,
            subject_id:      subjectId,
            stream_id:       streamId,
            semester_id:     semesterId,
            assessment_type: assessmentType,
            value:           null,
            is_excused:      isExcused,
            excused_reason:  reason ?? null,
            entered_by:      enteredBy,
            updated_at:      new Date().toISOString(),
          } as any,
          { onConflict: 'student_id,subject_id,semester_id,assessment_type' },
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marks-entry'] });
    },
  });
}

// ── Admin unlock mark mutation ────────────────────────────────

export function useMarkUnlock(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      markId: string;
      adminId: string;
      reportId?: string;
    }) => {
      const db = supabase as any;
      const { error } = await db
        .from('marks')
        .update({
          is_locked:              false,
          correction_unlocked_by: params.adminId,
          correction_unlocked_at: new Date().toISOString(),
        })
        .eq('id', params.markId)
        .eq('school_id', schoolId);
      if (error) throw error;

      // Revert report to draft if given
      if (params.reportId) {
        await db
          .from('reports')
          .update({ status: 'pending_approval' })
          .eq('id', params.reportId)
          .eq('school_id', schoolId);
      }

      // Audit log
      (supabase as any).from('audit_logs').insert({
        school_id:  schoolId,
        event_type: 'mark_unlocked',
        actor_id:   params.adminId,
        data:       { mark_id: params.markId, report_id: params.reportId ?? null },
      } as any).then(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marks-entry'] });
      qc.invalidateQueries({ queryKey: ['marks-matrix'] });
    },
  });
}
