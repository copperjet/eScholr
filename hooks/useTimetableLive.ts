import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const db = supabase as any;

// ── Types ─────────────────────────────────────────────────────

export type AbsenceReason   = 'sick' | 'leave' | 'training' | 'personal' | 'other';
export type CoverStrategy   = 'auto_substitute' | 'study_hall' | 'cancel' | 'manual';
export type AbsenceStatus   = 'pending' | 'covered' | 'partial';
export type OverrideType    = 'substitute' | 'swap' | 'cancel' | 'room_change' | 'added_lesson';
export type OverrideSource  = 'absence_auto' | 'admin_manual' | 'swap_request';
export type OverrideStatus  = 'active' | 'reverted';
export type SwapRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface TeacherAbsence {
  id:             string;
  school_id:      string;
  staff_id:       string;
  start_date:     string;
  end_date:       string;
  reason:         AbsenceReason;
  cover_strategy: CoverStrategy;
  notes:          string | null;
  reported_by:    string | null;
  reported_at:    string;
  status:         AbsenceStatus;
  // joined
  staff?: { full_name: string };
}

export interface SlotOverride {
  id:                  string;
  school_id:           string;
  timetable_id:        string;
  base_slot_id:        string;
  override_date:       string;
  override_subject_id: string | null;
  override_staff_id:   string | null;
  override_room_id:    string | null;
  override_type:       OverrideType;
  source:              OverrideSource;
  linked_absence_id:   string | null;
  status:              OverrideStatus;
  created_by:          string | null;
  created_at:          string;
  notes:               string | null;
}

export interface SlotSwapRequest {
  id:                 string;
  school_id:          string;
  timetable_id:       string;
  requester_staff_id: string;
  target_staff_id:    string;
  requester_slot_id:  string;
  target_slot_id:     string;
  swap_date:          string;
  reason:             string | null;
  status:             SwapRequestStatus;
  responded_at:       string | null;
  decided_by:         string | null;
  created_at:         string;
}

export interface SubjectColor {
  id:         string;
  school_id:  string;
  subject_id: string;
  bg_color:   string;
  fg_color:   string;
  icon_name:  string | null;
}

export interface EffectiveSlot {
  slot_id:       string;
  day_of_week:   number;
  period_index:  number;
  subject_id:    string | null;
  staff_id:      string | null;
  room_id:       string | null;
  slot_type:     string;
  is_cancelled:  boolean;
  override_type: string | null;
  override_id:   string | null;
}

// ── Query key factory ─────────────────────────────────────────

const K = {
  absences:  (sid: string, range?: string) => ['live', sid, 'absences', range ?? 'all'] as const,
  overrides: (sid: string, date: string)   => ['live', sid, 'overrides', date] as const,
  swaps:     (staffId: string)             => ['live', 'swaps', staffId] as const,
  effective: (streamId: string, date: string) => ['live', 'effective', streamId, date] as const,
  colors:    (sid: string)                 => ['live', sid, 'colors'] as const,
};

// ── Absences ──────────────────────────────────────────────────

export function useTeacherAbsences(schoolId: string, dateRange?: { from: string; to: string }) {
  const rangeKey = dateRange ? `${dateRange.from}:${dateRange.to}` : undefined;
  return useQuery<TeacherAbsence[]>({
    queryKey: K.absences(schoolId, rangeKey),
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      let q = db
        .from('teacher_absences')
        .select('*, staff:staff_id(full_name)')
        .eq('school_id', schoolId)
        .order('start_date', { ascending: false });
      if (dateRange) {
        q = q.gte('start_date', dateRange.from).lte('end_date', dateRange.to);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TeacherAbsence[];
    },
  });
}

export function useReportAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<TeacherAbsence, 'id' | 'reported_at' | 'status'>) => {
      const { data, error } = await db
        .from('teacher_absences')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['live', vars.school_id, 'absences'] });
    },
  });
}

export function useUpdateAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, school_id, ...patch }: Partial<TeacherAbsence> & { id: string; school_id: string }) => {
      const { error } = await db
        .from('teacher_absences')
        .update(patch)
        .eq('id', id)
        .eq('school_id', school_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['live', vars.school_id, 'absences'] });
    },
  });
}

export function useDeleteAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, school_id }: { id: string; school_id: string }) => {
      const { error } = await db
        .from('teacher_absences')
        .delete()
        .eq('id', id)
        .eq('school_id', school_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['live', vars.school_id, 'absences'] });
    },
  });
}

// ── Auto-cover ────────────────────────────────────────────────

export function useAutoCover() {
  return useMutation({
    mutationFn: async ({ absence_id, school_id, dry_run = true }: {
      absence_id: string;
      school_id:  string;
      dry_run?:   boolean;
    }) => {
      const { data: session } = await db.auth.getSession();
      const token: string = session?.session?.access_token ?? '';
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/auto-cover-absences`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ absence_id, school_id, dry_run }),
        },
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? `HTTP ${res.status}`);
      return result as { proposed: any[]; unfilled: any[] };
    },
  });
}

// ── Slot overrides ────────────────────────────────────────────

export function useSlotOverrides(schoolId: string, date: string) {
  return useQuery<SlotOverride[]>({
    queryKey: K.overrides(schoolId, date),
    enabled: !!schoolId && !!date,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await db
        .from('slot_overrides')
        .select('*')
        .eq('school_id', schoolId)
        .eq('override_date', date)
        .eq('status', 'active');
      if (error) throw error;
      return (data ?? []) as SlotOverride[];
    },
  });
}

export function useApplyOverrides() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Omit<SlotOverride, 'id' | 'created_at'>[]) => {
      const { error } = await db
        .from('slot_overrides')
        .upsert(rows, { onConflict: 'base_slot_id,override_date', ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live'] });
    },
  });
}

export function useRevertOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, school_id }: { id: string; school_id: string }) => {
      const { error } = await db
        .from('slot_overrides')
        .update({ status: 'reverted' })
        .eq('id', id)
        .eq('school_id', school_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['live'] });
    },
  });
}

// ── Effective schedule ────────────────────────────────────────

export function useEffectiveTimetableForDate(schoolId: string, streamId: string | null, date: string) {
  return useQuery<EffectiveSlot[]>({
    queryKey: K.effective(streamId ?? '', date),
    enabled: !!schoolId && !!streamId && !!date,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await db.rpc('get_effective_timetable', {
        p_stream_id: streamId,
        p_date:      date,
      });
      if (error) throw error;
      return (data ?? []) as EffectiveSlot[];
    },
  });
}

// ── Slot swap requests ────────────────────────────────────────

export function useSlotSwapRequests(staffId: string) {
  return useQuery<SlotSwapRequest[]>({
    queryKey: K.swaps(staffId),
    enabled: !!staffId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await db
        .from('slot_swap_requests')
        .select('*')
        .or(`requester_staff_id.eq.${staffId},target_staff_id.eq.${staffId}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SlotSwapRequest[];
    },
  });
}

