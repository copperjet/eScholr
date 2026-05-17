/**
 * useSageSync — Sage outbox queue hooks.
 * Lists pending/failed/sent rows, triggers CSV export, retries failed rows.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SageSyncStatus = 'pending' | 'sent_csv' | 'sent_api' | 'failed' | 'skipped';

export interface SageSyncRow {
  id: string;
  school_id: string;
  event_type: string;
  entity_table: string;
  entity_id: string;
  payload: Record<string, unknown>;
  status: SageSyncStatus;
  attempts: number;
  last_error: string | null;
  idempotency_key: string;
  created_at: string;
  sent_at: string | null;
}

export interface SageSyncCounts {
  pending: number;
  sent_csv: number;
  sent_api: number;
  failed: number;
}

export interface FinanceExport {
  id: string;
  export_type: 'csv' | 'api';
  file_url: string | null;
  rows_included: number;
  status: 'success' | 'partial' | 'failed';
  error_message: string | null;
  created_at: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSageSyncCounts(schoolId: string) {
  return useQuery<SageSyncCounts>({
    queryKey: ['sage-sync-counts', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sage_sync_queue')
        .select('status')
        .eq('school_id', schoolId);
      if (error) throw error;
      const rows: { status: SageSyncStatus }[] = data ?? [];
      return {
        pending:  rows.filter((r) => r.status === 'pending').length,
        sent_csv: rows.filter((r) => r.status === 'sent_csv').length,
        sent_api: rows.filter((r) => r.status === 'sent_api').length,
        failed:   rows.filter((r) => r.status === 'failed').length,
      };
    },
  });
}

export function useSageSyncQueue(schoolId: string, status?: SageSyncStatus | null) {
  return useQuery<SageSyncRow[]>({
    queryKey: ['sage-sync-queue', schoolId, status],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      let q = (supabase as any)
        .from('sage_sync_queue')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SageSyncRow[];
    },
  });
}

export function useFinanceExports(schoolId: string) {
  return useQuery<FinanceExport[]>({
    queryKey: ['finance-exports', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('finance_exports')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as FinanceExport[];
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useRetrySageSync(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await (supabase as any)
        .from('sage_sync_queue')
        .update({ status: 'pending', last_error: null, attempts: 0 })
        .eq('id', rowId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sage-sync-queue', schoolId] });
      qc.invalidateQueries({ queryKey: ['sage-sync-counts', schoolId] });
    },
  });
}

export function useRetryAllFailed(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('sage_sync_queue')
        .update({ status: 'pending', last_error: null, attempts: 0 })
        .eq('school_id', schoolId)
        .eq('status', 'failed');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sage-sync-queue', schoolId] });
      qc.invalidateQueries({ queryKey: ['sage-sync-counts', schoolId] });
    },
  });
}

export function useSkipSageRow(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await (supabase as any)
        .from('sage_sync_queue')
        .update({ status: 'skipped' })
        .eq('id', rowId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sage-sync-queue', schoolId] });
      qc.invalidateQueries({ queryKey: ['sage-sync-counts', schoolId] });
    },
  });
}

export function useGenerateCsvExport(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { staffId: string }): Promise<{ file_url: string; rows: number }> => {
      const session = await (supabase as any).auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/export-finance-csv`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ school_id: schoolId, created_by: params.staffId }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Export failed');
      return { file_url: json.file_url, rows: json.rows_included };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sage-sync-queue', schoolId] });
      qc.invalidateQueries({ queryKey: ['sage-sync-counts', schoolId] });
      qc.invalidateQueries({ queryKey: ['finance-exports', schoolId] });
    },
  });
}
