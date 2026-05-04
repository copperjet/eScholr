/**
 * Homework hooks - assignments, submissions, grading
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { triggerHomeworkAssignedNotification, triggerHomeworkGradedNotification } from '../lib/notifications';

// ─── types ────────────────────────────────────────────────────────────────────

export interface HomeworkAssignment {
  id: string;
  subject_id: string;
  stream_id: string;
  semester_id: string;
  assigned_by: string;
  title: string;
  description: string | null;
  due_date: string;
  attachment_url: string | null;
  max_score: number;
  is_active: boolean;
  created_at: string;
  subjects?: { name: string } | null;
  streams?: { name: string; grades?: { name: string } | null } | null;
  staff?: { full_name: string } | null;
}

export interface HomeworkSubmission {
  id: string;
  homework_id: string;
  student_id: string;
  submission_text: string | null;
  attachment_url: string | null;
  score: number | null;
  feedback: string | null;
  status: 'submitted' | 'graded' | 'late' | 'resubmitted';
  submitted_at: string;
  graded_by: string | null;
  graded_at: string | null;
  students?: { full_name: string; student_number: string } | null;
}

export interface StudentHomework {
  assignment: HomeworkAssignment;
  submission: HomeworkSubmission | null;
}

// ─── queries ─────────────────────────────────────────────────────────────────

export function useTeacherHomework(
  schoolId: string,
  staffId: string | null,
  semesterId: string | null
) {
  return useQuery<HomeworkAssignment[]>({
    queryKey: ['teacher-homework', schoolId, staffId, semesterId],
    enabled: !!schoolId && !!staffId && !!semesterId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('homework_assignments')
        .select(`
          id, subject_id, stream_id, semester_id, assigned_by, title, description,
          due_date, attachment_url, max_score, is_active, created_at,
          subjects (name),
          streams (name, grades (name))
        `)
        .eq('school_id', schoolId)
        .eq('assigned_by', staffId)
        .eq('semester_id', semesterId)
        .eq('is_active', true)
        .order('due_date', { ascending: false });

      if (error) throw error;
      return (data ?? []) as HomeworkAssignment[];
    },
  });
}

export function useStreamHomework(
  schoolId: string,
  streamId: string | null,
  semesterId: string | null
) {
  return useQuery<HomeworkAssignment[]>({
    queryKey: ['stream-homework', schoolId, streamId, semesterId],
    enabled: !!schoolId && !!streamId && !!semesterId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('homework_assignments')
        .select(`
          id, subject_id, stream_id, semester_id, assigned_by, title, description,
          due_date, attachment_url, max_score, is_active, created_at,
          subjects (name),
          streams (name, grades (name)),
          staff (full_name)
        `)
        .eq('school_id', schoolId)
        .eq('stream_id', streamId)
        .eq('semester_id', semesterId)
        .eq('is_active', true)
        .gte('due_date', new Date().toISOString().slice(0, 10))
        .order('due_date', { ascending: true });

      if (error) throw error;
      return (data ?? []) as HomeworkAssignment[];
    },
  });
}

export function useHomeworkSubmissions(
  schoolId: string,
  homeworkId: string | null
) {
  return useQuery<HomeworkSubmission[]>({
    queryKey: ['homework-submissions', schoolId, homeworkId],
    enabled: !!schoolId && !!homeworkId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('homework_submissions')
        .select(`
          id, homework_id, student_id, submission_text, attachment_url, score,
          feedback, status, submitted_at, graded_by, graded_at,
          students (full_name, student_number)
        `)
        .eq('homework_id', homeworkId)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as HomeworkSubmission[];
    },
  });
}

export function useStudentHomework(
  schoolId: string,
  studentId: string | null,
  semesterId: string | null
) {
  return useQuery<StudentHomework[]>({
    queryKey: ['student-homework', schoolId, studentId, semesterId],
    enabled: !!schoolId && !!studentId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data: streamData } = await db
        .from('students')
        .select('stream_id')
        .eq('id', studentId)
        .single();

      const streamId = streamData?.stream_id;
      if (!streamId) return [];

      let query = db
        .from('homework_assignments')
        .select(`
          id, subject_id, stream_id, semester_id, assigned_by, title, description,
          due_date, attachment_url, max_score, is_active, created_at,
          subjects (name),
          streams (name, grades (name)),
          staff (full_name)
        `)
        .eq('school_id', schoolId)
        .eq('stream_id', streamId)
        .eq('is_active', true);

      if (semesterId) {
        query = query.eq('semester_id', semesterId);
      }

      const { data, error } = await query.order('due_date', { ascending: false });

      if (error) throw error;

      const assignments = (data ?? []) as HomeworkAssignment[];
      const homeworkIds = assignments.map((a) => a.id);

      if (homeworkIds.length === 0) return [];

      const { data: submissionsData } = await db
        .from('homework_submissions')
        .select('*')
        .eq('student_id', studentId)
        .in('homework_id', homeworkIds);

      const submissionsMap = new Map<string, HomeworkSubmission>();
      (submissionsData ?? []).forEach((s: HomeworkSubmission) => {
        submissionsMap.set(s.homework_id, s);
      });

      return assignments.map((a) => ({
        assignment: a,
        submission: submissionsMap.get(a.id) ?? null,
      }));
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

export function useCreateHomework(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      subjectId: string;
      streamId: string;
      semesterId: string;
      assignedBy: string;
      title: string;
      description?: string;
      dueDate: string;
      attachmentUrl?: string;
      maxScore?: number;
    }) => {
      const db = supabase as any;
      const { data, error } = await db
        .from('homework_assignments')
        .insert({
          school_id: schoolId,
          subject_id: params.subjectId,
          stream_id: params.streamId,
          semester_id: params.semesterId,
          assigned_by: params.assignedBy,
          title: params.title.trim(),
          description: params.description?.trim() || null,
          due_date: params.dueDate,
          attachment_url: params.attachmentUrl || null,
          max_score: params.maxScore ?? 100,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as HomeworkAssignment;
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ['teacher-homework', schoolId] });
      qc.invalidateQueries({ queryKey: ['stream-homework', schoolId, vars.streamId] });
      
      // Trigger homework assignment notifications
      triggerHomeworkAssignedNotification({
        school_id: schoolId,
        homework_id: data.id,
        subject_name: '', // Will be fetched by the edge function
        title: vars.title,
        due_date: vars.dueDate,
        stream_id: vars.streamId,
      });
    },
  });
}

export function useSubmitHomework(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      homeworkId: string;
      studentId: string;
      submissionText?: string;
      attachmentUrl?: string;
    }) => {
      const db = supabase as any;

      // Check if already submitted
      const { data: existing } = await db
        .from('homework_submissions')
        .select('id')
        .eq('homework_id', params.homeworkId)
        .eq('student_id', params.studentId)
        .maybeSingle();

      const now = new Date().toISOString();

      if (existing) {
        // Update (resubmit)
        const { data, error } = await db
          .from('homework_submissions')
          .update({
            submission_text: params.submissionText?.trim() || null,
            attachment_url: params.attachmentUrl || null,
            status: 'resubmitted',
            submitted_at: now,
          })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        // Insert new
        const { data, error } = await db
          .from('homework_submissions')
          .insert({
            homework_id: params.homeworkId,
            student_id: params.studentId,
            submission_text: params.submissionText?.trim() || null,
            attachment_url: params.attachmentUrl || null,
            status: 'submitted',
            submitted_at: now,
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['student-homework', schoolId, vars.studentId] });
      qc.invalidateQueries({ queryKey: ['homework-submissions', schoolId, vars.homeworkId] });
    },
  });
}

export function useGradeSubmission(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      submissionId: string;
      homeworkId: string;
      score: number;
      feedback?: string;
      gradedBy: string;
    }) => {
      const db = supabase as any;
      const { data, error } = await db
        .from('homework_submissions')
        .update({
          score: params.score,
          feedback: params.feedback?.trim() || null,
          status: 'graded',
          graded_by: params.gradedBy,
          graded_at: new Date().toISOString(),
        })
        .eq('id', params.submissionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['homework-submissions', schoolId, vars.homeworkId] });
      
      // Get homework details for notification
      (async () => {
        try {
          const db = supabase as any;
          const { data: homework } = await db
            .from('homework_assignments')
            .select('title, max_score')
            .eq('id', vars.homeworkId)
            .single();
          
          if (homework) {
            // Get student ID from submission
            const { data: submission } = await db
              .from('homework_submissions')
              .select('student_id')
              .eq('id', vars.submissionId)
              .single();
            
            if (submission) {
              triggerHomeworkGradedNotification({
                school_id: schoolId,
                homework_id: vars.homeworkId,
                student_id: submission.student_id,
                score: vars.score,
                max_score: homework.max_score,
                title: homework.title,
              });
            }
          }
        } catch (error) {
          // Fire-and-forget — don't block UI on notification failure
        }
      })();
    },
  });
}

export function useDeleteHomework(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { homeworkId: string; streamId: string }) => {
      const db = supabase as any;
      const { error } = await db
        .from('homework_assignments')
        .update({ is_active: false })
        .eq('id', params.homeworkId);

      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['teacher-homework', schoolId] });
      qc.invalidateQueries({ queryKey: ['stream-homework', schoolId, vars.streamId] });
    },
  });
}