export function useRequestSlotSwap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<SlotSwapRequest, 'id' | 'status' | 'responded_at' | 'decided_by' | 'created_at'>) => {
      const { data, error } = await db
        .from('slot_swap_requests')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: K.swaps(vars.requester_staff_id) });
      qc.invalidateQueries({ queryKey: K.swaps(vars.target_staff_id) });
    },
  });
}

export function useRespondToSwap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, school_id, timetable_id, status, decided_by,
      requester_slot_id, target_slot_id, swap_date, requester_staff_id, target_staff_id,
    }: {
      id:                 string;
      school_id:          string;
      timetable_id:       string;
      status:             'approved' | 'rejected';
      decided_by:         string;
      requester_slot_id:  string;
      target_slot_id:     string;
      swap_date:          string;
      requester_staff_id: string;
      target_staff_id:    string;
    }) => {
      // Update request status
      const { error: updErr } = await db
        .from('slot_swap_requests')
        .update({ status, decided_by, responded_at: new Date().toISOString() })
        .eq('id', id);
      if (updErr) throw updErr;

      if (status === 'approved') {
        // Write mutual overrides
        const rows = [
          {
            school_id, timetable_id,
            base_slot_id:      requester_slot_id,
            override_date:     swap_date,
            override_staff_id: target_staff_id,
            override_type:     'swap',
            source:            'swap_request',
            created_by:        decided_by,
            status:            'active',
          },
          {
            school_id, timetable_id,
            base_slot_id:      target_slot_id,
            override_date:     swap_date,
            override_staff_id: requester_staff_id,
            override_type:     'swap',
            source:            'swap_request',
            created_by:        decided_by,
            status:            'active',
          },
        ];
        const { error: ovErr } = await db.from('slot_overrides').upsert(rows, {
          onConflict: 'base_slot_id,override_date',
        });
        if (ovErr) throw ovErr;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: K.swaps(vars.requester_staff_id) });
      qc.invalidateQueries({ queryKey: K.swaps(vars.target_staff_id) });
      qc.invalidateQueries({ queryKey: ['live'] });
    },
  });
}

// ── Subject colors ────────────────────────────────────────────

const DEFAULT_PALETTE = [
  { bg: '#EFF6FF', fg: '#1D4ED8' },
  { bg: '#F0FDF4', fg: '#15803D' },
  { bg: '#FEF3C7', fg: '#92400E' },
  { bg: '#FDF2F8', fg: '#9D174D' },
  { bg: '#F5F3FF', fg: '#6D28D9' },
  { bg: '#FFF7ED', fg: '#C2410C' },
  { bg: '#F0FDFA', fg: '#0F766E' },
  { bg: '#FFF1F2', fg: '#BE123C' },
  { bg: '#F7FEE7', fg: '#3F6212' },
  { bg: '#E0F2FE', fg: '#0369A1' },
  { bg: '#FCE7F3', fg: '#831843' },
  { bg: '#FEF9C3', fg: '#854D0E' },
];

export function useSubjectColors(schoolId: string) {
  return useQuery<SubjectColor[]>({
    queryKey: K.colors(schoolId),
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await db
        .from('subject_colors')
        .select('*')
        .eq('school_id', schoolId);
      if (error) throw error;
      return (data ?? []) as SubjectColor[];
    },
  });
}

export function useSubjectColorMap(schoolId: string): Record<string, { bg: string; fg: string }> {
  const { data } = useSubjectColors(schoolId);
  const map: Record<string, { bg: string; fg: string }> = {};
  for (const c of (data ?? [])) map[c.subject_id] = { bg: c.bg_color, fg: c.fg_color };
  return map;
}

export function useUpdateSubjectColor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<SubjectColor, 'id'>) => {
      const { error } = await db
        .from('subject_colors')
        .upsert(payload, { onConflict: 'school_id,subject_id' });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: K.colors(vars.school_id) });
    },
  });
}

export function useResetColorPalette() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ school_id, subjects }: { school_id: string; subjects: { id: string }[] }) => {
      const rows = subjects.map((s, i) => ({
        school_id,
        subject_id: s.id,
        bg_color:   DEFAULT_PALETTE[i % DEFAULT_PALETTE.length].bg,
        fg_color:   DEFAULT_PALETTE[i % DEFAULT_PALETTE.length].fg,
        icon_name:  null,
      }));
      const { error } = await db
        .from('subject_colors')
        .upsert(rows, { onConflict: 'school_id,subject_id' });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: K.colors(vars.school_id) });
    },
  });
}

export { DEFAULT_PALETTE };
