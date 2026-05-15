import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { triggerECAChoicesOpen, triggerECAPromotedFromWaitlist } from '../lib/notifications';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ECACategory {
  id: string;
  school_id: string;
  name: string;
  description: string | null;
  max_choices: number;
  allow_paid: boolean;
  created_at: string;
}

export interface ECAActivity {
  id: string;
  school_id: string;
  category_id: string;
  name: string;
  description: string | null;
  capacity: number;
  day_of_week: number;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  fee_amount: number;
  status: 'draft' | 'published' | 'closed' | 'archived';
  choice_window_start: string | null;
  choice_window_end: string | null;
  created_at: string;
}

export interface ECAActivityWithPatrons extends ECAActivity {
  eca_activity_patrons: Array<{ staff_id: string; is_primary: boolean; staff: { full_name: string } | null }>;
  eca_activity_eligible_streams: Array<{ stream_id: string }>;
}

export interface ECAChoice {
  id: string;
  student_id: string;
  category_id: string;
  choice_rank: number;
  activity_id: string;
  submitted_at: string;
}

export interface ECAAssignment {
  id: string;
  school_id: string;
  student_id: string;
  category_id: string;
  activity_id: string | null;
  assigned_from_choice_rank: number | null;
  status: 'assigned' | 'waitlisted' | 'withdrawn';
  assigned_at: string;
}

export interface ECAAttendance {
  id: string;
  activity_id: string;
  student_id: string;
  session_date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  note: string | null;
}

export interface ECAOverviewStats {
  total_activities: number;
  published_activities: number;
  total_choices: number;
  total_assigned: number;
  total_waitlisted: number;
  activities: Array<{
    id: string;
    name: string;
    category_id: string;
    capacity: number;
    assigned: number;
    waitlisted: number;
  }>;
}

// ── Query key factory ─────────────────────────────────────────────────────────

const K = {
  categories:          (sid: string) => ['eca', sid, 'categories'] as const,
  activities:          (sid: string, catId?: string) => ['eca', sid, 'activities', catId ?? null] as const,
  activityDetail:      (sid: string, actId: string) => ['eca', sid, 'activity', actId] as const,
  eligibleActivities:  (sid: string, stuId: string) => ['eca', sid, 'eligible', stuId] as const,
  studentChoices:      (sid: string, stuId: string, catId: string) => ['eca', sid, 'choices', stuId, catId] as const,
  assignmentsByActivity:(sid: string, actId: string) => ['eca', sid, 'roster', actId] as const,
  studentAssignments:  (sid: string, stuId: string) => ['eca', sid, 'assignments', stuId] as const,
  patronActivities:    (sid: string, staffId: string) => ['eca', sid, 'patron', staffId] as const,
  attendance:          (sid: string, actId: string, date: string) => ['eca', sid, 'attendance', actId, date] as const,
  overview:            (sid: string) => ['eca', sid, 'overview'] as const,
};

// ── Queries ───────────────────────────────────────────────────────────────────

