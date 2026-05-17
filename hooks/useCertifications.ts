import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export interface StaffCertification {
  id: string;
  school_id: string;
  staff_id: string;
  cert_type: string;
  cert_number: string | null;
  issuing_body: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  file_url: string | null;
  status: 'valid' | 'expiring' | 'expired';
  created_at: string;
  updated_at: string;
  staff?: { full_name: string; staff_number: string | null; photo_url: string | null };
}

export type CertStatusFilter = 'all' | 'valid' | 'expiring' | 'expired';

// ─── queries ──────────────────────────────────────────────────────────────────

export function useAllCertifications(schoolId: string, statusFilter: CertStatusFilter = 'all') {
  return useQuery<StaffCertification[]>({
    queryKey: ['hr-certifications', schoolId, statusFilter],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      let q = (supabase as any)
        .from('staff_certifications')
        .select('*, staff:staff_id(full_name, staff_number, photo_url)')
        .eq('school_id', schoolId)
        .order('expiry_date', { ascending: true, nullsFirst: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StaffCertification[];
    },
  });
}

export function useStaffCertifications(staffId: string | null, schoolId: string) {
  return useQuery<StaffCertification[]>({
    queryKey: ['hr-staff-certifications', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      if (!staffId) return [];
      const { data, error } = await (supabase as any)
        .from('staff_certifications')
        .select('*')
        .eq('staff_id', staffId)
        .eq('school_id', schoolId)
        .order('expiry_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as StaffCertification[];
    },
  });
}

export function useCertStatusCounts(schoolId: string) {
  return useQuery<{ valid: number; expiring: number; expired: number }>({
    queryKey: ['hr-cert-status-counts', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff_certifications')
        .select('status')
        .eq('school_id', schoolId);
      if (error) throw error;
      const counts = { valid: 0, expiring: 0, expired: 0 };
      (data ?? []).forEach((row: any) => {
        if (row.status in counts) counts[row.status as keyof typeof counts]++;
      });
      return counts;
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

export function useCreateCertification(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<StaffCertification, 'id' | 'school_id' | 'status' | 'created_at' | 'updated_at' | 'staff'>) => {
      const { error } = await (supabase as any)
        .from('staff_certifications')
        .insert({ ...payload, school_id: schoolId });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-certifications', schoolId] });
      qc.invalidateQueries({ queryKey: ['hr-staff-certifications', vars.staff_id] });
      qc.invalidateQueries({ queryKey: ['hr-cert-status-counts', schoolId] });
    },
  });
}

export function useUpdateCertification(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<StaffCertification> }) => {
      const { error } = await (supabase as any)
        .from('staff_certifications')
        .update(patch)
        .eq('id', id)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-certifications', schoolId] });
      qc.invalidateQueries({ queryKey: ['hr-staff-certifications'] });
      qc.invalidateQueries({ queryKey: ['hr-cert-status-counts', schoolId] });
    },
  });
}

export function useDeleteCertification(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, staffId }: { id: string; staffId: string }) => {
      const { error } = await (supabase as any)
        .from('staff_certifications')
        .delete()
        .eq('id', id)
        .eq('school_id', schoolId);
      if (error) throw error;
      return staffId;
    },
    onSuccess: (staffId) => {
      qc.invalidateQueries({ queryKey: ['hr-certifications', schoolId] });
      qc.invalidateQueries({ queryKey: ['hr-staff-certifications', staffId] });
      qc.invalidateQueries({ queryKey: ['hr-cert-status-counts', schoolId] });
    },
  });
}
