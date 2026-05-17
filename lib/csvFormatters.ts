/**
 * csvFormatters — produce Sage-compatible CSV strings from finance data.
 *
 * Formats supported:
 *   'pastel'    — Sage Pastel Partner / Evolution import format
 *   'evolution' — alias for pastel (same schema)
 *   'cloud'     — Sage Business Cloud Accounting (simplified journal)
 *
 * Each formatter returns a CSV string ready to write to a file.
 */

export type SageCsvFormat = 'pastel' | 'evolution' | 'cloud';

function escapeCsv(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: unknown[]): string {
  return cells.map(escapeCsv).join(',');
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  // Sage expects DD/MM/YYYY
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ── Invoice CSV ───────────────────────────────────────────────

export interface InvoiceCsvRow {
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  student_number: string;
  student_name: string;
  total_amount: number;
  ar_account: string;       // from sage_account_mappings['AR']
  revenue_account: string;  // from fee_category mapping
  fee_category: string;
  item_amount: number;
  currency: string;
}

export function formatInvoicesCsv(rows: InvoiceCsvRow[], format: SageCsvFormat = 'cloud'): string {
  if (format === 'cloud') {
    const header = row(['InvoiceNumber', 'Date', 'DueDate', 'CustomerCode', 'CustomerName', 'Description', 'Amount', 'Account', 'Currency']);
    const lines = rows.map((r) =>
      row([r.invoice_number, formatDate(r.issue_date), formatDate(r.due_date), r.student_number, r.student_name, r.fee_category, r.item_amount.toFixed(2), r.revenue_account, r.currency])
    );
    return [header, ...lines].join('\n');
  }
  // Pastel / Evolution
  const header = row(['Type', 'Reference', 'Date', 'Account', 'Description', 'Debit', 'Credit', 'TaxCode', 'Project']);
  const lines: string[] = [];
  for (const r of rows) {
    // DR: AR account
    lines.push(row(['J', r.invoice_number, formatDate(r.issue_date), r.ar_account, `Invoice ${r.invoice_number} - ${r.student_name}`, r.item_amount.toFixed(2), '', 'X', '']));
    // CR: Revenue account
    lines.push(row(['J', r.invoice_number, formatDate(r.issue_date), r.revenue_account, r.fee_category, '', r.item_amount.toFixed(2), 'X', '']));
  }
  return [header, ...lines].join('\n');
}

// ── Receipt / Payment CSV ─────────────────────────────────────

export interface PaymentCsvRow {
  receipt_number: string;
  paid_at: string;
  student_number: string;
  student_name: string;
  amount: number;
  payment_method_label: string;
  bank_account: string;    // from sage_account_mappings for payment_method_code
  ar_account: string;
  reference_number: string | null;
  currency: string;
}

export function formatPaymentsCsv(rows: PaymentCsvRow[], format: SageCsvFormat = 'cloud'): string {
  if (format === 'cloud') {
    const header = row(['ReceiptNumber', 'Date', 'CustomerCode', 'CustomerName', 'Amount', 'BankAccount', 'Reference', 'Method', 'Currency']);
    const lines = rows.map((r) =>
      row([r.receipt_number, formatDate(r.paid_at), r.student_number, r.student_name, r.amount.toFixed(2), r.bank_account, r.reference_number ?? '', r.payment_method_label, r.currency])
    );
    return [header, ...lines].join('\n');
  }
  // Pastel journal
  const header = row(['Type', 'Reference', 'Date', 'Account', 'Description', 'Debit', 'Credit', 'TaxCode', 'Project']);
  const lines: string[] = [];
  for (const r of rows) {
    // DR: Cash/Bank account
    lines.push(row(['J', r.receipt_number, formatDate(r.paid_at), r.bank_account, `Receipt ${r.receipt_number} - ${r.student_name}`, r.amount.toFixed(2), '', 'X', '']));
    // CR: AR account
    lines.push(row(['J', r.receipt_number, formatDate(r.paid_at), r.ar_account, `Receipt from ${r.student_name}`, '', r.amount.toFixed(2), 'X', '']));
  }
  return [header, ...lines].join('\n');
}

// ── Payroll CSV ───────────────────────────────────────────────

export interface PayrollCsvRow {
  staff_code: string;
  staff_name: string;
  period_label: string;
  pay_type: 'salary' | 'hourly';
  base_salary: number;
  hours_worked: number | null;
  overtime_hours: number | null;
  gross_pay: number;
  stipend_total: number;
  bonus: number;
  deductions: number;
  unpaid_leave_days: number;
  bank_name: string;
  bank_account: string;
  bank_branch: string;
  tax_id: string;
  currency: string;
}

export function formatPayrollCsv(rows: PayrollCsvRow[]): string {
  const header = row([
    'StaffCode', 'StaffName', 'Period', 'PayType',
    'BaseSalary', 'HoursWorked', 'OvertimeHours', 'GrossPay',
    'Stipends', 'Bonus', 'Deductions', 'UnpaidLeaveDays',
    'BankName', 'BankAccount', 'BankBranch', 'TaxID', 'Currency',
  ]);
  const lines = rows.map((r) =>
    row([
      r.staff_code, r.staff_name, r.period_label, r.pay_type,
      r.base_salary.toFixed(2), r.hours_worked ?? '', r.overtime_hours ?? '', r.gross_pay.toFixed(2),
      r.stipend_total.toFixed(2), r.bonus.toFixed(2), r.deductions.toFixed(2), r.unpaid_leave_days,
      r.bank_name, r.bank_account, r.bank_branch, r.tax_id, r.currency,
    ])
  );
  return [header, ...lines].join('\n');
}
