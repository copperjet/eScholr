import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const db = supabase as any;

// ── Types ────────────────────────────────────────────────────

export type RoomType = 'classroom' | 'lab' | 'computer_lab' | 'hall' | 'library' | 'sports' | 'other';

export interface Room {
  id: string;
  school_id: string;
  code: string;
  name: string;
  room_type: RoomType;
  capacity: number | null;
  building: string | null;
  floor: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Period {
  id: string;
  school_id: string;
  period_index: number;
  name: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
  is_assembly: boolean;
}

export interface TimetableSettings {
  id: string;
  school_id: string;
  working_days: number[];
  periods_per_day: number;
  max_periods_per_teacher_day: number;
  max_consecutive_per_teacher: number;
  min_gap_same_subject_days: number;
  allow_double_periods: boolean;
  assembly_period_index: number | null;
  lunch_period_index: number | null;
  solver_preset: 'fast' | 'balanced' | 'optimal';
  updated_at: string;
}

// ── Query key factory ────────────────────────────────────────

const K = {
  rooms:    (sid: string) => ['ttb', sid, 'rooms'] as const,
  periods:  (sid: string) => ['ttb', sid, 'periods'] as const,
  settings: (sid: string) => ['ttb', sid, 'settings'] as const,
};

// ── Rooms ────────────────────────────────────────────────────

export function useRooms(schoolId: string) {
  return useQuery<Room[]>({
    queryKey: K.rooms(schoolId),
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await db
        .from('rooms')
        .select('id, school_id, code, name, room_type, capacity, building, floor, is_active, created_at')
        .eq('school_id', schoolId)
        .order('code');
      if (error) throw error;
      return (data ?? []) as Room[];
    },
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<Room, 'id' | 'created_at'>) => {
      const { data, error } = await db
        .from('rooms')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: K.rooms(vars.school_id) });
    },
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, school_id, ...patch }: Partial<Room> & { id: string; school_id: string }) => {
      const { error } = await db
        .from('rooms')
        .update(patch)
        .eq('id', id)
        .eq('school_id', school_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: K.rooms(vars.school_id) });
    },
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, school_id }: { id: string; school_id: string }) => {
      const { error } = await db
        .from('rooms')
        .delete()
        .eq('id', id)
        .eq('school_id', school_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: K.rooms(vars.school_id) });
    },
  });
}

// ── Periods ──────────────────────────────────────────────────

export function usePeriods(schoolId: string) {
  return useQuery<Period[]>({
    queryKey: K.periods(schoolId),
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await db
        .from('timetable_periods')
        .select('id, school_id, period_index, name, start_time, end_time, is_break, is_assembly')
        .eq('school_id', schoolId)
        .order('period_index');
      if (error) throw error;
      return (data ?? []) as Period[];
    },
  });
}

export function useSavePeriods(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periods: Omit<Period, 'id' | 'school_id'>[]) => {
      // Upsert all rows (match on school_id + period_index)
      const rows = periods.map((p) => ({ ...p, school_id: schoolId }));
      const { error: upsertErr } = await db
        .from('timetable_periods')
        .upsert(rows, { onConflict: 'school_id,period_index' });
      if (upsertErr) throw upsertErr;

      // Delete any periods with indexes not in the new set
      if (periods.length > 0) {
        const keepIndexes = periods.map((p) => p.period_index);
        const { error: delErr } = await db
          .from('timetable_periods')
          .delete()
          .eq('school_id', schoolId)
          .not('period_index', 'in', `(${keepIndexes.join(',')})`);
        if (delErr) throw delErr;
      } else {
        const { error: delErr } = await db
          .from('timetable_periods')
          .delete()
          .eq('school_id', schoolId);
        if (delErr) throw delErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: K.periods(schoolId) });
    },
  });
}

// ── Settings ─────────────────────────────────────────────────

export function useTimetableSettings(schoolId: string) {
  return useQuery<TimetableSettings | null>({
    queryKey: K.settings(schoolId),
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await db
        .from('timetable_settings')
        .select('*')
        .eq('school_id', schoolId)
        .maybeSingle();
      if (error) throw error;
      return data as TimetableSettings | null;
    },
  });
}

export function useUpdateTimetableSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<TimetableSettings> & { school_id: string }) => {
      const { school_id, id, ...patch } = payload as any;
      const row = { ...patch, school_id, updated_at: new Date().toISOString() };
      const { error } = await db
        .from('timetable_settings')
        .upsert(row, { onConflict: 'school_id' });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: K.settings(vars.school_id) });
    },
  });
}

