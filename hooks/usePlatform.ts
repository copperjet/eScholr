import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchoolUsage {
  id: string;
  name: string;
  code: string;
  subscription_plan: string;
  subscription_status: string;
  country: string | null;
  created_at: string;
  renewal_date: string | null;
  student_count: number;
  staff_count: number;
  report_count: number;
  attendance_count: number;
  monthly_revenue: number;
}

export interface PlatformMetrics {
  summary: {
    mrr: number;
    arr: number;
    total_schools: number;
    active_schools: number;
    trial_schools: number;
    churn_rate_pct: number;
    total_students: number;
    total_staff: number;
  };
  plan_distribution: Record<string, number>;
  status_distribution: Record<string, number>;
  school_growth: { month: string; count: number }[];
  school_usage: SchoolUsage[];
  recent_impersonations: {
    school_id: string;
    target_email: string;
    reason: string | null;
    created_at: string;
  }[];
}

export interface SchoolNote {
  id: string;
  school_id: string;
  author_id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ImpersonationLog {
  id: string;
  school_id: string;
  target_email: string;
  reason: string | null;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
}

// ── Platform metrics ──────────────────────────────────────────────────────────

export function usePlatformMetrics() {
  return useQuery<PlatformMetrics>({
    queryKey: ['platform-metrics'],
    staleTime: 1000 * 60 * 3,
    queryFn: async () => {
      const { data, error } = await (supabase as any).functions.invoke('get-platform-metrics');
      if (error) throw new Error(error.message);
      return data as PlatformMetrics;
    },
  });
}

// ── School notes ──────────────────────────────────────────────────────────────

export function useSchoolNotes(schoolId: string) {
  return useQuery<SchoolNote[]>({
    queryKey: ['school-notes', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any).functions.invoke('manage-school-notes', {
        body: { action: 'list', school_id: schoolId },
      });
      if (error) throw new Error(error.message);
      return (data?.notes ?? []) as SchoolNote[];
    },
  });
}

export function useCreateSchoolNote(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { body: string; is_pinned?: boolean }) => {
      const { data, error } = await (supabase as any).functions.invoke('manage-school-notes', {
        body: { action: 'create', school_id: schoolId, ...payload },
      });
      if (error) throw new Error(error.message);
      return data?.note as SchoolNote;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['school-notes', schoolId] });
      qc.invalidateQueries({ queryKey: ['platform-schools-overview'] });
    },
  });
}

export function useDeleteSchoolNote(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await (supabase as any).functions.invoke('manage-school-notes', {
        body: { action: 'delete', school_id: schoolId, note_id: noteId },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-notes', schoolId] }),
  });
}

export function usePinSchoolNote(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, isPinned }: { noteId: string; isPinned: boolean }) => {
      const { error } = await (supabase as any).functions.invoke('manage-school-notes', {
        body: { action: 'pin', school_id: schoolId, note_id: noteId, is_pinned: isPinned },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-notes', schoolId] }),
  });
}

// ── Impersonation ─────────────────────────────────────────────────────────────

export function useImpersonateSchool() {
  return useMutation({
    mutationFn: async (payload: { school_id: string; target_staff_id?: string; reason?: string }) => {
      const { data, error } = await (supabase as any).functions.invoke('impersonate-school', {
        body: payload,
      });
      if (error) throw new Error(error.message);
      return data as {
        success: boolean;
        method: 'magic_link' | 'manual';
        action_link?: string;
        target_email: string;
        school_name: string;
        school_code: string;
        log_id?: string;
        expires_at: string;
        note?: string;
      };
    },
  });
}

// ── Impersonation log ─────────────────────────────────────────────────────────

export function useImpersonationLog(schoolId?: string) {
  return useQuery<ImpersonationLog[]>({
    queryKey: ['platform-impersonation-log', schoolId ?? 'all'],
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const body: Record<string, string> = {};
      if (schoolId) body.school_id = schoolId;
      const { data, error } = await (supabase as any).functions.invoke('get-impersonation-log', { body });
      if (error) throw new Error(error.message);
      return (data?.entries ?? []) as ImpersonationLog[];
    },
  });
}

// ── Update school ─────────────────────────────────────────────────────────────

