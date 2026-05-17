/**
 * Finance hooks — payment tracking, bulk actions, report gating.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── types ────────────────────────────────────────────────────────────────────

export interface FinanceRecord {
  id: string;
  student_id: string;
  semester_id: string;
  status: 'paid' | 'unpaid';
  balance: number;
  updated_at: string;
  student: {
    id: string;
    full_name: string;
    student_number: string;
    photo_url: string | null;
    grade_name: string;
    stream_name: string;
    section_name: string;
  };
}

export interface PaymentTransaction {
  id: string;
  finance_record_id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  recorded_by_name: string;
}

export interface FinanceSummary {
  semesterId: string;
  semesterName: string;
  total: number;
  paid: number;
  unpaid: number;
  outstanding: number;
  financeReportsCount: number;
}

// ─── hooks ────────────────────────────────────────────────────────────────────

export function useFinanceSummary(schoolId: string) {
  return useQuery<FinanceSummary | null>({
    queryKey: ['finance-summary', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data: sem } = await db
        .from('semesters')
        .select('id, name')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .limit(1)
        .single();
      if (!sem) return null;

      const [recordsRes, reportsRes] = await Promise.all([
        db.from('finance_records')
          .select('status, balance')
          .eq('school_id', schoolId)
          .eq('semester_id', sem.id),
        db.from('reports')
          .select('id')
          .eq('school_id', schoolId)
          .eq('semester_id', sem.id)
          .eq('status', 'finance_pending'),
      ]);

      const records: any[] = recordsRes.data ?? [];
      const paid = records.filter((r) => r.status === 'paid').length;
      const unpaid = records.filter((r) => r.status === 'unpaid').length;
      const outstanding = records.reduce((sum, r) => sum + Number(r.balance ?? 0), 0);

      return {
        semesterId: sem.id,
        semesterName: sem.name,
        total: records.length,
        paid,
        unpaid,
        outstanding,
        financeReportsCount: (reportsRes.data ?? []).length,
      };
    },
  });
}

export function useFinanceList(params: {
  schoolId: string;
  semesterId?: string | null;
  status?: 'paid' | 'unpaid' | null;
  sectionName?: string | null;
}) {
  return useQuery<FinanceRecord[]>({
    queryKey: ['finance-list', params],
    enabled: !!params.schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;

      let semId = params.semesterId;
      if (!semId) {
        const { data: sem } = await db
          .from('semesters')
          .select('id')
          .eq('school_id', params.schoolId)
          .eq('is_active', true)
          .limit(1)
          .single();
        semId = sem?.id;
      }
      if (!semId) return [];

      let q = db
        .from('finance_records')
        .select(`
          id, student_id, semester_id, status, balance, updated_at,
          students (
            id, full_name, student_number, photo_url,
            streams ( name, grades ( name, school_sections ( name ) ) )
          )
        `)
        .eq('school_id', params.schoolId)
        .eq('semester_id', semId);

      if (params.status) q = q.eq('status', params.status);

      const { data, error } = await q.order('status', { ascending: true }).order('students(full_name)', { ascending: true });
      if (error) throw error;

      let rows = ((data ?? []) as any[]).map((r: any): FinanceRecord => ({
        id: r.id,
        student_id: r.student_id,
        semester_id: r.semester_id,
        status: r.status,
        balance: Number(r.balance ?? 0),
        updated_at: r.updated_at,
        student: {
          id: r.students?.id ?? '',
          full_name: r.students?.full_name ?? '—',
          student_number: r.students?.student_number ?? '',
          photo_url: r.students?.photo_url ?? null,
          grade_name: r.students?.streams?.grades?.name ?? '',
          stream_name: r.students?.streams?.name ?? '',
          section_name: r.students?.streams?.grades?.school_sections?.name ?? '',
        },
      }));

      if (params.sectionName) {
        rows = rows.filter((r) => r.student.section_name === params.sectionName);
      }

      return rows;
    },
  });
}

export function useStudentFinanceDetail(studentId: string | null, schoolId: string) {
  return useQuery<{ record: FinanceRecord | null; transactions: PaymentTransaction[] } | null>({
    queryKey: ['student-finance-detail', studentId, schoolId],
    enabled: !!studentId && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;
      const { data: sem } = await db
        .from('semesters')
        .select('id')
        .eq('school_id', schoolId)
        .eq('is_active', true)
        .limit(1)
        .single();
      if (!sem) return null;

      const [recordRes, txRes] = await Promise.all([
        db.from('finance_records')
          .select(`id, student_id, semester_id, status, balance, updated_at,
                   students ( id, full_name, student_number, photo_url,
                     streams ( name, grades ( name, school_sections ( name ) ) ) )`)
          .eq('school_id', schoolId)
          .eq('student_id', studentId!)
          .eq('semester_id', sem.id)
          .single(),
        db.from('payment_transactions')
          .select('id, finance_record_id, amount, paid_at, note, staff:recorded_by ( full_name )')
          .eq('student_id', studentId!)
          .eq('semester_id', sem.id)
          .order('paid_at', { ascending: false }),
      ]);

      const r: any = recordRes.data;
      if (!r) return { record: null, transactions: [] };

      return {
        record: {
          id: r.id,
          student_id: r.student_id,
          semester_id: r.semester_id,
          status: r.status,
          balance: Number(r.balance ?? 0),
          updated_at: r.updated_at,
          student: {
            id: r.students?.id ?? '',
            full_name: r.students?.full_name ?? '—',
            student_number: r.students?.student_number ?? '',
            photo_url: r.students?.photo_url ?? null,
            grade_name: r.students?.streams?.grades?.name ?? '',
            stream_name: r.students?.streams?.name ?? '',
            section_name: r.students?.streams?.grades?.school_sections?.name ?? '',
          },
        },
        transactions: ((txRes.data ?? []) as any[]).map((t: any): PaymentTransaction => ({
          id: t.id,
          finance_record_id: t.finance_record_id,
          amount: Number(t.amount ?? 0),
          paid_at: t.paid_at,
          note: t.note ?? null,
          recorded_by_name: t.staff?.full_name ?? '—',
        })),
      };
    },
  });
}

export function useFinancePendingReports(schoolId: string) {
  return useQuery<any[]>({
    queryKey: ['finance-pending-reports', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db
        .from('reports')
        .select(`id, status, updated_at,
                 students ( id, full_name, student_number, photo_url,
                   streams ( name, grades ( name ) ) ),
                 semesters ( id, name )`)
        .eq('school_id', schoolId)
        .eq('status', 'finance_pending')
        .order('updated_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

// ─── mutations ────────────────────────────────────────────────────────────────

export function useUpdatePaymentStatus(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      financeRecordId: string;
      status: 'paid' | 'unpaid';
      balance?: number;
      staffId: string;
      studentId?: string;
    }) => {
      const db = supabase as any;
      const { error } = await db
        .from('finance_records')
        .update({
          status: params.status,
          balance: params.balance ?? 0,
          updated_by: params.staffId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.financeRecordId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['finance-list'] });
      qc.invalidateQueries({ queryKey: ['finance-summary', schoolId] });
      if (vars.studentId) {
        qc.invalidateQueries({ queryKey: ['student-finance-detail', vars.studentId, schoolId] });
      } else {
        qc.invalidateQueries({ queryKey: ['student-finance-detail'] });
      }
    },
  });
}

export function useAddPaymentTransaction(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      financeRecordId: string;
      studentId: string;
      semesterId: string;
      amount: number;
      note?: string;
      staffId: string;
    }) => {
      const db = supabase as any;
      const { error } = await db.from('payment_transactions').insert({
        school_id: schoolId,
        finance_record_id: params.financeRecordId,
        student_id: params.studentId,
        semester_id: params.semesterId,
        amount: params.amount,
        note: params.note ?? null,
        recorded_by: params.staffId,
        paid_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['student-finance-detail', vars.studentId, schoolId] }),
  });
}

export function useBulkClearPayments(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { financeRecordIds: string[]; staffId: string }) => {
      const db = supabase as any;
      const { error } = await db
        .from('finance_records')
        .update({
          status: 'paid',
          balance: 0,
          updated_by: params.staffId,
          updated_at: new Date().toISOString(),
        })
        .in('id', params.financeRecordIds)
        .eq('school_id', schoolId);
      if (error) throw error;
      // Audit — fire-and-forget
      db.from('audit_logs').insert({
        school_id: schoolId,
        action: 'bulk_finance_clear',
        entity_type: 'finance_records',
        performed_at: new Date().toISOString(),
        meta: { count: params.financeRecordIds.length, staffId: params.staffId },
      }).then(() => {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-list'] });
      qc.invalidateQueries({ queryKey: ['finance-summary', schoolId] });
    },
  });
}

export function useClearFinanceReport(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { reportId: string; staffId: string }) => {
      const db = supabase as any;
      const now = new Date().toISOString();
      const { error } = await db
        .from('reports')
        .update({
          status:             'approved',
          finance_cleared_by: params.staffId,
          finance_cleared_at: now,
          updated_at:         now,
        })
        .eq('id', params.reportId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finance-pending-reports', schoolId] });
      qc.invalidateQueries({ queryKey: ['finance-summary', schoolId] });
      qc.invalidateQueries({ queryKey: ['admin-reports'] });
      qc.invalidateQueries({ queryKey: ['admin-report-counts'] });
    },
  });
}