// ── M2: Subject Period Requirements ─────────────────────────

export interface SubjectRequirement {
  id: string;
  school_id: string;
  grade_id: string | null;
  stream_id: string | null;
  subject_id: string;
  periods_per_week: number;
  double_period_allowed: boolean;
  min_double_periods: number;
  max_double_periods: number;
  preferred_room_type: RoomType | null;
  requires_specific_room_id: string | null;
  priority: number;
}

export function useSubjectRequirements(schoolId: string, gradeId?: string | null, streamId?: string | null) {
  return useQuery<SubjectRequirement[]>({
    queryKey: ['ttb', schoolId, 'reqs', gradeId ?? null, streamId ?? null],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      let q = db
        .from('subject_period_requirements')
        .select('*')
        .eq('school_id', schoolId);
      if (streamId) q = q.eq('stream_id', streamId);
      else if (gradeId) q = q.eq('grade_id', gradeId).is('stream_id', null);
      const { data, error } = await q.order('subject_id');
      if (error) throw error;
      return (data ?? []) as SubjectRequirement[];
    },
  });
}

export function useUpsertSubjectRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<SubjectRequirement, 'id'>) => {
      const conflictCol = payload.stream_id
        ? 'school_id,stream_id,subject_id'
        : 'school_id,grade_id,subject_id';
      const { error } = await db
        .from('subject_period_requirements')
        .upsert(payload, { onConflict: conflictCol });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ttb', vars.school_id, 'reqs'] });
    },
  });
}

export function useDeleteSubjectRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, school_id }: { id: string; school_id: string }) => {
      const { error } = await db
        .from('subject_period_requirements')
        .delete()
        .eq('id', id)
        .eq('school_id', school_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ttb', vars.school_id, 'reqs'] });
    },
  });
}

// ── M2: Teacher Availability ─────────────────────────────────

export type AvailabilityStatus = 'unavailable' | 'preferred' | 'neutral';

export interface TeacherAvailability {
  id: string;
  school_id: string;
  staff_id: string;
  day_of_week: number;
  period_index: number;
  status: AvailabilityStatus;
  reason: string | null;
}

export function useTeacherAvailability(schoolId: string, staffId?: string) {
  return useQuery<TeacherAvailability[]>({
    queryKey: ['ttb', schoolId, 'avail', staffId ?? 'all'],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      let q = db
        .from('teacher_availability')
        .select('*')
        .eq('school_id', schoolId);
      if (staffId) q = q.eq('staff_id', staffId);
      const { data, error } = await q.order('staff_id').order('day_of_week').order('period_index');
      if (error) throw error;
      return (data ?? []) as TeacherAvailability[];
    },
  });
}

export function useSetTeacherAvailability(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, slots }: {
      staffId: string;
      slots: Array<{ day_of_week: number; period_index: number; status: AvailabilityStatus; reason?: string }>;
    }) => {
      // Replace all availability rows for this teacher
      const { error: delErr } = await db
        .from('teacher_availability')
        .delete()
        .eq('school_id', schoolId)
        .eq('staff_id', staffId);
      if (delErr) throw delErr;

      const nonNeutral = slots.filter((s) => s.status !== 'neutral');
      if (nonNeutral.length > 0) {
        const rows = nonNeutral.map((s) => ({
          ...s,
          school_id: schoolId,
          staff_id: staffId,
        }));
        const { error } = await db.from('teacher_availability').insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ttb', schoolId, 'avail'] });
    },
  });
}

// ── M2: Teacher Constraints ──────────────────────────────────

export interface TeacherConstraints {
  id: string;
  school_id: string;
  staff_id: string;
  max_periods_per_day: number | null;
  max_periods_per_week: number | null;
  max_consecutive: number | null;
  no_first_period: boolean;
  no_last_period: boolean;
  preferred_days: number[] | null;
  min_off_days_per_week: number;
  notes: string | null;
}

export function useTeacherConstraints(schoolId: string, staffId?: string) {
  return useQuery<TeacherConstraints[]>({
    queryKey: ['ttb', schoolId, 'constraints', staffId ?? 'all'],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      let q = db
        .from('teacher_constraints')
        .select('*')
        .eq('school_id', schoolId);
      if (staffId) q = q.eq('staff_id', staffId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TeacherConstraints[];
    },
  });
}

