import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { computeTotal, getGradeLabel, isIGCSESection } from './useMarks';
import type { GradingScale } from './useMarks';

export interface StudentResult {
  studentId: string;
  studentName: string;
  studentNumber: string;
  fa1: number | null;
  fa2: number | null;
  summative: number | null;
  total: number | null;
  gradeLabel: string;
}

export interface GradeDistributionEntry {
  label: string;
  count: number;
  percent: number;
  color: string;
}

export interface AssessmentStats {
  label: string;
  avg: number | null;
  min: number | null;
  max: number | null;
}

export interface SubjectAnalysisData {
  subjectName: string;
  streamName: string;
  semesterName: string;
  sectionName: string;
  studentCount: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  passRate: number | null;
  classAverage: number | null;
  gradeDistribution: GradeDistributionEntry[];
  assessmentStats: AssessmentStats[];
  studentRankings: StudentResult[];
  deviations: StudentResult[];
}

const GRADE_COLORS: Record<string, string> = {
  'A*': '#10b981',
  'A':  '#34d399',
  'B':  '#6ee7b7',
  'C':  '#fbbf24',
  'D':  '#f59e0b',
  'E':  '#f97316',
  'F':  '#ef4444',
  'G':  '#dc2626',
  'U':  '#9ca3af',
};

function gradeColor(label: string): string {
  return GRADE_COLORS[label] ?? '#9ca3af';
}