export function useUpdateSchoolPlatform(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      subscription_plan?: string;
      subscription_status?: string;
      name?: string;
      logo_url?: string;
      primary_color?: string;
      secondary_color?: string;
      renewal_date?: string;
      country?: string;
      timezone?: string;
      currency?: string;
    }) => {
      // Edge function may not yet whitelist all fields; fall back to direct update if it 400s.
      const { error } = await (supabase as any).functions.invoke('update-school', {
        body: { school_id: schoolId, ...patch },
      });
      if (error) {
        // Fallback path — RLS allows super_admin to write directly.
        const { error: directErr } = await (supabase as any)
          .from('schools')
          .update(patch)
          .eq('id', schoolId);
        if (directErr) throw new Error(directErr.message);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-schools-overview'] });
      qc.invalidateQueries({ queryKey: ['platform-school-detail', schoolId] });
      qc.invalidateQueries({ queryKey: ['platform-metrics'] });
    },
  });
}

// ── Delete school ─────────────────────────────────────────────────────────────

export function useDeleteSchool(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('schools')
        .delete()
        .eq('id', schoolId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-schools-overview'] });
      qc.invalidateQueries({ queryKey: ['platform-metrics'] });
    },
  });
}

// ── School admins ─────────────────────────────────────────────────────────────

export interface SchoolAdmin {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

export function useSchoolAdmins(schoolId: string) {
  return useQuery<SchoolAdmin[]>({
    queryKey: ['school-admins', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, email, role, created_at')
        .eq('school_id', schoolId)
        .in('role', ['school_super_admin', 'admin', 'principal'])
        .order('role')
        .order('full_name');
      if (error) throw new Error(error.message);
      return (data ?? []) as SchoolAdmin[];
    },
  });
}

export function useInviteSchoolAdmin(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { email: string; full_name: string; password: string }) => {
      const { error } = await (supabase as any).functions.invoke('create-school-admin', {
        body: { school_id: schoolId, role: 'school_super_admin', ...payload },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['school-admins', schoolId] }),
  });
}

// ── Staff role management (platform-level) ───────────────────────────────────

export const ALL_STAFF_ROLES = [
  'school_super_admin',
  'admin',
  'principal',
  'coordinator',
  'hod',
  'hrt',
  'st',
  'finance',
  'front_desk',
  'hr',
] as const;

export type StaffRole = typeof ALL_STAFF_ROLES[number];

export interface StaffWithRoles {
  id: string;
  full_name: string;
  email: string;
  staff_number: string | null;
  status: string;
  roles: StaffRole[];
}

export function useSchoolStaff(schoolId: string) {
  return useQuery<StaffWithRoles[]>({
    queryKey: ['platform-school-staff', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff')
        .select('id, full_name, email, staff_number, status, staff_roles(role)')
        .eq('school_id', schoolId)
        .order('full_name');
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((s: any) => ({
        id: s.id,
        full_name: s.full_name,
        email: s.email,
        staff_number: s.staff_number,
        status: s.status,
        roles: (s.staff_roles ?? []).map((r: any) => r.role as StaffRole),
      }));
    },
  });
}

export function useAssignStaffRole(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, role }: { staffId: string; role: StaffRole }) => {
      const { error } = await (supabase as any)
        .from('staff_roles')
        .upsert({ school_id: schoolId, staff_id: staffId, role }, { onConflict: 'school_id,staff_id,role' });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-school-staff', schoolId] }),
  });
}

export function useRemoveStaffRole(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, role }: { staffId: string; role: StaffRole }) => {
      const { error } = await (supabase as any)
        .from('staff_roles')
        .delete()
        .eq('school_id', schoolId)
        .eq('staff_id', staffId)
        .eq('role', role);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-school-staff', schoolId] }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a logo image (base64) to Supabase Storage and return the public URL.
 * Caller is responsible for setting the URL on the school row afterwards.
 */
export async function uploadSchoolLogoFile(params: {
  schoolId: string;
  base64: string;
  mimeType: string;
}): Promise<string> {
  const ext = params.mimeType === 'image/png' ? 'png' : params.mimeType === 'image/svg+xml' ? 'svg' : 'jpg';
  const path = `${params.schoolId}/logo-${Date.now()}.${ext}`;
  const byteArray = Uint8Array.from(atob(params.base64), (c) => c.charCodeAt(0));

  const { error: uploadError } = await supabase.storage
    .from('school-assets')
    .upload(path, byteArray, { contentType: params.mimeType, upsert: true });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('school-assets').getPublicUrl(path);
  return urlData.publicUrl;
}
