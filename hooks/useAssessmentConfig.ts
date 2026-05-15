import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────

export interface AssessmentTemplate {
  id: string;
  school_id: string;
  section_id: string | null;
  name: string;
  code: string;
  weight_percent: number;
  max_marks: number;
  is_on_report: boolean;
  is_active: boolean;
  order_index: number;
  grade_ids: string[];   // resolved from assessment_template_grades
}

export interface Grade {
  id: string;
  name: string;
  order_index: number;
  section_id: string;
  section_name: string;
}

export interface UpsertTemplateInput {
  id?: string;
  name: string;
  code: string;
  weight_percent: number;
  max_marks: number;
  is_on_report: boolean;
  is_active: boolean;
  order_index: number;
  grade_ids: string[];   // empty = all grades
}

// ── Queries ───────────────────────────────────────────────────

export function useAssessmentTemplates(schoolId: string) {
  return useQuery({
    queryKey: ['assessment-templates', schoolId],
    queryFn: async (): Promise<AssessmentTemplate[]> => {
      const { data, error } = await (supabase as any)
        .from('assessment_templates')
        .select('id, school_id, section_id, name, code, weight_percent, max_marks, is_on_report, is_active, order_index')
        .eq('school_id', schoolId)
        .not('code', 'is', null)
        .order('order_index');

      if (error) throw error;

      const rows = (data ?? []) as any[];
      if (rows.length === 0) return [];

      const ids = rows.map((r: any) => r.id);
      const { data: gradeLinks } = await (supabase as any)
        .from('assessment_template_grades')
        .select('assessment_template_id, grade_id')
        .in('assessment_template_id', ids);

      const gradeMap: Record<string, string[]> = {};
      ((gradeLinks ?? []) as any[]).forEach((l: any) => {
        if (!gradeMap[l.assessment_template_id]) gradeMap[l.assessment_template_id] = [];
        gradeMap[l.assessment_template_id].push(l.grade_id);
      });

      return rows.map((r: any) => ({
        ...r,
        grade_ids: gradeMap[r.id] ?? [],
      }));
    },
    staleTime: 1000 * 60 * 5,
    enabled: !!schoolId,
  });
}

export function useSchoolGrades(schoolId: string) {
  return useQuery({
    queryKey: ['school-grades', schoolId],
    queryFn: async (): Promise<Grade[]> => {
      const { data, error } = await (supabase as any)
        .from('grades')
        .select('id, name, order_index, section_id, school_sections(name)')
        .eq('school_id', schoolId)
        .order('order_index');

      if (error) throw error;
      return ((data ?? []) as any[]).map((g: any) => ({
        id: g.id,
        name: g.name,
        order_index: g.order_index,
        section_id: g.section_id,
        section_name: g.school_sections?.name ?? '',
      }));
    },
    staleTime: 1000 * 60 * 10,
    enabled: !!schoolId,
  });
}

// ── Mutations ─────────────────────────────────────────────────

export function useUpsertAssessmentTemplate(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertTemplateInput) => {
      const payload = {
        school_id:    schoolId,
        name:         input.name,
        code:         input.code.toLowerCase().trim(),
        weight_percent: input.weight_percent,
        max_marks:    input.max_marks,
        is_on_report: input.is_on_report,
        is_active:    input.is_active,
        order_index:  input.order_index,
      };

      let templateId: string;

      if (input.id) {
        const { error } = await (supabase as any)
          .from('assessment_templates')
          .update(payload)
          .eq('id', input.id)
          .eq('school_id', schoolId);
        if (error) throw error;
        templateId = input.id;
      } else {
        const { data, error } = await (supabase as any)
          .from('assessment_templates')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        templateId = (data as any).id;
      }

      // Sync grade links — delete then re-insert
      await (supabase as any)
        .from('assessment_template_grades')
        .delete()
        .eq('assessment_template_id', templateId);

      if (input.grade_ids.length > 0) {
        const links = input.grade_ids.map((gid) => ({
          assessment_template_id: templateId,
          grade_id: gid,
        }));
        const { error: linkErr } = await (supabase as any)
          .from('assessment_template_grades')
          .insert(links);
        if (linkErr) throw linkErr;
      }

      return templateId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-templates', schoolId] }),
  });
}

