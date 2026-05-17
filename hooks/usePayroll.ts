/**
 * usePayroll — pay periods, timesheets, adjustments, preview, export.
 * No tax/net calculations — gross inputs only. Sage handles the rest.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PayPeriodStatus = 'open' | 'locked' | 'exported';

export interface PayPeriod {
  id: string;
  school_id: string;
  period_label: string;
  start_date: string;
  end_date: string;
  status: PayPeriodStatus;
  locked_at: string | null;
  exported_at: string | null;
  export_url: string | null;
  created_at: string;
}

export interface StaffTimesheet {
  id: string;
  school_id: string;
  staff_id: string;
  pay_period_id: string;
  hours_worked: number;
  overtime_hours: number;
  notes: string | null;
  staff?: { full_name: string; staff_number: string | null; pay_type: string | null; hourly_rate: number | null };
}

export interface PayAdjustment {
  id: string;
  school_id: string;
  staff_id: string;
  pay_period_id: string;
  kind: 'bonus' | 'deduction' | 'advance' | 'reimbursement' | 'stipend' | 'other';
  amount: number;
  reason: string | null;
  created_at: string;
  staff?: { full_name: string; staff_number: string | null };
}

export interface PayPeriodPreviewItem {
  staff_id: string;
  staff_number: string | null;
  staff_name: string;
  pay_type: 'salary' | 'hourly' | null;
  base_salary: number;
  hourly_rate: number;
  hours_worked: number;
  overtime_hours: number;
  stipends_total: number;
  adjustments_total: number;
  deductions_total: number;
  unpaid_leave_days: number;
  gross_pay: number;
  bank_name: string | null;
  bank_account: string | null;
  bank_branch: string | null;
  tax_id: string | null;
  currency: string | null;
  has_missing_banking: boolean;
  has_missing_tax_id: boolean;
}

export interface PayrollExport {
  id: string;
  pay_period_id: string;
  file_url: string | null;
  staff_count: number;
  status: 'success' | 'partial' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface ValidationIssue {
  staff_id: string;
  staff_name: string;
  issues: string[];
}

// ─── Pay Periods ──────────────────────────────────────────────────────────────

export function usePayPeriods(schoolId: string) {
  return useQuery<PayPeriod[]>({
    queryKey: ['pay-periods', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('pay_periods')
        .select('*')
        .eq('school_id', schoolId)
        .order('start_date', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as PayPeriod[];
    },
  });
}

export function useOpenPayPeriod(schoolId: string) {
  return useQuery<PayPeriod | null>({
    queryKey: ['pay-periods-open', schoolId],
    enabled: !!schoolId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('pay_periods')
        .select('*')
        .eq('school_id', schoolId)
        .eq('status', 'open')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PayPeriod | null;
    },
  });
}

export function useCreatePayPeriod(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      period_label: string;
      start_date: string;
      end_date: string;
      created_by: string;
    }) => {
      const { data, error } = await (supabase as any)
        .from('pay_periods')
        .insert({ school_id: schoolId, ...params, status: 'open' })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pay-periods', schoolId] });
      qc.invalidateQueries({ queryKey: ['pay-periods-open', schoolId] });
    },
  });
}

export function useLockPayPeriod(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { periodId: string; staffId: string }) => {
      const { error } = await (supabase as any)
        .from('pay_periods')
        .update({ status: 'locked', locked_at: new Date().toISOString(), locked_by: params.staffId })
        .eq('id', params.periodId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pay-periods', schoolId] });
      qc.invalidateQueries({ queryKey: ['pay-periods-open', schoolId] });
    },
  });
}

export function useReopenPayPeriod(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (periodId: string) => {
      const { error } = await (supabase as any)
        .from('pay_periods')
        .update({ status: 'open', locked_at: null, locked_by: null })
        .eq('id', periodId)
        .eq('school_id', schoolId)
        .eq('status', 'locked');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pay-periods', schoolId] });
      qc.invalidateQueries({ queryKey: ['pay-periods-open', schoolId] });
    },
  });
}

// ─── Timesheets ───────────────────────────────────────────────────────────────

export function useStaffTimesheets(schoolId: string, periodId: string) {
  return useQuery<StaffTimesheet[]>({
    queryKey: ['staff-timesheets', schoolId, periodId],
    enabled: !!schoolId && !!periodId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff_timesheets')
        .select('*, staff(full_name, staff_number, pay_type, hourly_rate)')
        .eq('school_id', schoolId)
        .eq('pay_period_id', periodId)
        .order('staff(full_name)', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        hours_worked:   Number(r.hours_worked),
        overtime_hours: Number(r.overtime_hours),
      })) as StaffTimesheet[];
    },
  });
}

export function useUpsertTimesheet(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      staff_id: string;
      pay_period_id: string;
      hours_worked: number;
      overtime_hours: number;
      notes?: string | null;
      entered_by: string;
    }) => {
      const { error } = await (supabase as any)
        .from('staff_timesheets')
        .upsert(
          { school_id: schoolId, ...params },
          { onConflict: 'staff_id,pay_period_id' },
        );
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['staff-timesheets', schoolId, v.pay_period_id] });
      qc.invalidateQueries({ queryKey: ['payroll-preview', schoolId, v.pay_period_id] });
    },
  });
}

export function useBulkUpsertTimesheets(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: {
      staff_id: string;
      pay_period_id: string;
      hours_worked: number;
      overtime_hours: number;
      entered_by: string;
    }[]) => {
      const { error } = await (supabase as any)
        .from('staff_timesheets')
        .upsert(
          rows.map((r) => ({ school_id: schoolId, ...r })),
          { onConflict: 'staff_id,pay_period_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-timesheets', schoolId] });
      qc.invalidateQueries({ queryKey: ['payroll-preview', schoolId] });
    },
  });
}

// ─── Adjustments ──────────────────────────────────────────────────────────────

export function usePayAdjustments(schoolId: string, periodId: string) {
  return useQuery<PayAdjustment[]>({
    queryKey: ['pay-adjustments', schoolId, periodId],
    enabled: !!schoolId && !!periodId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('staff_pay_adjustments')
        .select('*, staff(full_name, staff_number)')
        .eq('school_id', schoolId)
        .eq('pay_period_id', periodId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount) })) as PayAdjustment[];
    },
  });
}

export function useAddAdjustment(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      staff_id: string;
      pay_period_id: string;
      kind: PayAdjustment['kind'];
      amount: number;
      reason?: string | null;
      created_by: string;
    }) => {
      const { error } = await (supabase as any)
        .from('staff_pay_adjustments')
        .insert({ school_id: schoolId, ...params });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['pay-adjustments', schoolId, v.pay_period_id] });
      qc.invalidateQueries({ queryKey: ['payroll-preview', schoolId, v.pay_period_id] });
    },
  });
}

export function useDeleteAdjustment(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { adjustmentId: string; pay_period_id: string }) => {
      const { error } = await (supabase as any)
        .from('staff_pay_adjustments')
        .delete()
        .eq('id', params.adjustmentId)
        .eq('school_id', schoolId);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['pay-adjustments', schoolId, v.pay_period_id] });
      qc.invalidateQueries({ queryKey: ['payroll-preview', schoolId, v.pay_period_id] });
    },
  });
}

// ─── Preview ──────────────────────────────────────────────────────────────────

export function usePayPeriodPreview(schoolId: string, periodId: string) {
  return useQuery<PayPeriodPreviewItem[]>({
    queryKey: ['payroll-preview', schoolId, periodId],
    enabled: !!schoolId && !!periodId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const db = supabase as any;

      // Active staff with payroll fields
      const { data: staffRows, error: staffErr } = await db
        .from('staff')
        .select('id, full_name, staff_number, pay_type, base_salary, hourly_rate, currency, bank_name, bank_account_number, bank_branch, tax_id')
        .eq('school_id', schoolId)
        .eq('status', 'active');
      if (staffErr) throw staffErr;

      const [timesheetRows, adjustmentRows, stipendRows] = await Promise.all([
        db.from('staff_timesheets').select('staff_id, hours_worked, overtime_hours').eq('school_id', schoolId).eq('pay_period_id', periodId),
        db.from('staff_pay_adjustments').select('staff_id, kind, amount').eq('school_id', schoolId).eq('pay_period_id', periodId),
        // Stipends from staff_role_assignments active during this period
        db.from('staff_role_assignments')
          .select('staff_id, stipend_amount, effective_from, effective_to')
          .eq('school_id', schoolId)
          .not('stipend_amount', 'is', null),
      ]);

      const period = await db.from('pay_periods').select('start_date, end_date').eq('id', periodId).single();
      const pStart = new Date(period.data?.start_date ?? '1970-01-01');
      const pEnd   = new Date(period.data?.end_date   ?? '2099-12-31');

      const timesheetMap: Record<string, { hours: number; ot: number }> = {};
      for (const t of (timesheetRows.data ?? []) as any[]) {
        timesheetMap[t.staff_id] = { hours: Number(t.hours_worked), ot: Number(t.overtime_hours) };
      }

      const adjMap: Record<string, { bonuses: number; deductions: number; stipends: number }> = {};
      for (const a of (adjustmentRows.data ?? []) as any[]) {
        if (!adjMap[a.staff_id]) adjMap[a.staff_id] = { bonuses: 0, deductions: 0, stipends: 0 };
        const amt = Number(a.amount);
        if (a.kind === 'deduction' || a.kind === 'advance') adjMap[a.staff_id].deductions += amt;
        else if (a.kind === 'stipend') adjMap[a.staff_id].stipends += amt;
        else adjMap[a.staff_id].bonuses += amt;
      }

      // Role stipends overlapping the period
      for (const s of (stipendRows.data ?? []) as any[]) {
        const from = s.effective_from ? new Date(s.effective_from) : new Date('1970-01-01');
        const to   = s.effective_to   ? new Date(s.effective_to)   : new Date('2099-12-31');
        if (from <= pEnd && to >= pStart) {
          if (!adjMap[s.staff_id]) adjMap[s.staff_id] = { bonuses: 0, deductions: 0, stipends: 0 };
          adjMap[s.staff_id].stipends += Number(s.stipend_amount ?? 0);
        }
      }

      return ((staffRows ?? []) as any[]).map((s: any): PayPeriodPreviewItem => {
        const ts  = timesheetMap[s.id] ?? { hours: 0, ot: 0 };
        const adj = adjMap[s.id] ?? { bonuses: 0, deductions: 0, stipends: 0 };
        const baseSalary  = Number(s.base_salary ?? 0);
        const hourlyRate  = Number(s.hourly_rate ?? 0);
        const grossBase   = s.pay_type === 'hourly'
          ? hourlyRate * (ts.hours + ts.ot * 1.5)
          : baseSalary;
        const grossPay = grossBase + adj.stipends + adj.bonuses - adj.deductions;

        return {
          staff_id:          s.id,
          staff_number:      s.staff_number,
          staff_name:        s.full_name,
          pay_type:          s.pay_type,
          base_salary:       baseSalary,
          hourly_rate:       hourlyRate,
          hours_worked:      ts.hours,
          overtime_hours:    ts.ot,
          stipends_total:    adj.stipends,
          adjustments_total: adj.bonuses,
          deductions_total:  adj.deductions,
          unpaid_leave_days: 0, // TODO: join staff_leave_unpaid_days view if needed
          gross_pay:         Math.max(0, grossPay),
          bank_name:         s.bank_name,
          bank_account:      s.bank_account_number,
          bank_branch:       s.bank_branch,
          tax_id:            s.tax_id,
          currency:          s.currency,
          has_missing_banking: !s.bank_account_number,
          has_missing_tax_id:  !s.tax_id,
        };
      });
    },
  });
}

// ─── Payroll Exports ──────────────────────────────────────────────────────────

export function usePayrollExports(schoolId: string, periodId: string) {
  return useQuery<PayrollExport[]>({
    queryKey: ['payroll-exports', schoolId, periodId],
    enabled: !!schoolId && !!periodId,
    staleTime: 1000 * 60,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('payroll_exports')
        .select('*')
        .eq('school_id', schoolId)
        .eq('pay_period_id', periodId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayrollExport[];
    },
  });
}

export function useExportPayrollCsv(schoolId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { periodId: string; staffId: string }): Promise<{ file_url: string; staff_count: number }> => {
      const session = await (supabase as any).auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/export-payroll-csv`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ school_id: schoolId, pay_period_id: params.periodId, created_by: params.staffId }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Export failed');
      return { file_url: json.file_url, staff_count: json.staff_count };
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['pay-periods', schoolId] });
      qc.invalidateQueries({ queryKey: ['payroll-exports', schoolId, v.periodId] });
    },
  });
}

export function useValidatePayPeriod(schoolId: string, periodId: string) {
  return useQuery<ValidationIssue[]>({
    queryKey: ['payroll-validate', schoolId, periodId],
    enabled: !!schoolId && !!periodId,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const session = await (supabase as any).auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) throw new Error('Not authenticated');

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/payroll-period-validate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ school_id: schoolId, pay_period_id: periodId }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Validation failed');
      return (json.issues ?? []) as ValidationIssue[];
    },
  });
}