export function useUpsertTeacherConstraints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<TeacherConstraints, 'id'>) => {
      const { error } = await db
        .from('teacher_constraints')
        .upsert(payload, { onConflict: 'staff_id' });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ttb', vars.school_id, 'constraints'] });
    },
  });
}

// ── M3: Timetables ───────────────────────────────────────────

export type TimetableStatus = 'draft' | 'generating' | 'generated' | 'published' | 'archived';

export interface Timetable {
  id: string;
  school_id: string;
  academic_year_id: string | null;
  semester_id: string | null;
  name: string;
  status: TimetableStatus;
  generated_at: string | null;
  generator_version: string | null;
  generation_run_id: string | null;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useTimetables(schoolId: string, semesterId?: string | null) {
  return useQuery<Timetable[]>({
    queryKey: ['ttb', schoolId, 'list', semesterId ?? 'all'],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      let q = db
        .from('timetables')
        .select('*')
        .eq('school_id', schoolId)
        .neq('status', 'archived');
      if (semesterId) q = q.eq('semester_id', semesterId);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Timetable[];
    },
  });
}

export function useCreateTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Pick<Timetable, 'school_id' | 'name' | 'academic_year_id' | 'semester_id' | 'created_by'>) => {
      const { data, error } = await db
        .from('timetables')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ttb', vars.school_id, 'list'] });
    },
  });
}

export function usePublishTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, school_id, published_by }: { id: string; school_id: string; published_by: string }) => {
      // Archive any existing published for same semester
      const { data: curr } = await db
        .from('timetables')
        .select('semester_id')
        .eq('id', id)
        .single();
      if (curr?.semester_id) {
        await db
          .from('timetables')
          .update({ status: 'archived' })
          .eq('school_id', school_id)
          .eq('semester_id', curr.semester_id)
          .eq('status', 'published');
      }
      const { error } = await db
        .from('timetables')
        .update({ status: 'published', published_at: new Date().toISOString(), published_by })
        .eq('id', id)
        .eq('school_id', school_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ttb', vars.school_id, 'list'] });
      qc.invalidateQueries({ queryKey: ['ttb', vars.school_id, 'timetable', vars.id] });
    },
  });
}

export function useArchiveTimetable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, school_id }: { id: string; school_id: string }) => {
      const { error } = await db
        .from('timetables')
        .update({ status: 'archived' })
        .eq('id', id)
        .eq('school_id', school_id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['ttb', vars.school_id, 'list'] });
    },
  });
}

// ── Clash error types ────────────────────────────────────────

export class TeacherClashError extends Error {
  constructor(msg = 'Teacher already assigned at this day/period') {
    super(msg);
    this.name = 'TeacherClashError';
  }
}

export class RoomClashError extends Error {
  constructor(msg = 'Room already booked at this day/period') {
    super(msg);
    this.name = 'RoomClashError';
  }
}

// ── M3: Timetable Slots ──────────────────────────────────────

export type SlotType = 'lesson' | 'break' | 'free' | 'assembly' | 'study_hall';

export interface TimetableSlot {
  id: string;
  school_id: string;
  timetable_id: string;
  stream_id: string;
  day_of_week: number;
  period_id: string | null;
  period_index: number;
  subject_id: string | null;
  staff_id: string | null;
  room_id: string | null;
  slot_type: SlotType;
  is_double: boolean;
  pair_slot_id: string | null;
  is_locked: boolean;
  notes: string | null;
  updated_at: string;
}

export function useTimetable(id: string, schoolId: string) {
  return useQuery<TimetableSlot[]>({
    queryKey: ['ttb', schoolId, 'timetable', id],
    enabled: !!id && !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await db
        .from('timetable_slots')
        .select('*')
        .eq('timetable_id', id)
        .eq('school_id', schoolId)
        .order('stream_id')
        .order('day_of_week')
        .order('period_index');
      if (error) throw error;
      return (data ?? []) as TimetableSlot[];
    },
  });
}

