/**
 * Student auth hooks — create student login credentials, reset passwords.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface StudentCredentialResult {
  success: boolean;
  auth_user_id?: string;
  email?: string;
  temp_password?: string;
  error?: string;
}

export function useCreateStudentAuth(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId: string;
      email: string;
      fullName: string;
    }): Promise<StudentCredentialResult> => {
      const { data, error } = await (supabase as any).functions.invoke('invite-user', {
        body: {
          student_id: params.studentId,
          email: params.email,
          full_name: params.fullName,
          school_id: schoolId,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: data?.success ?? false,
        auth_user_id: data?.auth_user_id,
        email: params.email,
        temp_password: data?.temp_password,
      };
    },
    onSuccess: (_, params) => {
      qc.invalidateQueries({ queryKey: ['student-detail', params.studentId] });
      qc.invalidateQueries({ queryKey: ['all-students', schoolId] });
    },
  });
}

export function useBulkCreateStudentAuth(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      students: Array<{
        studentId: string;
        email: string;
        fullName: string;
      }>;
    }): Promise<{ success: number; failed: number; results: StudentCredentialResult[] }> => {
      const results: StudentCredentialResult[] = [];
      let success = 0;
      let failed = 0;

      for (const student of params.students) {
        try {
          const { data, error } = await (supabase as any).functions.invoke('invite-user', {
            body: {
              student_id: student.studentId,
              email: student.email,
              full_name: student.fullName,
              school_id: schoolId,
            },
          });

          if (error || !data?.success) {
            failed++;
            results.push({
              success: false,
              email: student.email,
              error: error?.message || 'Failed to create account',
            });
          } else {
            success++;
            results.push({
              success: true,
              auth_user_id: data.auth_user_id,
              email: student.email,
            });
          }
        } catch (e: any) {
          failed++;
          results.push({
            success: false,
            email: student.email,
            error: e.message || 'Unknown error',
          });
        }
      }

      return { success, failed, results };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-students', schoolId] });
    },
  });
}

export function useGenerateStudentEmail() {
  return (studentName: string, studentNumber: string, schoolDomain: string): string => {
    const sanitized = studentName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '.');
    return `${sanitized}.${studentNumber}@${schoolDomain}`;
  };
}
