import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export interface StaffRecord {
  id: string;
  school_id: string;
  auth_user_id: string | null;
  full_name: string;
  staff_number: string | null;
  email: string;
  phone: string | null;
  department: string | null;
  position: string | null;
  status: 'active' | 'inactive';
  date_joined: string;
  hire_date: string | null;
  photo_url: string | null;
  national_id: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  employment_type: 'full_time' | 'part_time' | 'contract' | 'substitute' | null;
  staff_type: 'teacher' | 'support' | 'substitute' | 'administrator' | null;
  contract_start: string | null;
  contract_end: string | null;
  manager_staff_id: string | null;
  tax_id: string | null;
  dob: string | null;
  gender: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_branch: string | null;
  pay_type: 'salary' | 'hourly' | null;
  base_salary: number | null;
  hourly_rate: number | null;
  currency: string | null;
  login_status: 'none' | 'pending_login' | 'active';
  created_at: string;
}

export interface StaffRoleAssignment {
  id: string;
  school_id: string;
  staff_id: string;
  role: string;
  stipend_amount: number | null;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
}

export type StaffUpsert = Partial<Omit<StaffRecord, 'id' | 'school_id' | 'staff_number' | 'auth_user_id' | 'login_status' | 'created_at'>>;

// ─── queries ──────────────────────────────────────────────────────────────────

export function useStaffList(schoolId: string, statusFilter: 'active' | 'inactive' | 'all' = 'active') {
  return useQuery<StaffRecord[]>({
    queryKey: ['hr-staff-list', schoolId, statusFilter],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      let q = (supabase as any)
        .from('staff')
        .select('id, full_name, staff_number, email, phone, department, position, photo_url, status, staff_type, employment_type, hire_date, date_joined, staff_roles(role)')
        .eq('school_id', schoolId)
        .order('full_name');
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StaffRecord[];
    },
  });
}

export function useStaffDetail(staffId: string | null, schoolId: string) {
  return useQuery<StaffRecord | null>({
    queryKey: ['hr-staff-detail', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      if (!staffId) return null;
      const { data, error } = await (supabase as any)
        .from('staff')
        .select('*')
        .eq('id', staffId)
        .eq('school_id', schoolId)
        .single();
      if (error) return null;
      return data as StaffRecord;
    },
  });
}

export function useStaffRoleAssignments(staffId: string | null, schoolId: string) {
  return useQuery<StaffRoleAssignment[]>({
    queryKey: ['hr-staff-role-assignments', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      if (!staffId) return [];
      const { data, error } = await (supabase as any)
        .from('staff_role_assignments')
        .select('*')
        .eq('staff_id', staffId)
        .eq('school_id', schoolId)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as StaffRoleAssignment[];
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

export function useUpdateStaff(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, patch }: { staffId: string; patch: StaffUpsert }) => {
      const { error } = await (supabase as any)
        .from('staff')
        .update(patch)
        .eq('id', staffId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: (_data, { staffId }) => {
      qc.invalidateQueries({ queryKey: ['hr-staff-detail', staffId] });
      qc.invalidateQueries({ queryKey: ['hr-staff-list', schoolId] });
    },
  });
}

export function useCreateStaff(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: StaffUpsert & { full_name: string; email: string }) => {
      const { data, error } = await (supabase as any)
        .from('staff')
        .insert({ ...payload, school_id: schoolId })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-staff-list', schoolId] });
    },
  });
}

export function useUpsertRoleAssignment(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<StaffRoleAssignment, 'id' | 'school_id' | 'created_at'> & { id?: string }) => {
      const row = { ...payload, school_id: schoolId };
      const { error } = payload.id
        ? await (supabase as any).from('staff_role_assignments').update(row).eq('id', payload.id)
        : await (supabase as any).from('staff_role_assignments').insert(row);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-staff-role-assignments', vars.staff_id] });
    },
  });
}

export function useDeleteRoleAssignment(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, staffId }: { id: string; staffId: string }) => {
      const { error } = await (supabase as any)
        .from('staff_role_assignments')
        .delete()
        .eq('id', id)
        .eq('school_id', schoolId);
      if (error) throw error;
      return staffId;
    },
    onSuccess: (staffId) => {
      qc.invalidateQueries({ queryKey: ['hr-staff-role-assignments', staffId] });
    },
  });
}