export function useUpdateSlot(timetableId: string, schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<TimetableSlot> & { id: string }) => {
      const { id, ...rest } = patch;

      // ── Preflight clash check (R0.6) ──────────────────────
      // Only needed when changing teacher or room on a lesson slot.
      if (rest.staff_id !== undefined || rest.room_id !== undefined) {
        // Fetch current slot position so we know which day/period to check.
        const { data: current } = await db
          .from('timetable_slots')
          .select('day_of_week, period_index, staff_id, room_id, slot_type')
          .eq('id', id)
          .single();

        if (current) {
          const effectiveSlotType = (rest.slot_type ?? current.slot_type) as string;
          if (effectiveSlotType === 'lesson') {
            const newStaffId = rest.staff_id !== undefined ? rest.staff_id : current.staff_id;
            const newRoomId  = rest.room_id  !== undefined ? rest.room_id  : current.room_id;

            const { data: siblings } = await db
              .from('timetable_slots')
              .select('id, staff_id, room_id')
              .eq('timetable_id', timetableId)
              .eq('school_id', schoolId)
              .eq('day_of_week', current.day_of_week)
              .eq('period_index', current.period_index)
              .eq('slot_type', 'lesson')
              .neq('id', id);

            for (const s of (siblings ?? [])) {
              if (newStaffId && s.staff_id === newStaffId) {
                throw new TeacherClashError(
                  `Teacher already assigned to another class at ${current.day_of_week}/${current.period_index}`,
                );
              }
              if (newRoomId && s.room_id === newRoomId) {
                throw new RoomClashError(
                  `Room already booked at ${current.day_of_week}/${current.period_index}`,
                );
              }
            }
          }
        }
      }

      const { error } = await db
        .from('timetable_slots')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('timetable_id', timetableId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ttb', schoolId, 'timetable', timetableId] });
      qc.invalidateQueries({ queryKey: ['ttb', schoolId, 'conflicts', timetableId] });
    },
  });
}

// ── M3: Conflicts ────────────────────────────────────────────

export type ConflictSeverity = 'error' | 'warning' | 'info';
export type ConflictKind =
  | 'teacher_clash' | 'room_clash' | 'period_count_short' | 'period_count_over'
  | 'unavailable_teacher' | 'room_capacity' | 'consecutive_exceeded' | 'missing_room';

export interface TimetableConflict {
  id: string;
  timetable_id: string;
  slot_id: string | null;
  conflicting_slot_id: string | null;
  severity: ConflictSeverity;
  kind: ConflictKind;
  description: string;
  resolved: boolean;
  created_at: string;
}

export function useTimetableConflicts(timetableId: string, schoolId: string) {
  return useQuery<TimetableConflict[]>({
    queryKey: ['ttb', schoolId, 'conflicts', timetableId],
    enabled: !!timetableId && !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const { data, error } = await db
        .from('timetable_conflicts')
        .select('*')
        .eq('timetable_id', timetableId)
        .eq('resolved', false)
        .order('severity')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as TimetableConflict[];
    },
  });
}

// ── M3: Teacher / Room / Stream views ────────────────────────

export function useTeacherTimetableView(timetableId: string, schoolId: string, staffId: string) {
  return useQuery<TimetableSlot[]>({
    queryKey: ['ttb', schoolId, 'timetable', timetableId, 'teacher', staffId],
    enabled: !!timetableId && !!staffId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await db
        .from('timetable_slots')
        .select('*')
        .eq('timetable_id', timetableId)
        .eq('school_id', schoolId)
        .eq('staff_id', staffId)
        .order('day_of_week')
        .order('period_index');
      if (error) throw error;
      return (data ?? []) as TimetableSlot[];
    },
  });
}

export function useRoomTimetableView(timetableId: string, schoolId: string, roomId: string) {
  return useQuery<TimetableSlot[]>({
    queryKey: ['ttb', schoolId, 'timetable', timetableId, 'room', roomId],
    enabled: !!timetableId && !!roomId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await db
        .from('timetable_slots')
        .select('*')
        .eq('timetable_id', timetableId)
        .eq('school_id', schoolId)
        .eq('room_id', roomId)
        .order('day_of_week')
        .order('period_index');
      if (error) throw error;
      return (data ?? []) as TimetableSlot[];
    },
  });
}

export function usePublishedTimetableForStream(schoolId: string, streamId: string, semesterId?: string | null) {
  return useQuery<TimetableSlot[]>({
    queryKey: ['ttb', schoolId, 'published', streamId, semesterId ?? null],
    enabled: !!schoolId && !!streamId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      let q = db
        .from('timetables')
        .select('id')
        .eq('school_id', schoolId)
        .eq('status', 'published');
      if (semesterId) q = q.eq('semester_id', semesterId);
      const { data: tt } = await q.limit(1).single();
      if (!tt) return [];
      const { data, error } = await db
        .from('timetable_slots')
        .select('*')
        .eq('timetable_id', tt.id)
        .eq('school_id', schoolId)
        .eq('stream_id', streamId)
        .order('day_of_week')
        .order('period_index');
      if (error) throw error;
      return (data ?? []) as TimetableSlot[];
    },
  });
}

