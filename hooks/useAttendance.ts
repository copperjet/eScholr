import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';

// ── Per-student attendance summary ─────────────────────────────

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  ap: number;
  sick: number;
  totalDays: number;
  percentage: number;
  dailyRecords: { date: string; status: string; correctionNote: string | null }[];
  belowThreshold: boolean;
  threshold: number;
}

export function useAttendanceForStudent(
  studentId: string | undefined,
  semesterId: string | undefined,
  schoolId: string,
) {
  return useQuery<AttendanceSummary>({
    queryKey: ['attendance-student', studentId, semesterId, schoolId],
    enabled: !!studentId && !!semesterId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const [summaryRes, dailyRes, thresholdRes] = await Promise.all([
        // Postgres RPC for accurate school-days calculation
        (supabase.rpc as any)('get_attendance_summary', {
          p_student_id:  studentId!,
          p_semester_id: semesterId!,
        }),
        supabase
          .from('attendance_records')
          .select('date, status, correction_note')
          .eq('student_id', studentId!)
          .eq('semester_id', semesterId!)
          .eq('school_id', schoolId)
          .order('date', { ascending: false }),
        supabase
          .from('school_configs')
          .select('config_value')
          .eq('school_id', schoolId)
          .eq('config_key', 'attendance_threshold_pct')
          .maybeSingle(),
      ]);

      const summary = (summaryRes.data as any)?.[0] ?? {
        present_count: 0,
        absent_count: 0,
        late_count: 0,
        ap_count: 0,
        sick_count: 0,
        total_days: 0,
        percentage: 0,
      };

      const configRow = thresholdRes.data as any;
      const threshold = parseInt(configRow?.config_value ?? '85', 10);
      const pct = parseFloat(String(summary.percentage ?? '0'));

      return {
        present:      Number(summary.present_count ?? 0),
        absent:       Number(summary.absent_count  ?? 0),
        late:         Number(summary.late_count    ?? 0),
        ap:           Number(summary.ap_count      ?? 0),
        sick:         Number(summary.sick_count    ?? 0),
        totalDays:    Number(summary.total_days    ?? 0),
        percentage:   pct,
        dailyRecords: ((dailyRes.data ?? []) as any[]).map((r: any) => ({
          date:           r.date,
          status:         r.status,
          correctionNote: r.correction_note ?? null,
        })),
        belowThreshold: pct < threshold,
        threshold,
      };
    },
  });
}

// ── Stream register for a given date ───────────────────────────

export interface StreamRegisterRecord {
  studentId: string;
  studentName: string;
  studentNumber: string;
  photoUrl: string | null;
  recordId: string | null;
  status: string | null;
  correctionNote: string | null;
  correctedAt: string | null;
  isLocked: boolean;
  submittedByName: string | null;
}

export function useStreamRegister(
  streamId: string | undefined,
  date: string,
  schoolId: string,
) {
  return useQuery<{ records: StreamRegisterRecord[]; submittedAt: string | null }>({
    queryKey: ['stream-register', streamId, date, schoolId],
    enabled: !!streamId && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const [studentsRes, attendanceRes] = await Promise.all([
        supabase
          .from('students')
          .select('id, full_name, student_number, photo_url')
          .eq('school_id', schoolId)
          .eq('stream_id', streamId!)
          .eq('status', 'active')
          .order('full_name'),
        supabase
          .from('attendance_records')
          .select(`
            id, student_id, status, register_locked,
            submitted_at, correction_note, corrected_at,
            staff:submitted_by ( full_name )
          `)
          .eq('school_id', schoolId)
          .eq('stream_id', streamId!)
          .eq('date', date),
      ]);

      const attMap: Record<string, any> = {};
      ((attendanceRes.data ?? []) as any[]).forEach((r: any) => { attMap[r.student_id] = r; });

      const submitterRecord = ((attendanceRes.data ?? []) as any[]).find((r: any) => r.submitted_at);
      const submittedAt: string | null = submitterRecord?.submitted_at ?? null;

      const records: StreamRegisterRecord[] = (studentsRes.data ?? []).map((s: any) => {
        const att = attMap[s.id];
        return {
          studentId:      s.id,
          studentName:    s.full_name,
          studentNumber:  s.student_number,
          photoUrl:       s.photo_url ?? null,
          recordId:       att?.id ?? null,
          status:         att?.status ?? null,
          correctionNote: att?.correction_note ?? null,
          correctedAt:    att?.corrected_at ?? null,
          isLocked:       att?.register_locked ?? false,
          submittedByName: att?.staff?.full_name ?? null,
        };
      });

      return { records, submittedAt };
    },
  });
}

// ── School-wide attendance overview for admin ──────────────────

export interface StreamOverview {
  streamId: string;
  streamName: string;
  gradeName: string;
  sectionName: string;
  totalStudents: number;
  submittedToday: boolean;
  presentCount: number;
  absentCount: number;
  presentPct: number;
  submittedByName: string | null;
}

export function useAttendanceOverview(schoolId: string, date: string) {
  return useQuery<StreamOverview[]>({
    queryKey: ['attendance-overview', schoolId, date],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      // Try single RPC first (eliminates 2000-student limit + reduces data transfer)
      const { data: rpc, error: rpcErr } = await (supabase as any)
        .rpc('get_attendance_overview', { p_school_id: schoolId, p_date: date });

      if (!rpcErr && Array.isArray(rpc)) {
        return rpc as StreamOverview[];
      }

      // Fallback: multi-query if RPC not deployed yet
      const [streamsRes, studentsRes, attendanceRes] = await Promise.all([
        supabase
          .from('streams')
          .select(`
            id, name,
            grades ( id, name, school_sections ( name ) )
          `)
          .eq('school_id', schoolId)
          .order('name'),
        supabase
          .from('students')
          .select('id, stream_id')
          .eq('school_id', schoolId)
          .eq('status', 'active')
          .limit(5000),
        supabase
          .from('attendance_records')
          .select('stream_id, status, register_locked, staff:submitted_by ( full_name )')
          .eq('school_id', schoolId)
          .eq('date', date),
      ]);

      const studentsByStream: Record<string, number> = {};
      (studentsRes.data ?? []).forEach((s: any) => {
        studentsByStream[s.stream_id] = (studentsByStream[s.stream_id] ?? 0) + 1;
      });

      const attByStream: Record<string, any[]> = {};
      (attendanceRes.data ?? []).forEach((r: any) => {
        if (!attByStream[r.stream_id]) attByStream[r.stream_id] = [];
        attByStream[r.stream_id].push(r);
      });

      return (streamsRes.data ?? []).map((stream: any) => {
        const records = attByStream[stream.id] ?? [];
        const submitted = records.some((r: any) => r.register_locked);
        const present = records.filter((r: any) => r.status === 'present').length;
        const absent  = records.filter((r: any) => r.status === 'absent').length;
        const total   = studentsByStream[stream.id] ?? 0;
        const submitter = records.find((r: any) => r.staff?.full_name);
        return {
          streamId:        stream.id,
          streamName:      stream.name,
          gradeName:       stream.grades?.name ?? '',
          sectionName:     stream.grades?.school_sections?.name ?? '',
          totalStudents:   total,
          submittedToday:  submitted,
          presentCount:    present,
          absentCount:     absent,
          presentPct:      total > 0 ? Math.round(((present) / total) * 100) : 0,
          submittedByName: submitter?.staff?.full_name ?? null,
        };
      });
    },
  });
}
