/**
 * Realtime cache sync for front desk data.
 * Subscribes to students, inquiries, and admissions_applications.
 * On any change, invalidates both canonical and legacy query keys.
 * Mount once in layout — cleanup on unmount.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useRealtimeStudents(schoolId: string) {
  const qc = useQueryClient();
  const instanceId = useRef(Math.random().toString(36).slice(2, 8)).current;

  useEffect(() => {
    if (!schoolId) return;
    const channel = (supabase as any)
      .channel(`students-rt-${schoolId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'students', filter: `school_id=eq.${schoolId}` },
        () => {
          // Canonical key — Phase A+
          qc.invalidateQueries({ queryKey: ['students'] });
          // Legacy keys — keep in sync until removed
          qc.invalidateQueries({ queryKey: ['all-students'] });
          qc.invalidateQueries({ queryKey: ['hrt-students'] });
          qc.invalidateQueries({ queryKey: ['st-students'] });
          qc.invalidateQueries({ queryKey: ['student-detail'] });
        }
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [schoolId, qc, instanceId]);
}

export function useRealtimeInquiries(schoolId: string) {
  const qc = useQueryClient();
  const instanceId = useRef(Math.random().toString(36).slice(2, 8)).current;

  useEffect(() => {
    if (!schoolId) return;
    const channel = (supabase as any)
      .channel(`inquiries-rt-${schoolId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inquiries', filter: `school_id=eq.${schoolId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['inquiries'] });
          qc.invalidateQueries({ queryKey: ['frontdesk', 'dashboard'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inquiry_notes' },
        () => {
          qc.invalidateQueries({ queryKey: ['inquiries'] });
          qc.invalidateQueries({ queryKey: ['inquiry-notes'] });
        }
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [schoolId, qc, instanceId]);
}

export function useRealtimeAdmissions(schoolId: string) {
  const qc = useQueryClient();
  const instanceId = useRef(Math.random().toString(36).slice(2, 8)).current;

  useEffect(() => {
    if (!schoolId) return;
    const channel = (supabase as any)
      .channel(`admissions-rt-${schoolId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*', schema: 'public',
          table: 'admissions_applications',
          filter: `school_id=eq.${schoolId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['admissions'] });
          qc.invalidateQueries({ queryKey: ['admissions-applications'] });
          qc.invalidateQueries({ queryKey: ['frontdesk', 'dashboard'] });
        }
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [schoolId, qc, instanceId]);
}

/**
 * Composite hook — mounts all three channels.
 * Use in FD layout; admin layout needs only useRealtimeStudents.
 */
export function useFrontDeskRealtime(schoolId: string) {
  useRealtimeStudents(schoolId);
  useRealtimeInquiries(schoolId);
  useRealtimeAdmissions(schoolId);
}