// ── M6: Read-only views (student / teacher published) ────────

export function useTeacherPublishedSchedule(schoolId: string, staffId: string | null, semesterId?: string | null) {
  return useQuery<TimetableSlot[]>({
    queryKey: ['ttb', schoolId, 'published-teacher', staffId, semesterId ?? null],
    enabled: !!schoolId && !!staffId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      if (!staffId) return [];
      let q = db
        .from('timetables')
        .select('id')
        .eq('school_id', schoolId)
        .eq('status', 'published');
      if (semesterId) q = q.eq('semester_id', semesterId);
      const { data: tt } = await q.limit(1).single();
      if (!tt) return [];
      const { data, error } = await db
        .from('timetable_slots')
        .select('*')
        .eq('timetable_id', tt.id)
        .eq('school_id', schoolId)
        .eq('staff_id', staffId)
        .order('day_of_week')
        .order('period_index');
      if (error) throw error;
      return (data ?? []) as TimetableSlot[];
    },
  });
}

export function useStudentStream(schoolId: string, studentId: string | null) {
  return useQuery<string | null>({
    queryKey: ['ttb', schoolId, 'student-stream', studentId],
    enabled: !!schoolId && !!studentId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      if (!studentId) return null;
      const { data } = await db
        .from('students')
        .select('stream_id')
        .eq('id', studentId)
        .eq('school_id', schoolId)
        .maybeSingle();
      return (data as any)?.stream_id ?? null;
    },
  });
}

// ── M3: Generation run ───────────────────────────────────────

export interface GenerationRun {
  id: string;
  school_id: string;
  timetable_id: string | null;
  triggered_by: string | null;
  algorithm: string;
  seed: number | null;
  input_snapshot: Record<string, any> | null;
  started_at: string;
  ended_at: string | null;
  runtime_ms: number | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timeout' | 'partial';
  iterations: number | null;
  conflicts_found: number | null;
  cost_score: number | null;
  error_message: string | null;
  log_tail: string | null;
}

export function useGenerationRun(runId: string | null, schoolId: string) {
  return useQuery<GenerationRun | null>({
    queryKey: ['ttb', schoolId, 'run', runId],
    enabled: !!runId && !!schoolId,
    refetchInterval: (data: any) => {
      const status = (data as GenerationRun | null)?.status;
      if (!status || status === 'queued' || status === 'running') return 5000;
      return false;
    },
    queryFn: async () => {
      const { data, error } = await db
        .from('timetable_generation_runs')
        .select('*')
        .eq('id', runId)
        .eq('school_id', schoolId)
        .maybeSingle();
      if (error) throw error;
      return data as GenerationRun | null;
    },
  });
}

// ── M7: Auto-resuming generation hook ────────────────────────

export interface GeneratePayload {
  school_id: string;
  timetable_id: string;
  academic_year_id: string | null;
  semester_id: string | null;
  timetable_name: string;
}

export interface ChunkProgress {
  processed: number;
  total: number;
  chunks: number;
}

export function useGenerateTimetable() {
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress | null>(null);
  const [currentRunId, setCurrentRunId]   = useState<string | null>(null);
  const [isRunning, setIsRunning]         = useState(false);

  const generate = useCallback(async (payload: GeneratePayload): Promise<{ run_id: string }> => {
    setIsRunning(true);
    setChunkProgress(null);
    setCurrentRunId(null);
    try {
      const { data: session } = await (supabase as any).auth.getSession();
      const token: string = session?.session?.access_token ?? '';
      const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-timetable`;

      let runId: string | null = null;
      let chunks = 0;

      while (true) {
        const body = runId ? { ...payload, resume: true, run_id: runId } : payload;
        const res  = await fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify(body),
        });
        const result = await res.json();
        if (!res.ok) throw new Error((result as any).error ?? `HTTP ${res.status}`);

        runId = (result as any).run_id as string;
        chunks += 1;
        setCurrentRunId(runId);

        if ((result as any).status === 'chunked') {
          const p = (result as any).progress as { processed: number; total: number };
          setChunkProgress({ processed: p.processed, total: p.total, chunks });
          continue;
        }

        // Final chunk — run is now finalized
        setChunkProgress(null);
        return { run_id: runId };
      }
    } finally {
      setIsRunning(false);
    }
  }, []);

  return { generate, chunkProgress, currentRunId, isRunning };
}
