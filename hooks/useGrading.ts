import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface GradingScale {
  id: string;
  grade_label: string;
  min_percentage: number;
  max_percentage: number;
  description: string | null;
  order_index: number;
}

export function useGradingScales(schoolId: string) {
  return useQuery<GradingScale[]>({
    queryKey: ['grading-scales-admin', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('grading_scales')
        .select('id, grade_label, min_percentage, max_percentage, description, order_index')
        .eq('school_id', schoolId)
        .order('min_percentage', { ascending: false });
      if (error) throw error;
      return (data ?? []) as GradingScale[];
    },
  });
}

export interface UpsertGradingScale {
  id?: string;
  grade_label: string;
  min_percentage: number;
  max_percentage: number;
  description?: string | null;
  order_index: number;
}

export function useUpsertGradingScale(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertGradingScale) => {
      const db = supabase as any;
      const payload = {
        school_id:      schoolId,
        grade_label:    input.grade_label.trim(),
        min_percentage: input.min_percentage,
        max_percentage: input.max_percentage,
        description:    input.description ?? null,
        order_index:    input.order_index,
      };
      if (input.id) {
        const { error } = await db.from('grading_scales').update(payload).eq('id', input.id).eq('school_id', schoolId);
        if (error) throw error;
      } else {
        const { error } = await db.from('grading_scales').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grading-scales-admin', schoolId] });
      qc.invalidateQueries({ queryKey: ['grading-scale', schoolId] });
    },
  });
}

export function useDeleteGradingScale(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('grading_scales')
        .delete()
        .eq('id', id)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grading-scales-admin', schoolId] });
      qc.invalidateQueries({ queryKey: ['grading-scale', schoolId] });
    },
  });
}
