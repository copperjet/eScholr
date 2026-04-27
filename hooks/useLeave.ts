/**
 * Leave management hooks — requests, balances, approvals.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export interface LeaveRequest {
  id: string;
  school_id: string;
  staff_id: string;
  leave_type: 'annual' | 'sick' | 'maternity' | 'paternity' | 'compassionate' | 'unpaid' | 'other';
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  staff?: {
    full_name: string;
    staff_number: string | null;
  };
  approver?: {
    full_name: string;
  };
}

export interface LeaveBalance {
  id: string;
  school_id: string;
  staff_id: string;
  leave_type: string;
  year: number;
  entitlement_days: number;
  used_days: number;
  remaining_days: number;
}

// ─── hooks ────────────────────────────────────────────────────────────────────

export function useLeaveRequests(schoolId: string) {
  return useQuery<LeaveRequest[]>({
    queryKey: ['leave-requests', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('leave_requests')
        .select('*, staff:staff_id(full_name, staff_number), approver:approved_by(full_name)')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeaveRequest[];
    },
  });
}

export function useStaffLeaveRequests(staffId: string | null, schoolId: string) {
  return useQuery<LeaveRequest[]>({
    queryKey: ['staff-leave-requests', staffId, schoolId],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('leave_requests')
        .select('*, approver:approved_by(full_name)')
        .eq('school_id', schoolId)
        .eq('staff_id', staffId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeaveRequest[];
    },
  });
}

export function useLeaveBalances(staffId: string | null, schoolId: string, year?: number) {
  const targetYear = year ?? new Date().getFullYear();
  return useQuery<LeaveBalance[]>({
    queryKey: ['leave-balances', staffId, schoolId, targetYear],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff_leave_balances')
        .select('*')
        .eq('school_id', schoolId)
        .eq('staff_id', staffId!)
        .eq('year', targetYear);
      if (error) throw error;
      return (data ?? []) as LeaveBalance[];
    },
  });
}

export function useLeaveRequestDetail(requestId: string | null) {
  return useQuery<LeaveRequest | null>({
    queryKey: ['leave-request', requestId],
    enabled: !!requestId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      if (!requestId) return null;
      const { data, error } = await (supabase as any)
        .from('leave_requests')
        .select('*, staff:staff_id(full_name, staff_number), approver:approved_by(full_name)')
        .eq('id', requestId)
        .single();
      if (error) return null;
      return data as LeaveRequest;
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

export function useCreateLeaveRequest(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      staffId: string;
      leaveType: LeaveRequest['leave_type'];
      startDate: string;
      endDate: string;
      reason?: string;
    }) => {
      const db = supabase as any;
      const { error } = await db.from('leave_requests').insert({
        school_id: schoolId,
        staff_id: params.staffId,
        leave_type: params.leaveType,
        start_date: params.startDate,
        end_date: params.endDate,
        reason: params.reason ?? null,
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      qc.invalidateQueries({ queryKey: ['staff-leave-requests'] });
    },
  });
}

function patchLeaveStatus(
  qc: ReturnType<typeof useQueryClient>,
  requestId: string,
  patch: Partial<LeaveRequest>,
) {
  const snapshots: Array<[readonly unknown[], any]> = [];
  ['leave-requests', 'staff-leave-requests'].forEach((root) => {
    qc.getQueriesData({ queryKey: [root] }).forEach(([key, value]) => {
      if (!Array.isArray(value)) return;
      snapshots.push([key, value]);
      qc.setQueryData(
        key,
        (value as LeaveRequest[]).map((r) => (r.id === requestId ? { ...r, ...patch } : r)),
      );
    });
  });
  qc.getQueriesData({ queryKey: ['leave-request', requestId] }).forEach(([key, value]) => {
    if (!value) return;
    snapshots.push([key, value]);
    qc.setQueryData(key, { ...(value as LeaveRequest), ...patch });
  });
  return snapshots;
}

export function useApproveLeaveRequest(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      requestId: string;
      approverStaffId: string;
    }) => {
      const db = supabase as any;
      const { error } = await db
        .from('leave_requests')
        .update({
          status: 'approved',
          approved_by: params.approverStaffId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.requestId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onMutate: async (params) => {
      const snapshots = patchLeaveStatus(qc, params.requestId, {
        status: 'approved',
        approved_by: params.approverStaffId,
        approved_at: new Date().toISOString(),
      } as any);
      return { snapshots };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshots?.forEach(([key, value]: any) => qc.setQueryData(key, value));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      qc.invalidateQueries({ queryKey: ['leave-request'] });
      qc.invalidateQueries({ queryKey: ['staff-leave-requests'] });
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
    },
  });
}

export function useRejectLeaveRequest(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      requestId: string;
      rejectionReason: string;
    }) => {
      const db = supabase as any;
      const { error } = await db
        .from('leave_requests')
        .update({
          status: 'rejected',
          rejection_reason: params.rejectionReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.requestId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onMutate: async (params) => {
      const snapshots = patchLeaveStatus(qc, params.requestId, {
        status: 'rejected',
        rejection_reason: params.rejectionReason,
      } as any);
      return { snapshots };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshots?.forEach(([key, value]: any) => qc.setQueryData(key, value));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      qc.invalidateQueries({ queryKey: ['leave-request'] });
      qc.invalidateQueries({ queryKey: ['staff-leave-requests'] });
    },
  });
}

export function useCancelLeaveRequest(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requestId: string) => {
      const db = supabase as any;
      const { error } = await db
        .from('leave_requests')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      qc.invalidateQueries({ queryKey: ['staff-leave-requests'] });
    },
  });
}

export function useInitializeLeaveBalances(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      staffId: string;
      year: number;
      entitlements: { leaveType: string; days: number }[];
    }) => {
      const db = supabase as any;
      const inserts = params.entitlements.map((e) => ({
        school_id: schoolId,
        staff_id: params.staffId,
        leave_type: e.leaveType,
        year: params.year,
        entitlement_days: e.days,
        used_days: 0,
      }));
      const { error } = await db.from('staff_leave_balances').insert(inserts);
      if (error) throw error;
    },
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: ['leave-balances', params.staffId] });
    },
  });
}
