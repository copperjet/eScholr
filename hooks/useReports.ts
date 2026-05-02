/**
 * Report hooks — shared across HRT, Admin, Parent views.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export type ReportStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'finance_pending'
  | 'under_review'
  | 'released';

export interface ReportSummary {
  id: string;
  status: ReportStatus;
  hrt_comment: string | null;
  overall_percentage: number | null;
  class_position: number | null;
  pdf_url: string | null;
  released_at: string | null;
  updated_at: string;
  student: {
    id: string;
    full_name: string;
    student_number: string;
    photo_url: string | null;
  };
  semester: { id: string; name: string } | null;
}

export interface ReportVersion {
  id: string;
  version_number: number;
  pdf_url: string;
  verification_token: string;
  is_current: boolean;
  created_at: string;
}

export const STATUS_META: Record<ReportStatus, { label: string; preset: 'success' | 'warning' | 'info' | 'neutral' | 'error'; icon: string }> = {
  draft:            { label: 'Draft',            preset: 'neutral',  icon: 'document-outline' },
  pending_approval: { label: 'Pending Approval', preset: 'warning',  icon: 'time-outline' },
  approved:         { label: 'Approved',         preset: 'info',     icon: 'checkmark-done-outline' },
  finance_pending:  { label: 'Finance Pending',  preset: 'warning',  icon: 'card-outline' },
  under_review:     { label: 'Under Review',     preset: 'info',     icon: 'eye-outline' },
  released:         { label: 'Released',         preset: 'success',  icon: 'checkmark-circle-outline' },
};

// ─── HRT hooks ────────────────────────────────────────────────────────────────

export function useHRTStreamReports(staffId: string | null, schoolId: string, overrideSemesterId?: string | null) {
  return useQuery<{ reports: ReportSummary[]; semesterId: string | null; streamId: string | null; streamName: string }>({
    queryKey: ['hrt-reports', staffId, schoolId, overrideSemesterId ?? null],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 2,
    queryFn: async () => {
      const db = supabase as any;
      const { data: assignment } = await db
        .from('hrt_assignments')
        .select('stream_id, semester_id, streams ( name )')
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId)
        .limit(1)
        .single();
      if (!assignment) return { reports: [], semesterId: null, streamId: null, streamName: '' };

      const { stream_id, semester_id } = assignment;
      const activeSemId = overrideSemesterId ?? semester_id;
      const { data: students } = await db
        .from('students')
        .select('id')
        .eq('school_id', schoolId)
        .eq('stream_id', stream_id)
        .eq('status', 'active');
      const studentIds = (students ?? []).map((s: any) => s.id);
      if (studentIds.length === 0) {
        return { reports: [], semesterId: activeSemId, streamId: stream_id, streamName: assignment.streams?.name ?? '' };
      }

      const { data, error } = await db
        .from('reports')
        .select(`id, status, hrt_comment, overall_percentage, class_position, pdf_url, released_at, updated_at,
                 students ( id, full_name, student_number, photo_url ),
                 semesters ( id, name )`)
        .eq('school_id', schoolId)
        .eq('semester_id', activeSemId)
        .in('student_id', studentIds)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return {
        reports: ((data ?? []) as any[]).map(normaliseReport),
        semesterId: activeSemId,
        streamId: stream_id,
        streamName: assignment.streams?.name ?? '',
      };
    },
  });
}

export function useReportVersions(reportId: string | null) {
  return useQuery<ReportVersion[]>({
    queryKey: ['report-versions', reportId],
    enabled: !!reportId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('report_versions')
        .select('id, version_number, pdf_url, verification_token, is_current, created_at')
        .eq('report_id', reportId!)
        .order('version_number', { ascending: false });
      return (data ?? []) as ReportVersion[];
    },
  });
}

export function useMarksCompletionForStream(
  streamId: string | null,
  semesterId: string | null,
  schoolId: string,
) {
  return useQuery<{ subjectName: string; entered: number; total: number }[]>({
    queryKey: ['marks-completion-stream', streamId, semesterId, schoolId],
    enabled: !!streamId && !!semesterId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const [assignmentsRes, studentsRes, marksRes] = await Promise.all([
        db.from('subject_teacher_assignments')
          .select('subject_id, subjects ( name )')
          .eq('stream_id', streamId!)
          .eq('semester_id', semesterId!)
          .eq('school_id', schoolId),
        db.from('students')
          .select('id')
          .eq('stream_id', streamId!)
          .eq('school_id', schoolId)
          .eq('status', 'active'),
        db.from('marks')
          .select('student_id, subject_id')
          .eq('stream_id', streamId!)
          .eq('semester_id', semesterId!)
          .eq('school_id', schoolId)
          .not('value', 'is', null),
      ]);
      const total = (studentsRes.data ?? []).length;
      const assignments: any[] = assignmentsRes.data ?? [];
      const marksBySubject: Record<string, Set<string>> = {};
      ((marksRes.data ?? []) as any[]).forEach((m: any) => {
        if (!marksBySubject[m.subject_id]) marksBySubject[m.subject_id] = new Set();
        marksBySubject[m.subject_id].add(m.student_id);
      });
      return assignments.map((a: any) => ({
        subjectName: a.subjects?.name ?? a.subject_id,
        entered: marksBySubject[a.subject_id]?.size ?? 0,
        total,
      }));
    },
  });
}

// ─── Admin hooks ──────────────────────────────────────────────────────────────

export function useAdminReports(schoolId: string, status: ReportStatus | 'all', semesterId?: string | null) {
  return useQuery<ReportSummary[]>({
    queryKey: ['admin-reports', schoolId, status, semesterId ?? null],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      let q = db
        .from('reports')
        .select(`id, status, hrt_comment, overall_percentage, class_position, pdf_url, released_at, updated_at,
                 students ( id, full_name, student_number, photo_url ),
                 semesters ( id, name )`)
        .eq('school_id', schoolId)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (status !== 'all') q = q.eq('status', status);
      if (semesterId) q = q.eq('semester_id', semesterId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map(normaliseReport);
    },
  });
}

export function useAdminReportCounts(schoolId: string) {
  return useQuery<Record<ReportStatus, number>>({
    queryKey: ['admin-report-counts', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data } = await db
        .from('reports')
        .select('status')
        .eq('school_id', schoolId);
      const counts: Record<string, number> = {};
      ((data ?? []) as any[]).forEach((r: any) => {
        counts[r.status] = (counts[r.status] ?? 0) + 1;
      });
      return counts as Record<ReportStatus, number>;
    },
  });
}

// ─── Parent hooks ─────────────────────────────────────────────────────────────

export function useParentReports(parentId: string | null, schoolId: string) {
  return useQuery<ReportSummary[]>({
    queryKey: ['parent-reports', parentId, schoolId],
    enabled: !!parentId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data: links } = await db
        .from('student_parent_links')
        .select('student_id')
        .eq('parent_id', parentId!);
      const studentIds = (links ?? []).map((l: any) => l.student_id);
      if (studentIds.length === 0) return [];

      const { data, error } = await db
        .from('reports')
        .select(`id, status, hrt_comment, overall_percentage, class_position, pdf_url, released_at, updated_at,
                 students ( id, full_name, student_number, photo_url ),
                 semesters ( id, name )`)
        .eq('school_id', schoolId)
        .eq('status', 'released')
        .in('student_id', studentIds)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map(normaliseReport);
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

export function useGenerateReportPDF(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { report_id: string; is_preview?: boolean }) => {
      const { data, error } = await (supabase as any).functions.invoke('generate-report-pdf', {
        body: params,
      });
      if (error) throw error;
      return data as { pdf_url: string; verification_token: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hrt-reports'] }),
  });
}

export function useApproveReport(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    // ── Optimistic: HRT-side report list reflects new status instantly ──
    onMutate: async (params: { reportId: string; hrtComment: string; staffId: string }) => {
      const snapshots: Array<[readonly unknown[], any]> = [];
      const all = qc.getQueriesData({ queryKey: ['hrt-reports'] });
      all.forEach(([key, value]) => {
        if (!value) return;
        snapshots.push([key, value]);
        const v = value as any;
        if (Array.isArray(v?.reports)) {
          qc.setQueryData(key, {
            ...v,
            reports: v.reports.map((r: any) =>
              r.id === params.reportId
                ? { ...r, status: 'pending_approval', hrt_comment: params.hrtComment }
                : r,
            ),
          });
        }
      });
      return { snapshots };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshots?.forEach(([key, value]: any) => qc.setQueryData(key, value));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['hrt-reports'] });
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      qc.invalidateQueries({ queryKey: ['admin-report-counts'] });
    },
    mutationFn: async (params: {
      reportId: string;
      hrtComment: string;
      staffId: string;
    }) => {
      const db = supabase as any;

      // 1. Save comment + set status
      const { error: rErr } = await db
        .from('reports')
        .update({
          status: 'pending_approval',
          hrt_comment: params.hrtComment,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.reportId)
        .eq('school_id', schoolId);
      if (rErr) throw rErr;

      // 2. Get report for student_id + semester_id
      const { data: report } = await db
        .from('reports')
        .select('student_id, semester_id')
        .eq('id', params.reportId)
        .single();

      if (report) {
        // 3. Lock marks for this student + semester
        await db.from('marks')
          .update({ is_locked: true })
          .eq('student_id', report.student_id)
          .eq('semester_id', report.semester_id)
          .eq('school_id', schoolId);

        // 4. Lock CREED
        await db.from('character_records')
          .update({ is_locked: true })
          .eq('student_id', report.student_id)
          .eq('semester_id', report.semester_id)
          .eq('school_id', schoolId);
      }

      // 5. Generate PDF — fire-and-forget
      (supabase as any).functions.invoke('generate-report-pdf', {
        body: { report_id: params.reportId, is_preview: false },
      }).then(() => {}).catch(() => {});
    },
  });
}

export function useAdminApproveReport(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    // ── Optimistic: admin report list reflects "approved" instantly ──
    onMutate: async (params: { reportId: string; staffId: string }) => {
      const snapshots: Array<[readonly unknown[], any]> = [];
      const all = qc.getQueriesData({ queryKey: ['admin-reports'] });
      all.forEach(([key, value]) => {
        if (!value) return;
        snapshots.push([key, value]);
        if (Array.isArray(value)) {
          qc.setQueryData(
            key,
            (value as any[]).map((r) =>
              r.id === params.reportId ? { ...r, status: 'approved' } : r,
            ),
          );
        }
      });
      // Update admin-report-counts optimistically
      const countQueries = qc.getQueriesData({ queryKey: ['admin-report-counts'] });
      countQueries.forEach(([key, value]) => {
        if (!value || typeof value !== 'object') return;
        snapshots.push([key, value]);
        const v = value as Record<string, number>;
        qc.setQueryData(key, {
          ...v,
          pending_approval: Math.max(0, (v.pending_approval ?? 0) - 1),
          approved: (v.approved ?? 0) + 1,
        });
      });
      return { snapshots };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshots?.forEach(([key, value]: any) => qc.setQueryData(key, value));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      qc.invalidateQueries({ queryKey: ['admin-report-counts'] });
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    mutationFn: async (params: { reportId: string; staffId: string }) => {
      const db = supabase as any;
      const { error } = await db
        .from('reports')
        .update({
          status: 'approved',
          approved_by: params.staffId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.reportId)
        .eq('school_id', schoolId);
      if (error) throw error;

      // Fetch student_id for audit log
      const { data: rpt } = await db
        .from('reports')
        .select('student_id')
        .eq('id', params.reportId)
        .single();

      await db.from('audit_logs').insert({
        school_id: schoolId,
        event_type: 'report_approved',
        actor_id: params.staffId,
        student_id: rpt?.student_id ?? null,
        data: { report_id: params.reportId },
      });
    },
  });
}

export function useReleaseReports(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { student_ids: string[]; semester_id: string }) => {
      const { error } = await (supabase as any).functions.invoke('release-report', {
        body: { ...params, school_id: schoolId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      qc.invalidateQueries({ queryKey: ['admin-report-counts'] });
    },
  });
}

// ─── Report audit trail ───────────────────────────────────────────────────────

export interface ReportAuditEntry {
  id: string;
  event_type: string;
  actor_name: string | null;
  created_at: string;
  data: Record<string, any> | null;
}

export function useReportAuditLog(
  reportId: string | null,
  schoolId: string,
  studentId?: string | null,
) {
  return useQuery<ReportAuditEntry[]>({
    queryKey: ['report-audit', reportId],
    enabled: !!reportId && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      // Primary filter: student_id (indexed) + report event types
      // Secondary: filter client-side to only entries whose data.report_id matches
      let q = db
        .from('audit_logs')
        .select(`
          id, event_type, created_at, data,
          actor:actor_id ( full_name )
        `)
        .eq('school_id', schoolId)
        .in('event_type', ['report_approved', 'report_released', 'report_unlocked'])
        .order('created_at', { ascending: false })
        .limit(50);

      // Narrow by student if available (faster), else fall back to JSONB contains
      if (studentId) {
        q = q.eq('student_id', studentId);
      } else {
        q = q.contains('data', { report_id: reportId });
      }

      const { data, error } = await q;
      if (error) throw error;

      // Client-side filter: only entries explicitly linked to this report
      const rows = (data ?? []).filter((row: any) =>
        !studentId || row.data?.report_id === reportId || row.data?.report_id == null
      );

      return rows.map((row: any) => ({
        id: row.id,
        event_type: row.event_type,
        actor_name: row.actor?.full_name ?? null,
        created_at: row.created_at,
        data: row.data ?? null,
      }));
    },
  });
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function normaliseReport(r: any): ReportSummary {
  return {
    id: r.id,
    status: r.status,
    hrt_comment: r.hrt_comment ?? null,
    overall_percentage: r.overall_percentage ?? null,
    class_position: r.class_position ?? null,
    pdf_url: r.pdf_url ?? null,
    released_at: r.released_at ?? null,
    updated_at: r.updated_at,
    student: {
      id: r.students?.id ?? '',
      full_name: r.students?.full_name ?? '—',
      student_number: r.students?.student_number ?? '',
      photo_url: r.students?.photo_url ?? null,
    },
    semester: r.semesters ? { id: r.semesters.id, name: r.semesters.name } : null,
  };
}
