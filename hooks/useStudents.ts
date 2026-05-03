/**
 * Student hooks — CRUD, photo upload, bulk CSV import, global search.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export interface Student {
  id: string;
  full_name: string;
  student_number: string;
  date_of_birth: string | null;
  gender: 'male' | 'female' | 'other' | null;
  photo_url: string | null;
  stream_id: string;
  stream_name: string;
  grade_name: string;
  section_name: string;
  is_active: boolean;
  enrolled_at: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

export interface StudentImportRow {
  full_name: string;
  student_number: string;
  date_of_birth?: string;
  gender?: string;
  stream_name?: string;
  errors: string[];
  valid: boolean;
}

export interface GlobalSearchResult {
  type: 'student' | 'staff' | 'report';
  id: string;
  title: string;
  subtitle: string;
  photo_url: string | null;
  route: string;
  params?: Record<string, string>;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseStudent(r: any): Student {
  return {
    id: r.id,
    full_name: r.full_name,
    student_number: r.student_number ?? '',
    date_of_birth: r.date_of_birth ?? null,
    gender: r.gender ?? null,
    photo_url: r.photo_url ?? null,
    stream_id: r.stream_id ?? '',
    stream_name: r.streams?.name ?? '',
    grade_name: r.streams?.grades?.name ?? '',
    section_name: r.streams?.grades?.school_sections?.name ?? '',
    is_active: (r.status ?? 'active') === 'active',
    enrolled_at: r.enrollment_date ?? null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
  };
}

// ─── queries ─────────────────────────────────────────────────────────────────

export function useAllStudents(schoolId: string, params?: {
  streamId?: string | null;
  gradeId?: string | null;
  activeOnly?: boolean;
}) {
  return useQuery<Student[]>({
    queryKey: ['all-students', schoolId, params],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      let q = db
        .from('students')
        .select(`
          id, full_name, student_number, date_of_birth, gender, photo_url,
          stream_id, status, enrollment_date,
          streams ( name, grades ( name, school_sections ( name ) ) )
        `)
        .eq('school_id', schoolId)
        .order('full_name');

      if (params?.streamId) q = q.eq('stream_id', params.streamId);
      if (params?.activeOnly !== false) q = q.eq('status', 'active');

      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[]).map(normaliseStudent);
    },
  });
}

export function useStudentDetail(studentId: string | null, schoolId: string) {
  return useQuery<Student | null>({
    queryKey: ['student-detail', studentId, schoolId],
    enabled: !!studentId && !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('students')
        .select(`
          id, full_name, student_number, date_of_birth, gender, photo_url,
          stream_id, status, enrolled_at, emergency_contact_name, emergency_contact_phone,
          streams ( name, grades ( name, school_sections ( name ) ) )
        `)
        .eq('id', studentId)
        .eq('school_id', schoolId)
        .single();
      if (error) throw error;
      if (!data) return null;
      return normaliseStudent(data);
    },
  });
}

export function useGlobalSearch(schoolId: string, query: string) {
  return useQuery<GlobalSearchResult[]>({
    queryKey: ['global-search', schoolId, query],
    enabled: !!schoolId && query.trim().length >= 2,
    staleTime: 1000 * 10,
    queryFn: async () => {
      const db = supabase as any;
      const q = query.trim().toLowerCase();

      const [studRes, staffRes] = await Promise.all([
        db
          .from('students')
          .select('id, full_name, student_number, photo_url, streams(name, grades(name))')
          .eq('school_id', schoolId)
          .eq('status', 'active')
          .or(`full_name.ilike.%${q}%,student_number.ilike.%${q}%`)
          .limit(10),
        db
          .from('staff')
          .select('id, full_name, email, photo_url')
          .eq('school_id', schoolId)
          .eq('status', 'active')
          .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
          .limit(5),
      ]);

      const results: GlobalSearchResult[] = [];

      ((studRes.data ?? []) as any[]).forEach((s: any) => {
        results.push({
          type: 'student',
          id: s.id,
          title: s.full_name,
          subtitle: `${s.student_number}${s.streams?.grades?.name ? ' · ' + s.streams.grades.name : ''}${s.streams?.name ? ' ' + s.streams.name : ''}`,
          photo_url: s.photo_url ?? null,
          route: '/(app)/student/[id]',
          params: { id: s.id },
        });
      });

      ((staffRes.data ?? []) as any[]).forEach((s: any) => {
        results.push({
          type: 'staff',
          id: s.id,
          title: s.full_name,
          subtitle: s.email ?? '—',
          photo_url: s.photo_url ?? null,
          route: '/(app)/(admin)/staff',
          params: {},
        });
      });

      return results;
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

export function useCreateStudent(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      fullName: string;
      studentNumber: string;
      streamId: string;
      dateOfBirth?: string;
      gender?: 'male' | 'female' | 'other';
      emergencyContactName?: string;
      emergencyContactPhone?: string;
    }) => {
      const db = supabase as any;
      const { data, error } = await db
        .from('students')
        .insert({
          school_id: schoolId,
          full_name: params.fullName.trim(),
          student_number: params.studentNumber.trim(),
          stream_id: params.streamId,
          date_of_birth: params.dateOfBirth || null,
          gender: params.gender || null,
          status: 'active',
          enrollment_date: new Date().toISOString().slice(0, 10),
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-students', schoolId] });
      qc.invalidateQueries({ queryKey: ['students', schoolId] });
      qc.invalidateQueries({ queryKey: ['global-search', schoolId] });
    },
  });
}

export function useUpdateStudent(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentId: string;
      fullName?: string;
      studentNumber?: string;
      streamId?: string;
      dateOfBirth?: string | null;
      gender?: 'male' | 'female' | 'other' | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      isActive?: boolean;
    }) => {
      const db = supabase as any;
      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (params.fullName !== undefined) updates.full_name = params.fullName.trim();
      if (params.studentNumber !== undefined) updates.student_number = params.studentNumber.trim();
      if (params.streamId !== undefined) updates.stream_id = params.streamId;
      if (params.dateOfBirth !== undefined) updates.date_of_birth = params.dateOfBirth;
      if (params.gender !== undefined) updates.gender = params.gender;
      if (params.emergencyContactName !== undefined) updates.emergency_contact_name = params.emergencyContactName;
      if (params.emergencyContactPhone !== undefined) updates.emergency_contact_phone = params.emergencyContactPhone;
      if (params.isActive !== undefined) updates.status = params.isActive ? 'active' : 'inactive';

      const { error } = await db
        .from('students')
        .update(updates)
        .eq('id', params.studentId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['all-students', schoolId] });
      qc.invalidateQueries({ queryKey: ['students', schoolId] });
      qc.invalidateQueries({ queryKey: ['student-detail', vars.studentId] });
      qc.invalidateQueries({ queryKey: ['student-profile', vars.studentId] });
      qc.invalidateQueries({ queryKey: ['global-search', schoolId] });
    },
  });
}

export function useUploadStudentPhoto(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { studentId: string; base64: string; mimeType: string }) => {
      const db = supabase as any;
      const ext = params.mimeType === 'image/png' ? 'png' : 'jpg';
      const path = `${schoolId}/students/${params.studentId}.${ext}`;
      const byteArray = Uint8Array.from(atob(params.base64), (c) => c.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from('school-assets')
        .upload(path, byteArray, { contentType: params.mimeType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('school-assets').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      const { error: updateError } = await db
        .from('students')
        .update({ photo_url: publicUrl })
        .eq('id', params.studentId)
        .eq('school_id', schoolId);
      if (updateError) throw updateError;

      return publicUrl;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['student-detail', vars.studentId] });
      qc.invalidateQueries({ queryKey: ['all-students', schoolId] });
    },
  });
}

export function useBulkImportStudents(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      rows: Array<{
        full_name: string;
        student_number?: string;
        stream_id: string;
        date_of_birth?: string;
        gender?: string;
        admission_date?: string;
        status?: string;
        parent_email?: string;
        parent_phone?: string;
      }>;
      semesterId: string;
    }) => {
      const db = supabase as any;
      const now = new Date().toISOString();
      const today = now.slice(0, 10);

      // Need grade_id and section_id — fetch stream details
      const streamIds = Array.from(new Set(params.rows.map((r) => r.stream_id)));
      const { data: streamRows } = await db
        .from('streams')
        .select('id, grade_id, grades ( section_id )')
        .in('id', streamIds);
      const streamMeta: Record<string, { grade_id: string; section_id: string }> = {};
      ((streamRows ?? []) as any[]).forEach((s: any) => {
        streamMeta[s.id] = { grade_id: s.grade_id, section_id: s.grades?.section_id };
      });

      const studentInserts = params.rows.map((r) => {
        const meta = streamMeta[r.stream_id] ?? {} as any;
        return {
          school_id: schoolId,
          full_name: r.full_name.trim(),
          ...(r.student_number ? { student_number: r.student_number.trim() } : {}),
          stream_id: r.stream_id,
          grade_id: meta.grade_id,
          section_id: meta.section_id,
          date_of_birth: r.date_of_birth || null,
          gender: r.gender || null,
          status: (r.status as any) || 'active',
          enrollment_date: r.admission_date || today,
          created_at: now,
        };
      });

      const { data: inserted, error } = await db
        .from('students')
        .insert(studentInserts)
        .select('id, stream_id');
      if (error) throw error;

      // Create year records
      const yearRecords = ((inserted ?? []) as any[]).map((s: any) => ({
        school_id: schoolId,
        student_id: s.id,
        semester_id: params.semesterId,
        stream_id: s.stream_id,
        enrollment_date: today,
        effective_start_date: today,
        created_at: now,
      }));
      if (yearRecords.length) {
        await db.from('student_year_records').insert(yearRecords);
      }

      // ── Link parents by email: find existing parent or create new one ─────
      let linkedParents = 0;
      const parentRows = params.rows
        .map((r, i) => ({ row: r, studentId: (inserted ?? [])[i]?.id as string | undefined }))
        .filter((x) => !!x.row.parent_email && !!x.studentId);

      if (parentRows.length) {
        const parentEmails = Array.from(new Set(parentRows.map((p) => p.row.parent_email!.toLowerCase())));
        const { data: existingParents } = await db
          .from('parents')
          .select('id, email')
          .eq('school_id', schoolId)
          .in('email', parentEmails);
        const parentByEmail: Record<string, string> = {};
        ((existingParents ?? []) as any[]).forEach((p: any) => { parentByEmail[p.email.toLowerCase()] = p.id; });

        // Create missing parents
        const toCreate = parentRows
          .filter((p) => !parentByEmail[p.row.parent_email!.toLowerCase()])
          .reduce((acc: Record<string, { row: any }>, p) => {
            const key = p.row.parent_email!.toLowerCase();
            if (!acc[key]) acc[key] = p;
            return acc;
          }, {});
        const parentInserts = Object.values(toCreate).map((p: any) => ({
          school_id: schoolId,
          full_name: p.row.full_name + "'s Parent", // placeholder; parent-import can update
          email: p.row.parent_email.toLowerCase(),
          phone: p.row.parent_phone || null,
        }));
        if (parentInserts.length) {
          const { data: newParents } = await db
            .from('parents')
            .insert(parentInserts)
            .select('id, email');
          ((newParents ?? []) as any[]).forEach((p: any) => { parentByEmail[p.email.toLowerCase()] = p.id; });
        }

        // Build student↔parent links (dedupe by pair)
        const seen = new Set<string>();
        const linkInserts = parentRows
          .map((p) => {
            const pid = parentByEmail[p.row.parent_email!.toLowerCase()];
            if (!pid || !p.studentId) return null;
            const key = `${p.studentId}:${pid}`;
            if (seen.has(key)) return null;
            seen.add(key);
            return { school_id: schoolId, student_id: p.studentId, parent_id: pid };
          })
          .filter(Boolean);

        if (linkInserts.length) {
          // Use upsert semantics via onConflict-like ignore: insert and ignore duplicates
          const { data: links } = await db.from('student_parent_links').insert(linkInserts).select('id');
          linkedParents = links?.length ?? 0;
        }
      }

      return { count: inserted?.length ?? 0, linkedParents };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-students', schoolId] });
      qc.invalidateQueries({ queryKey: ['students', schoolId] });
    },
  });
}