export function useSubjectAnalysis(
  subjectId: string | null,
  streamId: string | null,
  semesterId: string | null,
  schoolId: string,
) {
  return useQuery<SubjectAnalysisData>({
    queryKey: ['subject-analysis', subjectId, streamId, semesterId, schoolId],
    enabled: !!subjectId && !!streamId && !!semesterId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;

      const [marksRes, studentsRes, scalesRes, metaRes] = await Promise.all([
        db.from('marks')
          .select('student_id, assessment_type, value')
          .eq('school_id', schoolId)
          .eq('subject_id', subjectId!)
          .eq('stream_id', streamId!)
          .eq('semester_id', semesterId!),
        db.from('students')
          .select('id, full_name, student_number')
          .eq('school_id', schoolId)
          .eq('stream_id', streamId!)
          .eq('status', 'active'),
        db.from('grading_scales')
          .select('grade_label, min_percentage, max_percentage')
          .eq('school_id', schoolId)
          .order('min_percentage', { ascending: false }),
        db.from('subject_teacher_assignments')
          .select(`
            subjects ( name ),
            streams ( name, grades ( name, school_sections ( name ) ) ),
            semesters ( name )
          `)
          .eq('school_id', schoolId)
          .eq('subject_id', subjectId!)
          .eq('stream_id', streamId!)
          .eq('semester_id', semesterId!)
          .limit(1)
          .single(),
      ]);

      const marks: any[] = marksRes.data ?? [];
      const students: any[] = studentsRes.data ?? [];
      const scales: GradingScale[] = scalesRes.data ?? [];
      const meta: any = metaRes.data ?? {};

      const sectionName: string = meta?.streams?.grades?.school_sections?.name ?? '';
      const isIGCSE = isIGCSESection(sectionName);

      // Build per-student mark map
      const markMap: Record<string, { fa1: number | null; fa2: number | null; summative: number | null }> = {};
      for (const m of marks) {
        if (!markMap[m.student_id]) markMap[m.student_id] = { fa1: null, fa2: null, summative: null };
        if (m.assessment_type === 'fa1') markMap[m.student_id].fa1 = m.value;
        else if (m.assessment_type === 'fa2') markMap[m.student_id].fa2 = m.value;
        else if (m.assessment_type === 'summative') markMap[m.student_id].summative = m.value;
      }

      const results: StudentResult[] = students.map((s: any) => {
        const m = markMap[s.id] ?? { fa1: null, fa2: null, summative: null };
        const total = computeTotal(m.fa1, m.fa2, m.summative, isIGCSE);
        return {
          studentId: s.id,
          studentName: s.full_name,
          studentNumber: s.student_number,
          fa1: m.fa1,
          fa2: m.fa2,
          summative: m.summative,
          total,
          gradeLabel: getGradeLabel(total, scales),
        };
      });

      const withTotal = results.filter(r => r.total !== null);
      const totals = withTotal.map(r => r.total as number);

      const avg = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 10) / 10 : null;
      const min = totals.length ? Math.min(...totals) : null;
      const max = totals.length ? Math.max(...totals) : null;
      const passRate = totals.length ? Math.round((totals.filter(t => t >= 50).length / totals.length) * 100) : null;

      // Grade distribution
      const gradeCounts: Record<string, number> = {};
      for (const r of withTotal) {
        gradeCounts[r.gradeLabel] = (gradeCounts[r.gradeLabel] ?? 0) + 1;
      }
      const gradeDistribution: GradeDistributionEntry[] = scales.map(s => ({
        label: s.grade_label,
        count: gradeCounts[s.grade_label] ?? 0,
        percent: withTotal.length ? Math.round(((gradeCounts[s.grade_label] ?? 0) / withTotal.length) * 100) : 0,
        color: gradeColor(s.grade_label),
      })).filter(g => g.count > 0);

      // Assessment stats
      const fa1Vals = marks.filter(m => m.assessment_type === 'fa1' && m.value !== null).map(m => m.value as number);
      const fa2Vals = marks.filter(m => m.assessment_type === 'fa2' && m.value !== null).map(m => m.value as number);
      const sumVals = marks.filter(m => m.assessment_type === 'summative' && m.value !== null).map(m => m.value as number);
      const avg_ = (vals: number[]) => vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;
      const assessmentStats: AssessmentStats[] = [
        { label: 'FA1', avg: avg_(fa1Vals), min: fa1Vals.length ? Math.min(...fa1Vals) : null, max: fa1Vals.length ? Math.max(...fa1Vals) : null },
        { label: 'FA2', avg: avg_(fa2Vals), min: fa2Vals.length ? Math.min(...fa2Vals) : null, max: fa2Vals.length ? Math.max(...fa2Vals) : null },
        { label: 'Summative', avg: avg_(sumVals), min: sumVals.length ? Math.min(...sumVals) : null, max: sumVals.length ? Math.max(...sumVals) : null },
      ];

      // Rankings: sorted descending by total
      const studentRankings = [...withTotal].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

      // Deviations: >15 points below class average
      const deviations = avg !== null ? withTotal.filter(r => (r.total ?? 0) < avg - 15) : [];

      return {
        subjectName: meta?.subjects?.name ?? '',
        streamName: meta?.streams?.name ?? '',
        semesterName: meta?.semesters?.name ?? '',
        sectionName,
        studentCount: students.length,
        avg,
        min,
        max,
        passRate,
        classAverage: avg,
        gradeDistribution,
        assessmentStats,
        studentRankings,
        deviations,
      };
    },
  });
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export interface SubjectSummary {
  subjectId: string;
  subjectName: string;
  department: string | null;
  streamId: string;
  streamName: string;
  gradeName: string;
  studentCount: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  passRate: number | null;
  gradeDistribution: GradeDistributionEntry[];
}

