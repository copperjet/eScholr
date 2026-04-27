/**
 * Day Book hooks — create/edit entries, admin archive, parent inbox.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export type DayBookCategory =
  | 'behaviour_minor'
  | 'behaviour_serious'
  | 'academic_concern'
  | 'achievement'
  | 'attendance_note'
  | 'health'
  | 'communication'
  | 'other';

export interface DayBookEntry {
  id: string;
  school_id: string;
  student_id: string;
  staff_id: string;
  category: DayBookCategory;
  note: string;
  send_to_parent: boolean;
  entry_date: string;
  edit_window_closes_at: string;
  archived_at: string | null;
  created_at: string;
  student: {
    id: string;
    full_name: string;
    student_number: string;
    photo_url: string | null;
    grade_name: string;
    stream_name: string;
  };
  staff_name: string;
}

export const DAYBOOK_CATEGORY_META: Record<DayBookCategory, { label: string; icon: string; color: string }> = {
  behaviour_minor:   { label: 'Minor Behaviour',  icon: 'alert-outline',                         color: '#F59E0B' },
  behaviour_serious: { label: 'Serious Behaviour', icon: 'warning-outline',                       color: '#EF4444' },
  academic_concern:  { label: 'Academic Concern',  icon: 'school-outline',                        color: '#EF4444' },
  achievement:       { label: 'Achievement',        icon: 'star-outline',                          color: '#10B981' },
  attendance_note:   { label: 'Attendance Note',   icon: 'calendar-outline',                      color: '#3B82F6' },
  health:            { label: 'Health',             icon: 'medkit-outline',                        color: '#F59E0B' },
  communication:     { label: 'Communication',     icon: 'chatbox-outline',                       color: '#3B82F6' },
  other:             { label: 'Other',              icon: 'ellipsis-horizontal-circle-outline',   color: '#6B7280' },
};

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseEntry(r: any): DayBookEntry {
  return {
    id: r.id,
    school_id: r.school_id,
    student_id: r.student_id,
    staff_id: r.staff_id,
    category: r.category,
    note: r.note,
    send_to_parent: r.send_to_parent ?? false,
    entry_date: r.entry_date,
    edit_window_closes_at: r.edit_window_closes_at,
    archived_at: r.archived_at ?? null,
    created_at: r.created_at,
    student: {
      id: r.students?.id ?? '',
      full_name: r.students?.full_name ?? '—',
      student_number: r.students?.student_number ?? '',
      photo_url: r.students?.photo_url ?? null,
      grade_name: r.students?.streams?.grades?.name ?? '',
      stream_name: r.students?.streams?.name ?? '',
    },
    staff_name: r.staff?.full_name ?? '—',
  };
}

// ─── hooks ────────────────────────────────────────────────────────────────────

export function useHRTDayBook(staffId: string | null, schoolId: string, date?: string) {
  const entryDate = date ?? format(new Date(), 'yyyy-MM-dd');
  return useQuery<DayBookEntry[]>({
    queryKey: ['daybook-hrt', staffId, schoolId, entryDate],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('day_book_entries')
        .select(`
          id, school_id, student_id, staff_id, category, note, send_to_parent,
          entry_date, edit_window_closes_at, archived_at, created_at,
          students ( id, full_name, student_number, photo_url,
            streams ( name, grades ( name ) ) ),
          staff:staff_id ( full_name )
        `)
        .eq('school_id', schoolId)
        .eq('staff_id', staffId)
        .eq('entry_date', entryDate)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map(normaliseEntry);
    },
  });
}

export function useSTDayBook(staffId: string | null, schoolId: string, date?: string) {
  const entryDate = date ?? format(new Date(), 'yyyy-MM-dd');
  return useQuery<DayBookEntry[]>({
    queryKey: ['daybook-st', staffId, schoolId, entryDate],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('day_book_entries')
        .select(`
          id, school_id, student_id, staff_id, category, note, send_to_parent,
          entry_date, edit_window_closes_at, archived_at, created_at,
          students ( id, full_name, student_number, photo_url,
            streams ( name, grades ( name ) ) ),
          staff:staff_id ( full_name )
        `)
        .eq('school_id', schoolId)
        .eq('staff_id', staffId)
        .eq('entry_date', entryDate)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map(normaliseEntry);
    },
  });
}

export function useAdminDayBook(schoolId: string, params: { date?: string; search?: string; archived?: boolean }) {
  return useQuery<DayBookEntry[]>({
    queryKey: ['daybook-admin', schoolId, params],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      let q = db
        .from('day_book_entries')
        .select(`
          id, school_id, student_id, staff_id, category, note, send_to_parent,
          entry_date, edit_window_closes_at, archived_at, created_at,
          students ( id, full_name, student_number, photo_url,
            streams ( name, grades ( name ) ) ),
          staff:staff_id ( full_name )
        `)
        .eq('school_id', schoolId);

      if (params.date) q = q.eq('entry_date', params.date);
      if (params.archived) {
        q = q.not('archived_at', 'is', null);
      } else {
        q = q.is('archived_at', null);
      }

      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;

      let rows = ((data ?? []) as any[]).map(normaliseEntry);

      if (params.search) {
        const s = params.search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.student.full_name.toLowerCase().includes(s) ||
            r.note.toLowerCase().includes(s) ||
            r.staff_name.toLowerCase().includes(s),
        );
      }

      return rows;
    },
  });
}

export function useParentDayBookInbox(parentId: string | null, schoolId: string) {
  return useQuery<DayBookEntry[]>({
    queryKey: ['daybook-parent', parentId, schoolId],
    enabled: !!parentId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data: links } = await db
        .from('student_parent_links')
        .select('student_id')
        .eq('parent_id', parentId);
      const studentIds = ((links ?? []) as any[]).map((l: any) => l.student_id);
      if (!studentIds.length) return [];

      const { data, error } = await db
        .from('day_book_entries')
        .select(`
          id, school_id, student_id, staff_id, category, note, send_to_parent,
          entry_date, edit_window_closes_at, archived_at, created_at,
          students ( id, full_name, student_number, photo_url,
            streams ( name, grades ( name ) ) ),
          staff:staff_id ( full_name )
        `)
        .eq('school_id', schoolId)
        .eq('send_to_parent', true)
        .in('student_id', studentIds)
        .is('archived_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map(normaliseEntry);
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

export function useCreateDayBookEntry(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId: string;
      staffId: string;
      category: DayBookCategory;
      note: string;
      sendToParent: boolean;
    }) => {
      const db = supabase as any;
      const now = new Date();
      const editWindowClosesAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      const { error } = await db.from('day_book_entries').insert({
        school_id: schoolId,
        student_id: params.studentId,
        staff_id: params.staffId,
        category: params.category,
        note: params.note,
        send_to_parent: params.sendToParent,
        entry_date: format(now, 'yyyy-MM-dd'),
        edit_window_closes_at: editWindowClosesAt,
        created_at: now.toISOString(),
      });
      if (error) throw error;
    },
    // ── Optimistic: insert into HRT/ST list immediately ──
    onMutate: async (params) => {
      const now = new Date();
      const optimistic: DayBookEntry = {
        id: `optimistic-${now.getTime()}`,
        school_id: schoolId,
        student_id: params.studentId,
        staff_id: params.staffId,
        category: params.category,
        note: params.note,
        send_to_parent: params.sendToParent,
        entry_date: format(now, 'yyyy-MM-dd'),
        edit_window_closes_at: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
        archived_at: null,
        created_at: now.toISOString(),
        student: { id: params.studentId, full_name: '…', student_number: '', photo_url: null, grade_name: '', stream_name: '' },
        staff_name: '…',
      };
      const snapshots: Array<[readonly unknown[], any]> = [];
      ['daybook-hrt', 'daybook-st'].forEach((root) => {
        qc.getQueriesData({ queryKey: [root, params.staffId] }).forEach(([key, value]) => {
          if (!Array.isArray(value)) return;
          snapshots.push([key, value]);
          qc.setQueryData(key, [optimistic, ...(value as DayBookEntry[])]);
        });
      });
      return { snapshots };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshots?.forEach(([key, value]: any) => qc.setQueryData(key, value));
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['daybook-hrt'] });
      qc.invalidateQueries({ queryKey: ['daybook-st'] });
      qc.invalidateQueries({ queryKey: ['daybook-admin'] });
      if (vars?.sendToParent) {
        supabase.functions
          .invoke('send-daybook-notification', {
            body: { studentId: vars.studentId, schoolId, staffId: vars.staffId },
          })
          .then(() => {})
          .catch(() => {});
      }
    },
  });
}

export function useEditDayBookEntry(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      entryId: string;
      note: string;
      sendToParent: boolean;
    }) => {
      const db = supabase as any;
      const { error } = await db
        .from('day_book_entries')
        .update({ note: params.note, send_to_parent: params.sendToParent })
        .eq('id', params.entryId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['daybook-hrt'] });
      qc.invalidateQueries({ queryKey: ['daybook-st'] });
    },
  });
}

export function useArchiveDayBookEntry(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const db = supabase as any;
      const { error } = await db
        .from('day_book_entries')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', entryId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    // ── Optimistic: remove from active list instantly ──
    onMutate: async (entryId: string) => {
      const snapshots: Array<[readonly unknown[], any]> = [];
      ['daybook-hrt', 'daybook-st', 'daybook-admin'].forEach((root) => {
        qc.getQueriesData({ queryKey: [root] }).forEach(([key, value]) => {
          if (!Array.isArray(value)) return;
          snapshots.push([key, value]);
          qc.setQueryData(key, (value as DayBookEntry[]).filter((e) => e.id !== entryId));
        });
      });
      return { snapshots };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshots?.forEach(([key, value]: any) => qc.setQueryData(key, value));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['daybook-admin'] });
      qc.invalidateQueries({ queryKey: ['daybook-hrt'] });
      qc.invalidateQueries({ queryKey: ['daybook-st'] });
    },
  });
}