export function useDeleteAssessmentTemplate(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await (supabase as any)
        .from('assessment_templates')
        .delete()
        .eq('id', templateId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-templates', schoolId] }),
  });
}

// ── Per-stream weight overrides ───────────────────────────────

export interface StreamOverride {
  stream_id: string;
  weight_override: number;
}

export function useTemplateStreamOverrides(templateId: string | null) {
  return useQuery<StreamOverride[]>({
    queryKey: ['ats', templateId],
    enabled: !!templateId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('assessment_template_streams')
        .select('stream_id, weight_override')
        .eq('assessment_template_id', templateId!);
      if (error) throw error;
      return (data ?? []) as StreamOverride[];
    },
  });
}

export function useSchoolStreams(schoolId: string) {
  return useQuery({
    queryKey: ['school-streams', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('streams')
        .select('id, name, grade_id, grades ( name, school_sections ( name ) )')
        .eq('school_id', schoolId)
        .order('name');
      if (error) throw error;
      return ((data ?? []) as any[]).map((s: any) => ({
        id: s.id,
        name: s.name,
        grade_id: s.grade_id,
        grade_name: s.grades?.name ?? '—',
        section_name: s.grades?.school_sections?.name ?? '',
      }));
    },
  });
}

export function useUpsertStreamOverride(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { stream_id: string; weight_override: number | null }) => {
      const db = supabase as any;
      if (params.weight_override === null) {
        await db.from('assessment_template_streams')
          .delete()
          .eq('assessment_template_id', templateId)
          .eq('stream_id', params.stream_id);
      } else {
        await db.from('assessment_template_streams').upsert({
          assessment_template_id: templateId,
          stream_id:              params.stream_id,
          weight_override:        params.weight_override,
        }, { onConflict: 'assessment_template_id,stream_id' });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ats', templateId] }),
  });
}

// ── Per-student assessment overrides ──────────────────────────

export interface StudentOverride {
  assessment_template_id: string;
  weight_override: number | null;
  is_exempt: boolean;
  reason: string | null;
}

export function useStudentAssessmentOverrides(
  studentId: string | null,
  semesterId: string | null,
) {
  return useQuery<StudentOverride[]>({
    queryKey: ['sao', studentId, semesterId],
    enabled: !!studentId && !!semesterId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('student_assessment_overrides')
        .select('assessment_template_id, weight_override, is_exempt, reason')
        .eq('student_id', studentId!)
        .eq('semester_id', semesterId!);
      if (error) throw error;
      return (data ?? []) as StudentOverride[];
    },
  });
}

export function useUpsertStudentOverride(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      student_id: string;
      semester_id: string;
      assessment_template_id: string;
      weight_override: number | null;
      is_exempt: boolean;
      reason?: string | null;
      staff_id: string;
    }) => {
      const db = supabase as any;
      // If both default (no override + not exempt) → delete the row to keep table tidy.
      if (!params.is_exempt && (params.weight_override === null || params.weight_override === undefined)) {
        await db.from('student_assessment_overrides')
          .delete()
          .eq('student_id', params.student_id)
          .eq('semester_id', params.semester_id)
          .eq('assessment_template_id', params.assessment_template_id);
        return;
      }
      const { error } = await db.from('student_assessment_overrides').upsert({
        school_id:              schoolId,
        student_id:             params.student_id,
        semester_id:            params.semester_id,
        assessment_template_id: params.assessment_template_id,
        weight_override:        params.weight_override,
        is_exempt:              params.is_exempt,
        reason:                 params.reason ?? null,
        created_by:             params.staff_id,
      }, { onConflict: 'student_id,semester_id,assessment_template_id' });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['sao', vars.student_id, vars.semester_id] });
    },
  });
}

export function useReorderAssessmentTemplates(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ordered: { id: string; order_index: number }[]) => {
      const updates = ordered.map(({ id, order_index }) =>
        (supabase as any)
          .from('assessment_templates')
          .update({ order_index })
          .eq('id', id)
          .eq('school_id', schoolId),
      );
      await Promise.all(updates);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-templates', schoolId] }),
  });
}
