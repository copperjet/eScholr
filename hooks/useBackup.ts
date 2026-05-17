/**
 * Backup management hooks — destinations, logs, triggers.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export interface BackupDestination {
  id: string;
  school_id: string;
  provider: 'google_drive';
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  folder_id: string | null;
  folder_name: string | null;
  schedule: 'manual' | 'daily' | 'weekly' | 'monthly';
  last_backup_at: string | null;
  last_backup_status: 'success' | 'failed' | 'in_progress' | null;
  last_backup_error: string | null;
  last_backup_file_id: string | null;
  configured_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BackupLog {
  id: string;
  school_id: string;
  destination_id: string | null;
  triggered_by: string | null;
  status: 'started' | 'success' | 'failed';
  started_at: string;
  completed_at: string | null;
  file_size_bytes: number | null;
  file_id: string | null;
  file_name: string | null;
  error_message: string | null;
  tables_included: string[] | null;
  record_counts: Record<string, number> | null;
}

// ─── hooks ────────────────────────────────────────────────────────────────────

export function useBackupDestination(schoolId: string) {
  return useQuery<BackupDestination | null>({
    queryKey: ['backup-destination', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('backup_destinations')
        .select('*')
        .eq('school_id', schoolId)
        .eq('provider', 'google_drive')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return data as BackupDestination | null;
    },
  });
}

export function useBackupLogs(schoolId: string, limit: number = 10) {
  return useQuery<BackupLog[]>({
    queryKey: ['backup-logs', schoolId, limit],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('backup_logs')
        .select('*')
        .eq('school_id', schoolId)
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as BackupLog[];
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

export function useTriggerBackup(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      triggeredBy: string;
      tables?: string[];
    }) => {
      const { data, error } = await (supabase as any).functions.invoke('export-school-data', {
        body: {
          school_id: schoolId,
          triggered_by: params.triggeredBy,
          tables: params.tables,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Backup failed');
      return data as {
        success: boolean;
        filename: string;
        file_id: string;
        file_url: string;
        tables_exported: number;
        record_counts: Record<string, number>;
        total_records: number;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backup-logs'] });
      qc.invalidateQueries({ queryKey: ['backup-destination'] });
    },
  });
}

export function useSaveBackupDestination(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      folderId: string;
      folderName: string;
      accessToken: string;
      refreshToken: string;
      configuredBy: string;
    }) => {
      const db = supabase as any;
      const { error } = await db.from('backup_destinations').upsert({
        school_id: schoolId,
        provider: 'google_drive',
        folder_id: params.folderId,
        folder_name: params.folderName,
        access_token_encrypted: params.accessToken,
        refresh_token_encrypted: params.refreshToken,
        configured_by: params.configuredBy,
        schedule: 'manual',
      }, { onConflict: 'school_id,provider' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backup-destination'] });
    },
  });
}

export function useUpdateBackupSchedule(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (schedule: 'manual' | 'daily' | 'weekly' | 'monthly') => {
      const db = supabase as any;
      const { error } = await db
        .from('backup_destinations')
        .update({ schedule, updated_at: new Date().toISOString() })
        .eq('school_id', schoolId)
        .eq('provider', 'google_drive');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backup-destination'] });
    },
  });
}