/** Compute per-subject summaries from raw marks + student list */
function buildSubjectSummaries(
  assignments: any[],
  allMarks: any[],
  studentsByStream: Record<string, any[]>,
  scales: GradingScale[],
  sectionName = '',
): SubjectSummary[] {
  const isIGCSE = isIGCSESection(sectionName);
  return assignments.map((a: any) => {
    const students = studentsByStream[a.stream_id] ?? [];
    const subjectMarks = allMarks.filter(
      m => m.subject_id === a.subject_id && m.stream_id === a.stream_id,
    );
    const markMap: Record<string, { fa1: number | null; fa2: number | null; summative: number | null }> = {};
    for (const m of subjectMarks) {
      if (!markMap[m.student_id]) markMap[m.student_id] = { fa1: null, fa2: null, summative: null };
      if (m.assessment_type === 'fa1') markMap[m.student_id].fa1 = m.value;
      else if (m.assessment_type === 'fa2') markMap[m.student_id].fa2 = m.value;
      else if (m.assessment_type === 'summative') markMap[m.student_id].summative = m.value;
    }
    const totals = students
      .map((s: any) => {
        const mk = markMap[s.id];
        if (!mk) return null;
        return computeTotal(mk.fa1, mk.fa2, mk.summative, isIGCSE);
      })
      .filter((t): t is number => t !== null);

    const avg = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length * 10) / 10 : null;
    const min = totals.length ? Math.min(...totals) : null;
    const max = totals.length ? Math.max(...totals) : null;
    const passRate = totals.length ? Math.round(totals.filter(t => t >= 50).length / totals.length * 100) : null;

    const gradeCounts: Record<string, number> = {};
    for (const t of totals) {
      const label = getGradeLabel(t, scales);
      gradeCounts[label] = (gradeCounts[label] ?? 0) + 1;
    }
    const gradeDistribution: GradeDistributionEntry[] = scales
      .map(s => ({
        label: s.grade_label,
        count: gradeCounts[s.grade_label] ?? 0,
        percent: totals.length ? Math.round(((gradeCounts[s.grade_label] ?? 0) / totals.length) * 100) : 0,
        color: gradeColor(s.grade_label),
      }))
      .filter(g => g.count > 0);

    return {
      subjectId: a.subject_id,
      subjectName: a.subjects?.name ?? '',
      department: a.subjects?.department ?? null,
      streamId: a.stream_id,
      streamName: a.streams?.name ?? '',
      gradeName: a.streams?.grades?.name ?? '',
      studentCount: students.length,
      avg,
      min,
      max,
      passRate,
      gradeDistribution,
    };
  });
}

// ─── HRT Class Analysis ───────────────────────────────────────────────────────

export interface HRTClassAnalysisData {
  streamName: string;
  gradeName: string;
  sectionName: string;
  semesterName: string;
  studentCount: number;
  overallAvg: number | null;
  overallPassRate: number | null;
  subjects: SubjectSummary[];
}

export function useHRTClassAnalysis(
  staffId: string | null,
  schoolId: string,
  overrideSemesterId?: string | null,
) {
  return useQuery<HRTClassAnalysisData>({
    queryKey: ['hrt-class-analysis', staffId, schoolId, overrideSemesterId ?? null],
    enabled: !!staffId && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      const { data: assignment } = await db
        .from('hrt_assignments')
        .select('stream_id, semester_id, streams ( name, grades ( name, school_sections ( name ) ) ), semesters ( name )')
        .eq('staff_id', staffId!)
        .eq('school_id', schoolId)
        .limit(1)
        .single();
      if (!assignment) return {
        streamName: '', gradeName: '', sectionName: '', semesterName: '',
        studentCount: 0, overallAvg: null, overallPassRate: null, subjects: [],
      };

      const semId = overrideSemesterId ?? assignment.semester_id;
      const streamId: string = assignment.stream_id;
      const sectionName: string = assignment.streams?.grades?.school_sections?.name ?? '';

      const [assignmentsRes, studentsRes, marksRes, scalesRes] = await Promise.all([
        db.from('subject_teacher_assignments')
          .select('subject_id, stream_id, subjects ( name, department ), streams ( name, grades ( name ) )')
          .eq('school_id', schoolId)
          .eq('stream_id', streamId)
          .eq('semester_id', semId),
        db.from('students')
          .select('id')
          .eq('school_id', schoolId)
          .eq('stream_id', streamId)
          .eq('status', 'active'),
        db.from('marks')
          .select('student_id, subject_id, stream_id, assessment_type, value')
          .eq('school_id', schoolId)
          .eq('stream_id', streamId)
          .eq('semester_id', semId),
        db.from('grading_scales')
          .select('grade_label, min_percentage, max_percentage')
          .eq('school_id', schoolId)
          .order('min_percentage', { ascending: false }),
      ]);

      const assignments: any[] = assignmentsRes.data ?? [];
      const students: any[] = studentsRes.data ?? [];
      const scales: GradingScale[] = scalesRes.data ?? [];
      const studentsByStream: Record<string, any[]> = { [streamId]: students };

      const subjects = buildSubjectSummaries(assignments, marksRes.data ?? [], studentsByStream, scales, sectionName);

      const allAvgs = subjects.map(s => s.avg).filter((v): v is number => v !== null);
      const overallAvg = allAvgs.length ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length * 10) / 10 : null;
      const allPassRates = subjects.map(s => s.passRate).filter((v): v is number => v !== null);
      const overallPassRate = allPassRates.length ? Math.round(allPassRates.reduce((a, b) => a + b, 0) / allPassRates.length) : null;

      return {
        streamName: assignment.streams?.name ?? '',
        gradeName: assignment.streams?.grades?.name ?? '',
        sectionName,
        semesterName: assignment.semesters?.name ?? '',
        studentCount: students.length,
        overallAvg,
        overallPassRate,
        subjects,
      };
    },
  });
}

