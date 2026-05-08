/**
 * Front Desk hooks — inquiry CRM + enrollment conversion.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export type InquiryStatus = 'new' | 'in_progress' | 'enrolled' | 'closed';

export interface Inquiry {
  id: string;
  school_id: string;
  name: string;
  contact_phone: string | null;
  contact_email: string | null;
  nature_of_inquiry: string;
  date: string;
  status: InquiryStatus;
  notes: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface InquiryNote {
  id: string;
  inquiry_id: string;
  note: string;
  staff_name: string;
  created_at: string;
}

export const INQUIRY_STATUS_META: Record<InquiryStatus, { label: string; color: string; icon: string }> = {
  new:         { label: 'New',         color: '#3B82F6', icon: 'add-circle-outline' },
  in_progress: { label: 'In Progress', color: '#F59E0B', icon: 'time-outline' },
  enrolled:    { label: 'Enrolled',    color: '#10B981', icon: 'checkmark-circle-outline' },
  closed:      { label: 'Closed',      color: '#9CA3AF', icon: 'close-circle-outline' },
};

export const INQUIRY_NATURES = [
  'Admission', 'Re-Enrollment', 'Fee Query', 'General', 'Transfer', 'Other',
] as const;

// ─── hooks ────────────────────────────────────────────────────────────────────

export function useInquiryList(schoolId: string, status?: InquiryStatus | 'all') {
  return useQuery<Inquiry[]>({
    queryKey: ['inquiries', 'list', { schoolId, status: status ?? 'all' }],
    enabled: !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      let q = db
        .from('inquiries')
        .select(`
          id, school_id, name, contact_phone, contact_email, nature_of_inquiry,
          date, status, notes, assigned_to, created_at, updated_at,
          staff:assigned_to ( full_name )
        `)
        .eq('school_id', schoolId);
      if (status && status !== 'all') q = q.eq('status', status);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any): Inquiry => ({
        id: r.id,
        school_id: r.school_id,
        name: r.name,
        contact_phone: r.contact_phone ?? null,
        contact_email: r.contact_email ?? null,
        nature_of_inquiry: r.nature_of_inquiry,
        date: r.date,
        status: r.status,
        notes: r.notes ?? null,
        assigned_to: r.assigned_to ?? null,
        assigned_name: r.staff?.full_name ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
    },
  });
}

export function useInquiryNotes(inquiryId: string | null) {
  return useQuery<InquiryNote[]>({
    queryKey: ['inquiries', 'activity', inquiryId],
    enabled: !!inquiryId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('inquiry_notes')
        .select('id, inquiry_id, body, created_at, author:author_id ( full_name )')
        .eq('inquiry_id', inquiryId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any): InquiryNote => ({
        id: r.id,
        inquiry_id: r.inquiry_id,
        note: r.body,
        staff_name: r.author?.full_name ?? '—',
        created_at: r.created_at,
      }));
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

export function useCreateInquiry(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      contactPhone?: string;
      contactEmail?: string;
      natureOfInquiry: string;
      notes?: string;
      staffId: string;
    }) => {
      const db = supabase as any;
      const { error } = await db.from('inquiries').insert({
        school_id: schoolId,
        name: params.name,
        contact_phone: params.contactPhone ?? null,
        contact_email: params.contactEmail ?? null,
        nature_of_inquiry: params.natureOfInquiry,
        notes: params.notes ?? null,
        status: 'new',
        assigned_to: params.staffId,
        date: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] });
    },
  });
}

export function useUpdateInquiryStatus(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { inquiryId: string; status: InquiryStatus }) => {
      const db = supabase as any;
      const { error } = await db
        .from('inquiries')
        .update({ status: params.status, updated_at: new Date().toISOString() })
        .eq('id', params.inquiryId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] });
    },
  });
}

export function useAddInquiryNote(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { inquiryId: string; note: string; staffId: string }) => {
      const db = supabase as any;
      const { error } = await db.from('inquiry_notes').insert({
        inquiry_id: params.inquiryId,
        school_id: schoolId,
        body: params.note,
        author_id: params.staffId,
        kind: 'note',
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['inquiries'] }); // canonical
      qc.invalidateQueries({ queryKey: ['inquiries', 'activity', vars.inquiryId] });
    },
  });
}

export function useConvertToEnrollment(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      inquiryId: string;
      studentName: string;
      gradeId: string;
      streamId: string;
      staffId: string;
    }) => {
      const db = supabase as any;
      // Get active semester
      const { data: sem } = await db
        .from('semesters')
        .select('id')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .limit(1)
        .single();
      if (!sem) throw new Error('No active semester');

      // Create the student record
      const { data: student, error: studentError } = await db
        .from('students')
        .insert({
          school_id: schoolId,
          full_name: params.studentName,
          stream_id: params.streamId,
          is_active: true,
          enrolled_at: new Date().toISOString().slice(0, 10),
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (studentError) throw studentError;

      // Create year record
      await db.from('student_year_records').insert({
        school_id: schoolId,
        student_id: student.id,
        semester_id: sem.id,
        stream_id: params.streamId,
        created_at: new Date().toISOString(),
      });

      // Mark inquiry as enrolled
      await db
        .from('inquiries')
        .update({
          status: 'enrolled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.inquiryId)
        .eq('school_id', schoolId);

      // Audit log
      db.from('audit_logs').insert({
        school_id: schoolId,
        action: 'inquiry_converted',
        entity_type: 'students',
        entity_id: student.id,
        performed_at: new Date().toISOString(),
        meta: { inquiryId: params.inquiryId, staffId: params.staffId },
      }).then(() => {});

      return { studentId: student.id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] });
      qc.invalidateQueries({ queryKey: ['students'] });
    },
  });
}
