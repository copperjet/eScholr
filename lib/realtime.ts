/**
 * Lightweight Supabase realtime helper for invalidating React Query
 * caches when Postgres rows change in tables relevant to a screen.
 *
 * Why: pull-based polling forces every concurrent user to hit
 * `staleTime` to see fresh data. Realtime push lets the app
 * react in <1s when another user mutates a row.
 *
 * Use the `useRealtimeInvalidate` React hook from a screen:
 *
 *   useRealtimeInvalidate('attendance_records', `school_id=eq.${schoolId}`,
 *     ['stream-register', streamId]);
 *
 * The subscription is set up on mount and torn down on unmount.
 * If realtime fails (no network, RLS denial), the app silently
 * falls back to React Query's normal staleTime refetch behaviour.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

type TableName =
  | 'attendance_records'
  | 'marks'
  | 'reports'
  | 'day_book_entries'
  | 'homework_assignments'
  | 'homework_submissions'
  | 'leave_requests'
  | 'messages'
  | 'notification_logs'
  | 'inquiries'
  | 'students';

export function useRealtimeInvalidate(
  table: TableName,
  filter: string | null,
  queryKey: readonly unknown[],
) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!table || !queryKey?.length) return;

    const channelName = `rt:${table}:${filter ?? 'all'}:${queryKey.join('-')}`;
    const ch = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
        () => {
          qc.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        // Ignore — channel may already be removed
      }
    };
    // We intentionally stringify the queryKey for stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter, JSON.stringify(queryKey)]);
}

/**
 * Direct cache patcher — for cases where you want to apply
 * the change to local cache without a refetch round-trip.
 *
 * Returns the unsubscribe function so you can call it manually
 * inside a useEffect cleanup.
 */
export function subscribeRow<T = any>(
  table: TableName,
  filter: string | null,
  onChange: (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: T; old: T }) => void,
): () => void {
  const channelName = `rt:${table}:${filter ?? 'all'}:${Date.now()}`;
  const ch = supabase
    .channel(channelName)
    .on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
      (payload: any) => onChange(payload as any),
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(ch);
    } catch {
      // ignore
    }
  };
}