// ─── HOD Department Analysis ──────────────────────────────────────────────────

export interface HODDeptAnalysisData {
  department: string;
  semesterName: string;
  totalSubjectAssignments: number;
  overallAvg: number | null;
  overallPassRate: number | null;
  subjects: SubjectSummary[];
}

export function useHODDeptAnalysis(
  department: string | null,
  schoolId: string,
  semesterId?: string | null,
) {
  return useQuery<HODDeptAnalysisData>({
    queryKey: ['hod-dept-analysis', department, schoolId, semesterId ?? null],
    enabled: !!department && !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;

      // Active or override semester
      const semRes = semesterId
        ? await db.from('semesters').select('id, name').eq('id', semesterId).single()
        : await db.from('semesters').select('id, name').eq('school_id', schoolId).eq('is_active', true).limit(1).single();
      const semId: string = semRes.data?.id ?? '';
      const semesterName: string = semRes.data?.name ?? '';
      if (!semId) return { department: department!, semesterName: '', totalSubjectAssignments: 0, overallAvg: null, overallPassRate: null, subjects: [] };

      const [assignmentsRes, scalesRes] = await Promise.all([
        db.from('subject_teacher_assignments')
          .select('subject_id, stream_id, subjects ( name, department ), streams ( name, grades ( name, school_sections ( name ) ) )')
          .eq('school_id', schoolId)
          .eq('semester_id', semId),
        db.from('grading_scales')
          .select('grade_label, min_percentage, max_percentage')
          .eq('school_id', schoolId)
          .order('min_percentage', { ascending: false }),
      ]);

      // Filter to dept subjects
      const all: any[] = assignmentsRes.data ?? [];
      const assignments = all.filter(a => a.subjects?.department === department);
      if (assignments.length === 0) return { department: department!, semesterName, totalSubjectAssignments: 0, overallAvg: null, overallPassRate: null, subjects: [] };

      const streamIds = [...new Set(assignments.map(a => a.stream_id as string))];

      const [studentsRes, marksRes] = await Promise.all([
        db.from('students').select('id, stream_id').eq('school_id', schoolId).eq('status', 'active').in('stream_id', streamIds),
        db.from('marks').select('student_id, subject_id, stream_id, assessment_type, value')
          .eq('school_id', schoolId).eq('semester_id', semId)
          .in('stream_id', streamIds),
      ]);

      const studentsByStream: Record<string, any[]> = {};
      for (const s of (studentsRes.data ?? [])) {
        if (!studentsByStream[s.stream_id]) studentsByStream[s.stream_id] = [];
        studentsByStream[s.stream_id].push(s);
      }

      const scales: GradingScale[] = scalesRes.data ?? [];
      const subjects = buildSubjectSummaries(assignments, marksRes.data ?? [], studentsByStream, scales);

      const allAvgs = subjects.map(s => s.avg).filter((v): v is number => v !== null);
      const overallAvg = allAvgs.length ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length * 10) / 10 : null;
      const allPassRates = subjects.map(s => s.passRate).filter((v): v is number => v !== null);
      const overallPassRate = allPassRates.length ? Math.round(allPassRates.reduce((a, b) => a + b, 0) / allPassRates.length) : null;

      return {
        department: department!,
        semesterName,
        totalSubjectAssignments: assignments.length,
        overallAvg,
        overallPassRate,
        subjects,
      };
    },
  });
}