export function useECACategories() {
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useQuery<ECACategory[]>({
    queryKey: K.categories(sid),
    enabled: !!sid,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('eca_categories')
        .select('id, school_id, name, description, max_choices, allow_paid, created_at')
        .eq('school_id', sid)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useECAActivities(categoryId?: string) {
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useQuery<ECAActivity[]>({
    queryKey: K.activities(sid, categoryId),
    enabled: !!sid,
    staleTime: 60_000,
    queryFn: async () => {
      let q = (supabase as any)
        .from('eca_activities')
        .select('id, school_id, category_id, name, description, capacity, day_of_week, start_time, end_time, location, fee_amount, status, choice_window_start, choice_window_end, created_at')
        .eq('school_id', sid)
        .order('name');
      if (categoryId) q = q.eq('category_id', categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useECAActivityDetail(activityId: string) {
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useQuery<ECAActivityWithPatrons>({
    queryKey: K.activityDetail(sid, activityId),
    enabled: !!sid && !!activityId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('eca_activities')
        .select(`
          *,
          eca_activity_patrons ( staff_id, is_primary, staff ( full_name ) ),
          eca_activity_eligible_streams ( stream_id )
        `)
        .eq('id', activityId)
        .eq('school_id', sid)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useECAEligibleActivities(studentId: string | undefined) {
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useQuery<ECAActivity[]>({
    queryKey: K.eligibleActivities(sid, studentId ?? ''),
    enabled: !!sid && !!studentId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: student, error: sErr } = await (supabase as any)
        .from('students')
        .select('stream_id')
        .eq('id', studentId!)
        .eq('school_id', sid)
        .single();
      if (sErr) throw sErr;
      const streamId = student?.stream_id;
      if (!streamId) return [];

      const { data: eligibleIds, error: eErr } = await (supabase as any)
        .from('eca_activity_eligible_streams')
        .select('activity_id')
        .eq('stream_id', streamId)
        .eq('school_id', sid);
      if (eErr) throw eErr;

      const ids = (eligibleIds ?? []).map((r: any) => r.activity_id) as string[];
      if (!ids.length) return [];

      const { data, error } = await (supabase as any)
        .from('eca_activities')
        .select('id, school_id, category_id, name, description, capacity, day_of_week, start_time, end_time, location, fee_amount, status, choice_window_start, choice_window_end, created_at')
        .in('id', ids)
        .eq('status', 'published')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useECAStudentChoices(studentId: string | undefined, categoryId: string | undefined) {
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useQuery<ECAChoice[]>({
    queryKey: K.studentChoices(sid, studentId ?? '', categoryId ?? ''),
    enabled: !!sid && !!studentId && !!categoryId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('eca_choices')
        .select('id, student_id, category_id, choice_rank, activity_id, submitted_at')
        .eq('student_id', studentId!)
        .eq('category_id', categoryId!)
        .eq('school_id', sid)
        .order('choice_rank');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useECAAssignmentsByActivity(activityId: string | undefined) {
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useQuery<Array<ECAAssignment & { students: { full_name: string; student_number: string; photo_url: string | null } | null }>>({
    queryKey: K.assignmentsByActivity(sid, activityId ?? ''),
    enabled: !!sid && !!activityId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('eca_assignments')
        .select('*, students ( full_name, student_number, photo_url )')
        .eq('activity_id', activityId!)
        .eq('school_id', sid)
        .neq('status', 'withdrawn')
        .order('assigned_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useECAStudentAssignments(studentId: string | undefined) {
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useQuery<Array<ECAAssignment & {
    eca_activities: (ECAActivity & { eca_activity_patrons: Array<{ is_primary: boolean; staff: { full_name: string } | null }> }) | null;
    eca_categories: ECACategory | null;
  }>>({
    queryKey: K.studentAssignments(sid, studentId ?? ''),
    enabled: !!sid && !!studentId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('eca_assignments')
        .select(`
          *,
          eca_activities ( *, eca_activity_patrons ( is_primary, staff ( full_name ) ) ),
          eca_categories ( * )
        `)
        .eq('student_id', studentId!)
        .eq('school_id', sid)
        .neq('status', 'withdrawn')
        .order('assigned_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useECAPatronActivities(staffId: string | undefined) {
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useQuery<ECAActivity[]>({
    queryKey: K.patronActivities(sid, staffId ?? ''),
    enabled: !!sid && !!staffId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: patronRows, error: pErr } = await (supabase as any)
        .from('eca_activity_patrons')
        .select('activity_id')
        .eq('staff_id', staffId!)
        .eq('school_id', sid);
      if (pErr) throw pErr;
      const ids = (patronRows ?? []).map((r: any) => r.activity_id) as string[];
      if (!ids.length) return [];
      const { data, error } = await (supabase as any)
        .from('eca_activities')
        .select('id, school_id, category_id, name, description, capacity, day_of_week, start_time, end_time, location, fee_amount, status, choice_window_start, choice_window_end, created_at')
        .in('id', ids)
        .order('day_of_week');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useECAAttendance(activityId: string | undefined, date: string) {
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useQuery<ECAAttendance[]>({
    queryKey: K.attendance(sid, activityId ?? '', date),
    enabled: !!sid && !!activityId && !!date,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('eca_attendance')
        .select('id, activity_id, student_id, session_date, status, note')
        .eq('activity_id', activityId!)
        .eq('session_date', date)
        .eq('school_id', sid);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useECAOverviewStats() {
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useQuery<ECAOverviewStats>({
    queryKey: K.overview(sid),
    enabled: !!sid,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('eca_overview_stats', { p_school_id: sid });
      if (error) throw error;
      return data as ECAOverviewStats;
    },
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useUpsertECACategory() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useMutation({
    mutationFn: async (payload: Partial<ECACategory> & { name: string }) => {
      const row = { ...payload, school_id: sid };
      const { data, error } = payload.id
        ? await (supabase as any).from('eca_categories').update(row).eq('id', payload.id).select().single()
        : await (supabase as any).from('eca_categories').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: K.categories(sid) }); },
  });
}

export function useUpsertECAActivity() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useMutation({
    mutationFn: async (payload: Partial<ECAActivity> & { name: string; category_id: string; capacity: number }) => {
      const row = { ...payload, school_id: sid };
      const { data, error } = payload.id
        ? await (supabase as any).from('eca_activities').update(row).eq('id', payload.id).select().single()
        : await (supabase as any).from('eca_activities').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: K.activities(sid) });
      if (vars.id) qc.invalidateQueries({ queryKey: K.activityDetail(sid, vars.id) });
    },
  });
}

export function useSetEligibleStreams() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useMutation({
    mutationFn: async ({ activityId, streamIds }: { activityId: string; streamIds: string[] }) => {
      await (supabase as any).from('eca_activity_eligible_streams').delete().eq('activity_id', activityId).eq('school_id', sid);
      if (streamIds.length) {
        const rows = streamIds.map((stream_id) => ({ activity_id: activityId, stream_id, school_id: sid }));
        const { error } = await (supabase as any).from('eca_activity_eligible_streams').insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: K.activityDetail(sid, vars.activityId) }); },
  });
}

export function useSetActivityPatrons() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useMutation({
    mutationFn: async ({ activityId, patrons }: { activityId: string; patrons: Array<{ staff_id: string; is_primary: boolean }> }) => {
      await (supabase as any).from('eca_activity_patrons').delete().eq('activity_id', activityId).eq('school_id', sid);
      if (patrons.length) {
        const rows = patrons.map((p) => ({ activity_id: activityId, staff_id: p.staff_id, is_primary: p.is_primary, school_id: sid }));
        const { error } = await (supabase as any).from('eca_activity_patrons').insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: K.activityDetail(sid, vars.activityId) }); },
  });
}

export function usePublishActivity() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useMutation({
    mutationFn: async ({ activityId, status }: { activityId: string; status: ECAActivity['status'] }) => {
      const { error } = await (supabase as any)
        .from('eca_activities')
        .update({ status })
        .eq('id', activityId)
        .eq('school_id', sid);
      if (error) throw error;
      // Fan out push to eligible parents when activity becomes published.
      if (status === 'published') {
        await triggerECAChoicesOpen({ school_id: sid, activity_id: activityId });
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: K.activities(sid) });
      qc.invalidateQueries({ queryKey: K.activityDetail(sid, vars.activityId) });
    },
  });
}

export function useSubmitECAChoices() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useMutation({
    mutationFn: async ({ studentId, categoryId, choices }: {
      studentId: string;
      categoryId: string;
      choices: Array<{ rank: number; activity_id: string }>;
    }) => {
      // Invoke edge function: validates, allocates via RPC, sends push notification.
      const { data, error } = await supabase.functions.invoke('eca-allocate', {
        body: { student_id: studentId, category_id: categoryId, choices },
      });
      if (error) throw error;
      const payload = data as { assignment?: ECAAssignment; error?: string };
      if (payload.error) throw new Error(payload.error);
      if (!payload.assignment) throw new Error('No assignment returned');
      return payload.assignment;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: K.studentChoices(sid, vars.studentId, vars.categoryId) });
      qc.invalidateQueries({ queryKey: K.studentAssignments(sid, vars.studentId) });
      qc.invalidateQueries({ queryKey: K.overview(sid) });
    },
  });
}

export function useMarkECAAttendance() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useMutation({
    mutationFn: async ({ activityId, date, records }: {
      activityId: string;
      date: string;
      records: Array<{ student_id: string; status: ECAAttendance['status']; note?: string; staff_id?: string }>;
    }) => {
      const rows = records.map((r) => ({
        school_id:          sid,
        activity_id:        activityId,
        student_id:         r.student_id,
        session_date:       date,
        status:             r.status,
        note:               r.note ?? null,
        marked_by_staff_id: r.staff_id ?? null,
        marked_at:          new Date().toISOString(),
      }));
      const { error } = await (supabase as any)
        .from('eca_attendance')
        .upsert(rows, { onConflict: 'activity_id,student_id,session_date' });
      if (error) throw error;
    },
    onSuccess: (_, vars) => { qc.invalidateQueries({ queryKey: K.attendance(sid, vars.activityId, vars.date) }); },
  });
}

export function useWithdrawAssignment() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { data, error } = await (supabase as any).rpc('eca_withdraw_assignment', { p_assignment_id: assignmentId });
      if (error) throw error;
      const result = (data ?? {}) as { school_id?: string; promoted_student_id?: string; promoted_activity_id?: string };
      // If a waitlisted student was auto-promoted, push them.
      if (result.promoted_student_id && result.promoted_activity_id && result.school_id) {
        await triggerECAPromotedFromWaitlist({
          school_id:   result.school_id,
          student_id:  result.promoted_student_id,
          activity_id: result.promoted_activity_id,
        });
      }
      return result;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: K.overview(sid) });
      if (result.promoted_activity_id) {
        qc.invalidateQueries({ queryKey: K.assignmentsByActivity(sid, result.promoted_activity_id) });
      }
      if (result.promoted_student_id) {
        qc.invalidateQueries({ queryKey: K.studentAssignments(sid, result.promoted_student_id) });
      }
    },
  });
}

export function useRunAllocation() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const { data, error } = await (supabase as any).rpc('eca_run_allocation', { p_category_id: categoryId });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (_, categoryId) => {
      qc.invalidateQueries({ queryKey: K.activities(sid, categoryId) });
      qc.invalidateQueries({ queryKey: K.activities(sid) });
      qc.invalidateQueries({ queryKey: K.overview(sid) });
    },
  });
}

export function useManualReassign() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const sid = user?.schoolId ?? '';
  return useMutation({
    mutationFn: async ({ studentId, categoryId, activityId }: { studentId: string; categoryId: string; activityId: string }) => {
      // Withdraw existing
      const { data: existing } = await (supabase as any)
        .from('eca_assignments')
        .select('id')
        .eq('student_id', studentId)
        .eq('category_id', categoryId)
        .neq('status', 'withdrawn')
        .maybeSingle();
      if (existing?.id) {
        await (supabase as any).from('eca_assignments').update({ status: 'withdrawn' }).eq('id', existing.id);
      }
      const { data, error } = await (supabase as any)
        .from('eca_assignments')
        .insert({ school_id: sid, student_id: studentId, category_id: categoryId, activity_id: activityId, status: 'assigned', assigned_from_choice_rank: null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: K.studentAssignments(sid, vars.studentId) });
      qc.invalidateQueries({ queryKey: K.assignmentsByActivity(sid, vars.activityId) });
      qc.invalidateQueries({ queryKey: K.overview(sid) });
    },
  });
}
