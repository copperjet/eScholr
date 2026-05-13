/**
 * Invoice hooks — fee categories, fee schedules, invoice generation,
 * invoice detail, payment methods, Sage account mappings.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { enqueueSageEvent } from '../lib/sageOutbox';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeeCategory {
  id: string;
  school_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  sage_revenue_account: string | null;
}

export interface FeeSchedule {
  id: string;
  school_id: string;
  fee_category_id: string;
  grade_id: string | null;
  stream_id: string | null;
  semester_id: string;
  amount: number;
  due_date: string | null;
  is_mandatory: boolean;
  fee_categories?: { name: string; sage_revenue_account: string | null } | null;
  grades?: { name: string } | null;
  streams?: { name: string } | null;
  semesters?: { name: string } | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  fee_category_id: string;
  description: string | null;
  amount: number;
  fee_categories?: { name: string } | null;
}

export interface Invoice {
  id: string;
  school_id: string;
  student_id: string;
  semester_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  total_amount: number;
  status: 'unpaid' | 'partial' | 'paid' | 'cancelled';
  paid_amount: number;
  balance: number;
  notes: string | null;
  pdf_url: string | null;
  sent_to_parent_at: string | null;
  currency: string;
  sage_exported: boolean;
  invoice_items?: InvoiceItem[];
  students?: { id: string; full_name: string; student_number: string; photo_url: string | null } | null;
  semesters?: { name: string } | null;
}

export interface PaymentMethod {
  id: string;
  school_id: string;
  code: string;
  label: string;
  sage_account_code: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface SageAccountMapping {
  id: string;
  school_id: string;
  internal_key: string;
  sage_account_code: string;
  sage_dimension: string | null;
  description: string | null;
}

export interface BatchPreviewItem {
  student_id: string;
  student_name: string;
  student_number: string;
  grade_name: string;
  stream_name: string;
  items: { fee_category_id: string; category_name: string; amount: number }[];
  total: number;
  has_existing_invoice: boolean;
}

// ─── Fee Categories ───────────────────────────────────────────────────────────

export function useFeeCategories(schoolId: string) {
  return useQuery<FeeCategory[]>({
    queryKey: ['fee-categories', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fee_categories')
        .select('id, school_id, name, description, is_active, sort_order, sage_revenue_account')
        .eq('school_id', schoolId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FeeCategory[];
    },
  });
}

export function useUpsertFeeCategory(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cat: Partial<FeeCategory> & { name: string }) => {
      const db = supabase as any;
      if (cat.id) {
        const { error } = await db.from('fee_categories')
          .update({ name: cat.name, description: cat.description ?? null, is_active: cat.is_active ?? true, sort_order: cat.sort_order ?? 0, sage_revenue_account: cat.sage_revenue_account ?? null })
          .eq('id', cat.id).eq('school_id', schoolId);
        if (error) throw error;
      } else {
        const { error } = await db.from('fee_categories')
          .insert({ school_id: schoolId, name: cat.name, description: cat.description ?? null, is_active: true, sort_order: cat.sort_order ?? 0, sage_revenue_account: cat.sage_revenue_account ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-categories', schoolId] }),
  });
}

export function useDeleteFeeCategory(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('fee_categories').delete().eq('id', id).eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-categories', schoolId] }),
  });
}

// ─── Fee Schedules ────────────────────────────────────────────────────────────

export function useFeeSchedules(schoolId: string, semesterId?: string | null) {
  return useQuery<FeeSchedule[]>({
    queryKey: ['fee-schedules', schoolId, semesterId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const db = supabase as any;
      let semId = semesterId;
      if (!semId) {
        const { data: sem } = await db.from('semesters').select('id').eq('school_id', schoolId).eq('is_active', true).limit(1).single();
        semId = sem?.id;
      }
      if (!semId) return [];
      const { data, error } = await db
        .from('fee_schedules')
        .select(`id, school_id, fee_category_id, grade_id, stream_id, semester_id, amount, due_date, is_mandatory,
                 fee_categories(name, sage_revenue_account), grades(name), streams(name), semesters(name)`)
        .eq('school_id', schoolId)
        .eq('semester_id', semId)
        .order('fee_categories(name)', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any): FeeSchedule => ({
        id: r.id, school_id: r.school_id, fee_category_id: r.fee_category_id,
        grade_id: r.grade_id, stream_id: r.stream_id, semester_id: r.semester_id,
        amount: Number(r.amount), due_date: r.due_date, is_mandatory: r.is_mandatory,
        fee_categories: r.fee_categories, grades: r.grades, streams: r.streams, semesters: r.semesters,
      }));
    },
  });
}

export function useUpsertFeeSchedule(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sched: Partial<FeeSchedule> & { fee_category_id: string; semester_id: string; amount: number }) => {
      const db = supabase as any;
      const payload = {
        school_id: schoolId,
        fee_category_id: sched.fee_category_id,
        grade_id: sched.grade_id ?? null,
        stream_id: sched.stream_id ?? null,
        semester_id: sched.semester_id,
        amount: sched.amount,
        due_date: sched.due_date ?? null,
        is_mandatory: sched.is_mandatory ?? true,
      };
      if (sched.id) {
        const { error } = await db.from('fee_schedules').update(payload).eq('id', sched.id).eq('school_id', schoolId);
        if (error) throw error;
      } else {
        const { error } = await db.from('fee_schedules').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-schedules', schoolId] }),
  });
}

export function useDeleteFeeSchedule(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('fee_schedules').delete().eq('id', id).eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-schedules', schoolId] }),
  });
}

// ─── Invoices ────────────────────────────────────────────────────────────────

export function useInvoiceList(schoolId: string, semesterId?: string | null, status?: Invoice['status'] | null) {
  return useQuery<Invoice[]>({
    queryKey: ['invoice-list', schoolId, semesterId, status],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const db = supabase as any;
      let semId = semesterId;
      if (!semId) {
        const { data: sem } = await db.from('semesters').select('id').eq('school_id', schoolId).eq('is_active', true).limit(1).single();
        semId = sem?.id;
      }
      if (!semId) return [];
      let q = db.from('invoices')
        .select(`id, school_id, student_id, semester_id, invoice_number, issue_date, due_date,
                 total_amount, status, paid_amount, balance, notes, pdf_url,
                 sent_to_parent_at, currency, sage_exported,
                 students(id, full_name, student_number, photo_url),
                 semesters(name)`)
        .eq('school_id', schoolId)
        .eq('semester_id', semId);
      if (status) q = q.eq('status', status);
      const { data, error } = await q.order('issue_date', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r: any): Invoice => ({
        ...r,
        total_amount: Number(r.total_amount),
        paid_amount: Number(r.paid_amount),
        balance: Number(r.balance),
      }));
    },
  });
}

export function useInvoiceDetail(invoiceId: string | null, schoolId: string) {
  return useQuery<Invoice | null>({
    queryKey: ['invoice-detail', invoiceId, schoolId],
    enabled: !!invoiceId && !!schoolId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('invoices')
        .select(`id, school_id, student_id, semester_id, invoice_number, issue_date, due_date,
                 total_amount, status, paid_amount, balance, notes, pdf_url,
                 sent_to_parent_at, currency, sage_exported,
                 invoice_items(id, invoice_id, fee_category_id, description, amount, fee_categories(name)),
                 students(id, full_name, student_number, photo_url),
                 semesters(name)`)
        .eq('id', invoiceId!)
        .eq('school_id', schoolId)
        .single();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        total_amount: Number(data.total_amount),
        paid_amount: Number(data.paid_amount),
        balance: Number(data.balance),
        invoice_items: ((data.invoice_items ?? []) as any[]).map((it: any) => ({
          ...it, amount: Number(it.amount),
        })),
      } as Invoice;
    },
  });
}

// Preview what will be generated before committing batch
export function useInvoiceBatchPreview(params: {
  schoolId: string;
  semesterId: string | null;
  gradeId: string | null;
  streamId: string | null;
}) {
  return useQuery<BatchPreviewItem[]>({
    queryKey: ['invoice-batch-preview', params],
    enabled: !!params.schoolId && !!params.semesterId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;

      // Get applicable fee schedules
      let schedQ = db.from('fee_schedules')
        .select('id, fee_category_id, grade_id, stream_id, amount, fee_categories(name)')
        .eq('school_id', params.schoolId)
        .eq('semester_id', params.semesterId!);
      const { data: schedules } = await schedQ;
      if (!schedules || schedules.length === 0) return [];

      // Get students in grade/stream
      let studQ = db.from('students')
        .select('id, full_name, student_number, stream_id, streams(id, name, grade_id, grades(id, name))')
        .eq('school_id', params.schoolId)
        .eq('is_active', true);
      if (params.streamId) studQ = studQ.eq('stream_id', params.streamId);
      const { data: students } = await studQ;
      if (!students || students.length === 0) return [];

      // Filter by grade if set
      const filteredStudents = params.gradeId
        ? (students as any[]).filter((s: any) => s.streams?.grades?.id === params.gradeId)
        : (students as any[]);

      // Get existing invoices for this semester to flag duplicates
      const { data: existing } = await db.from('invoices')
        .select('student_id')
        .eq('school_id', params.schoolId)
        .eq('semester_id', params.semesterId!)
        .neq('status', 'cancelled');
      const existingSet = new Set((existing ?? []).map((e: any) => e.student_id));

      return filteredStudents.map((s: any) => {
        const gradeId = s.streams?.grades?.id;
        const streamId = s.stream_id;
        const applicable = (schedules as any[]).filter((sc: any) =>
          (sc.grade_id === null || sc.grade_id === gradeId) &&
          (sc.stream_id === null || sc.stream_id === streamId)
        );
        const items = applicable.map((sc: any) => ({
          fee_category_id: sc.fee_category_id,
          category_name: sc.fee_categories?.name ?? 'Fee',
          amount: Number(sc.amount),
        }));
        const total = items.reduce((sum: number, it: any) => sum + it.amount, 0);
        return {
          student_id: s.id,
          student_name: s.full_name,
          student_number: s.student_number,
          grade_name: s.streams?.grades?.name ?? '',
          stream_name: s.streams?.name ?? '',
          items,
          total,
          has_existing_invoice: existingSet.has(s.id),
        } as BatchPreviewItem;
      }).filter((item: BatchPreviewItem) => item.items.length > 0);
    },
  });
}

export function useGenerateInvoiceBatch(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      semesterId: string;
      students: BatchPreviewItem[];
      staffId: string;
      dueDate?: string;
      skipExisting?: boolean;
    }) => {
      const db = supabase as any;
      const toCreate = params.skipExisting
        ? params.students.filter((s) => !s.has_existing_invoice)
        : params.students;

      for (const student of toCreate) {
        if (student.items.length === 0) continue;
        const total = student.items.reduce((s, it) => s + it.amount, 0);
        // Insert invoice (trigger auto-sets invoice_number)
        const { data: inv, error: invErr } = await db.from('invoices').insert({
          school_id: schoolId,
          student_id: student.student_id,
          semester_id: params.semesterId,
          invoice_number: null, // trigger sets this
          issue_date: new Date().toISOString().slice(0, 10),
          due_date: params.dueDate ?? null,
          total_amount: total,
          status: 'unpaid',
          paid_amount: 0,
          created_by: params.staffId,
        }).select('id').single();
        if (invErr) throw invErr;

        // Enqueue Sage event (safety net — DB trigger is primary)
        enqueueSageEvent({
          schoolId,
          eventType: 'invoice_created',
          entityTable: 'invoices',
          entityId: inv.id,
          payload: {
            student_id: student.student_id,
            semester_id: params.semesterId,
            total_amount: total,
          },
        }).catch(() => {}); // fire-and-forget

        // Insert line items
        const lineItems = student.items.map((it) => ({
          invoice_id: inv.id,
          fee_category_id: it.fee_category_id,
          description: it.category_name,
          amount: it.amount,
        }));
        const { error: itemErr } = await db.from('invoice_items').insert(lineItems);
        if (itemErr) throw itemErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-list', schoolId] });
      qc.invalidateQueries({ queryKey: ['invoice-batch-preview'] });
    },
  });
}

export function useMarkInvoicePaid(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { invoiceId: string; paidAmount: number; staffId: string }) => {
      const db = supabase as any;
      const { data: inv } = await db.from('invoices').select('total_amount, paid_amount').eq('id', params.invoiceId).single();
      const newPaid = Number(inv?.paid_amount ?? 0) + params.paidAmount;
      const total = Number(inv?.total_amount ?? 0);
      const newStatus = newPaid >= total ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
      const { error } = await db.from('invoices')
        .update({ paid_amount: newPaid, status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', params.invoiceId).eq('school_id', schoolId);
      if (error) throw error;

      // Enqueue Sage event (safety net — DB trigger is primary)
      enqueueSageEvent({
        schoolId,
        eventType: 'payment_recorded',
        entityTable: 'invoices',
        entityId: params.invoiceId,
        payload: { paid_amount: params.paidAmount, recorded_by: params.staffId },
      }).catch(() => {}); // fire-and-forget
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice-list', schoolId] });
      qc.invalidateQueries({ queryKey: ['invoice-detail'] });
    },
  });
}

// ─── Payment Methods ──────────────────────────────────────────────────────────

const DEFAULT_PAYMENT_METHODS = [
  { code: 'cash',           label: 'Cash',           sort_order: 0 },
  { code: 'bank_transfer',  label: 'Bank Transfer',  sort_order: 1 },
  { code: 'mobile_money',   label: 'Mobile Money',   sort_order: 2 },
  { code: 'mpesa',          label: 'M-Pesa',         sort_order: 3 },
  { code: 'airtel_money',   label: 'Airtel Money',   sort_order: 4 },
  { code: 'cheque',         label: 'Cheque',         sort_order: 5 },
  { code: 'other',          label: 'Other',          sort_order: 6 },
];

export function usePaymentMethods(schoolId: string) {
  return useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const db = supabase as any;
      const { data, error } = await db.from('payment_methods')
        .select('*').eq('school_id', schoolId).order('sort_order').order('label');
      if (error) throw error;
      if (!data || data.length === 0) {
        // Seed defaults for this school
        await db.from('payment_methods').insert(
          DEFAULT_PAYMENT_METHODS.map((m) => ({ ...m, school_id: schoolId, is_active: true }))
        );
        const { data: seeded } = await db.from('payment_methods')
          .select('*').eq('school_id', schoolId).order('sort_order');
        return (seeded ?? []) as PaymentMethod[];
      }
      return (data ?? []) as PaymentMethod[];
    },
  });
}

export function useUpsertPaymentMethod(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: Partial<PaymentMethod> & { code: string; label: string }) => {
      const db = supabase as any;
      if (m.id) {
        const { error } = await db.from('payment_methods')
          .update({ label: m.label, sage_account_code: m.sage_account_code ?? null, is_active: m.is_active ?? true, sort_order: m.sort_order ?? 0 })
          .eq('id', m.id).eq('school_id', schoolId);
        if (error) throw error;
      } else {
        const { error } = await db.from('payment_methods')
          .insert({ school_id: schoolId, code: m.code, label: m.label, sage_account_code: m.sage_account_code ?? null, is_active: true, sort_order: m.sort_order ?? 0 });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-methods', schoolId] }),
  });
}

// ─── Sage Account Mappings ────────────────────────────────────────────────────

export const DEFAULT_SAGE_KEYS = ['AR', 'Revenue:Tuition', 'Revenue:Transport', 'Revenue:Uniform', 'Revenue:Lunch', 'Revenue:Other', 'Cash', 'Bank', 'Discount'];

export function useSageAccountMappings(schoolId: string) {
  return useQuery<SageAccountMapping[]>({
    queryKey: ['sage-mappings', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sage_account_mappings')
        .select('*').eq('school_id', schoolId).order('internal_key');
      if (error) throw error;
      return (data ?? []) as SageAccountMapping[];
    },
  });
}

export function useUpsertSageMapping(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { internal_key: string; sage_account_code: string; sage_dimension?: string; description?: string }) => {
      const { error } = await (supabase as any).from('sage_account_mappings')
        .upsert({ school_id: schoolId, internal_key: m.internal_key, sage_account_code: m.sage_account_code, sage_dimension: m.sage_dimension ?? null, description: m.description ?? null }, { onConflict: 'school_id,internal_key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sage-mappings', schoolId] }),
  });
}