// ─── Principal / Admin Section Analysis ───────────────────────────────────────

export interface SectionAnalysisData {
  semesterName: string;
  sections: {
    sectionId: string;
    sectionName: string;
    overallAvg: number | null;
    overallPassRate: number | null;
    subjects: SubjectSummary[];
  }[];
}

export function usePrincipalAnalysis(
  schoolId: string,
  semesterId?: string | null,
  filterSectionId?: string | null,
) {
  return useQuery<SectionAnalysisData>({
    queryKey: ['principal-analysis', schoolId, semesterId ?? null, filterSectionId ?? null],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;

      const semRes = semesterId
        ? await db.from('semesters').select('id, name').eq('id', semesterId).single()
        : await db.from('semesters').select('id, name').eq('school_id', schoolId).eq('is_active', true).limit(1).single();
      const semId: string = semRes.data?.id ?? '';
      const semesterName: string = semRes.data?.name ?? '';
      if (!semId) return { semesterName: '', sections: [] };

      let assignmentsQuery = db.from('subject_teacher_assignments')
        .select('subject_id, stream_id, subjects ( name, department ), streams ( name, grades ( name, school_sections ( id, name ) ) )')
        .eq('school_id', schoolId)
        .eq('semester_id', semId);

      const [assignmentsRes, scalesRes] = await Promise.all([
        assignmentsQuery,
        db.from('grading_scales').select('grade_label, min_percentage, max_percentage').eq('school_id', schoolId).order('min_percentage', { ascending: false }),
      ]);

      let assignments: any[] = assignmentsRes.data ?? [];
      if (filterSectionId) {
        assignments = assignments.filter(a => a.streams?.grades?.school_sections?.id === filterSectionId);
      }
      if (assignments.length === 0) return { semesterName, sections: [] };

      const streamIds = [...new Set(assignments.map(a => a.stream_id as string))];
      const [studentsRes, marksRes] = await Promise.all([
        db.from('students').select('id, stream_id').eq('school_id', schoolId).eq('status', 'active').in('stream_id', streamIds),
        db.from('marks').select('student_id, subject_id, stream_id, assessment_type, value').eq('school_id', schoolId).eq('semester_id', semId).in('stream_id', streamIds),
      ]);

      const studentsByStream: Record<string, any[]> = {};
      for (const s of (studentsRes.data ?? [])) {
        if (!studentsByStream[s.stream_id]) studentsByStream[s.stream_id] = [];
        studentsByStream[s.stream_id].push(s);
      }
      const scales: GradingScale[] = scalesRes.data ?? [];

      // Group by section
      const sectionMap: Record<string, { sectionId: string; sectionName: string; assignments: any[] }> = {};
      for (const a of assignments) {
        const sid: string = a.streams?.grades?.school_sections?.id ?? '__none';
        const sname: string = a.streams?.grades?.school_sections?.name ?? 'Unknown';
        if (!sectionMap[sid]) sectionMap[sid] = { sectionId: sid, sectionName: sname, assignments: [] };
        sectionMap[sid].assignments.push(a);
      }

      const sections = Object.values(sectionMap).map(sec => {
        const subjects = buildSubjectSummaries(sec.assignments, marksRes.data ?? [], studentsByStream, scales, sec.sectionName);
        const allAvgs = subjects.map(s => s.avg).filter((v): v is number => v !== null);
        const overallAvg = allAvgs.length ? Math.round(allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length * 10) / 10 : null;
        const allPassRates = subjects.map(s => s.passRate).filter((v): v is number => v !== null);
        const overallPassRate = allPassRates.length ? Math.round(allPassRates.reduce((a, b) => a + b, 0) / allPassRates.length) : null;
        return { sectionId: sec.sectionId, sectionName: sec.sectionName, overallAvg, overallPassRate, subjects };
      });

      return { semesterName, sections };
    },
  });
}
