/**
 * export-finance-csv
 * POST /functions/v1/export-finance-csv
 * Authorization: Bearer <user_jwt>
 *
 * Body: { school_id: string, created_by: string, format?: 'cloud'|'pastel'|'evolution' }
 *
 * Returns: { file_url: string, rows_included: number, export_id: string }
 *
 * Drains all pending rows from sage_sync_queue for the school:
 *  - Generates invoices.csv + payments.csv (Sage-compatible)
 *  - Bundles them into a ZIP or multi-sheet CSV package
 *  - Uploads to exports/{school_id}/{timestamp}.zip
 *  - Marks rows as sent_csv
 *  - Logs to finance_exports
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const ALLOWED_ROLES = new Set(["finance", "admin", "super_admin", "school_super_admin"]);

// ── CSV helpers ────────────────────────────────────────────────────────────────

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}
function csvRow(cells: unknown[]) { return cells.map(esc).join(","); }

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

type CsvFormat = "cloud" | "pastel" | "evolution";

// ── Invoice CSV ────────────────────────────────────────────────────────────────

interface InvoiceRow {
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  student_number: string;
  student_name: string;
  fee_category: string;
  item_amount: number;
  revenue_account: string;
  ar_account: string;
  currency: string;
}

function buildInvoicesCsv(rows: InvoiceRow[], format: CsvFormat): string {
  if (format === "cloud") {
    const header = csvRow(["InvoiceNumber", "Date", "DueDate", "CustomerCode", "CustomerName", "Description", "Amount", "Account", "Currency"]);
    const lines = rows.map((r) =>
      csvRow([r.invoice_number, formatDate(r.issue_date), formatDate(r.due_date), r.student_number, r.student_name, r.fee_category, r.item_amount.toFixed(2), r.revenue_account, r.currency])
    );
    return [header, ...lines].join("\n");
  }
  // Pastel / Evolution journal
  const header = csvRow(["Type", "Reference", "Date", "Account", "Description", "Debit", "Credit", "TaxCode", "Project"]);
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(csvRow(["J", r.invoice_number, formatDate(r.issue_date), r.ar_account, `Invoice ${r.invoice_number} - ${r.student_name}`, r.item_amount.toFixed(2), "", "X", ""]));
    lines.push(csvRow(["J", r.invoice_number, formatDate(r.issue_date), r.revenue_account, r.fee_category, "", r.item_amount.toFixed(2), "X", ""]));
  }
  return [header, ...lines].join("\n");
}

// ── Payment CSV ────────────────────────────────────────────────────────────────

interface PaymentRow {
  receipt_number: string;
  paid_at: string;
  student_number: string;
  student_name: string;
  amount: number;
  payment_method_label: string;
  bank_account: string;
  ar_account: string;
  reference_number: string | null;
  currency: string;
}

function buildPaymentsCsv(rows: PaymentRow[], format: CsvFormat): string {
  if (format === "cloud") {
    const header = csvRow(["ReceiptNumber", "Date", "CustomerCode", "CustomerName", "Amount", "BankAccount", "Reference", "Method", "Currency"]);
    const lines = rows.map((r) =>
      csvRow([r.receipt_number, formatDate(r.paid_at), r.student_number, r.student_name, r.amount.toFixed(2), r.bank_account, r.reference_number ?? "", r.payment_method_label, r.currency])
    );
    return [header, ...lines].join("\n");
  }
  const header = csvRow(["Type", "Reference", "Date", "Account", "Description", "Debit", "Credit", "TaxCode", "Project"]);
  const lines: string[] = [];
  for (const r of rows) {
    lines.push(csvRow(["J", r.receipt_number, formatDate(r.paid_at), r.bank_account, `Receipt ${r.receipt_number} - ${r.student_name}`, r.amount.toFixed(2), "", "X", ""]));
    lines.push(csvRow(["J", r.receipt_number, formatDate(r.paid_at), r.ar_account, `Receipt from ${r.student_name}`, "", r.amount.toFixed(2), "X", ""]));
  }
  return [header, ...lines].join("\n");
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return json({ error: "Unauthorized" }, 401);

  const role = (caller.app_metadata as any)?.role as string | undefined;
  if (!role || !ALLOWED_ROLES.has(role)) return json({ error: "Forbidden" }, 403);

  // Parse body
  let body: { school_id?: string; created_by?: string; format?: CsvFormat };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { school_id, created_by, format = "cloud" } = body;
  if (!school_id || !created_by) return json({ error: "school_id and created_by required" }, 400);

  // Validate caller belongs to school
  const callerSchoolId = (caller.app_metadata as any)?.school_id as string | undefined;
  if (callerSchoolId !== school_id) return json({ error: "Forbidden" }, 403);

  // Service-role client for data access
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── 1. Fetch pending queue rows ─────────────────────────────────────────────
  const { data: queueRows, error: queueErr } = await admin
    .from("sage_sync_queue")
    .select("id, event_type, entity_table, entity_id, payload")
    .eq("school_id", school_id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(500);

  if (queueErr) return json({ error: queueErr.message }, 500);
  if (!queueRows || queueRows.length === 0) {
    return json({ file_url: null, rows_included: 0, message: "No pending rows" });
  }

  const rowIds = queueRows.map((r: any) => r.id as string);

  // ── 2. Load Sage account mappings ───────────────────────────────────────────
  const { data: mappingsRaw } = await admin
    .from("sage_account_mappings")
    .select("internal_key, sage_account_code")
    .eq("school_id", school_id);

  const mappings: Record<string, string> = {};
  for (const m of (mappingsRaw ?? []) as any[]) {
    mappings[m.internal_key] = m.sage_account_code;
  }
  const AR_ACCOUNT  = mappings["AR"]   ?? "DEBTORS";
  const CASH_ACCT   = mappings["Cash"] ?? "CASH";
  const BANK_ACCT   = mappings["Bank"] ?? "BANK";

  // ── 3. Load school currency ─────────────────────────────────────────────────
  const { data: schoolRow } = await admin.from("schools").select("currency").eq("id", school_id).single();
  const currency = (schoolRow as any)?.currency ?? "ZMW";

  // ── 4. Resolve invoice rows ─────────────────────────────────────────────────
  const invoiceEntityIds = queueRows
    .filter((r: any) => r.event_type === "invoice_created" || r.event_type === "invoice_status_changed")
    .map((r: any) => r.entity_id as string);

  const invoiceCsvRows: InvoiceRow[] = [];

  if (invoiceEntityIds.length > 0) {
    const { data: invoices } = await admin
      .from("invoices")
      .select(`
        id, invoice_number, issue_date, due_date, currency,
        students(full_name, student_number),
        invoice_items(amount, fee_categories(name, sage_revenue_account))
      `)
      .in("id", invoiceEntityIds)
      .eq("school_id", school_id);

    for (const inv of (invoices ?? []) as any[]) {
      const studentName   = inv.students?.full_name ?? "Unknown";
      const studentNumber = inv.students?.student_number ?? "";
      const invCurrency   = inv.currency ?? currency;

      for (const item of (inv.invoice_items ?? []) as any[]) {
        const categoryName    = item.fee_categories?.name ?? "Other";
        const categoryKey     = `Revenue:${categoryName}`;
        const revenueAccount  = item.fee_categories?.sage_revenue_account ?? mappings[categoryKey] ?? mappings["Revenue:Other"] ?? "REVENUE";

        invoiceCsvRows.push({
          invoice_number:  inv.invoice_number,
          issue_date:      inv.issue_date,
          due_date:        inv.due_date,
          student_number:  studentNumber,
          student_name:    studentName,
          fee_category:    categoryName,
          item_amount:     Number(item.amount),
          revenue_account: revenueAccount,
          ar_account:      AR_ACCOUNT,
          currency:        invCurrency,
        });
      }
    }
  }

  // ── 5. Resolve payment rows ─────────────────────────────────────────────────
  const paymentEntityIds = queueRows
    .filter((r: any) => r.event_type === "payment_recorded")
    .map((r: any) => r.entity_id as string);

  const paymentCsvRows: PaymentRow[] = [];

  if (paymentEntityIds.length > 0) {
    const { data: payments } = await admin
      .from("payment_transactions")
      .select(`
        id, amount, paid_at, reference_number, payment_method_code,
        students(full_name, student_number),
        payment_methods(label, sage_account_code)
      `)
      .in("id", paymentEntityIds)
      .eq("school_id", school_id);

    for (const p of (payments ?? []) as any[]) {
      const methodCode    = p.payment_method_code ?? "cash";
      const bankAccount   = p.payment_methods?.sage_account_code ?? (methodCode === "cash" ? CASH_ACCT : BANK_ACCT);
      const methodLabel   = p.payment_methods?.label ?? methodCode;

      paymentCsvRows.push({
        receipt_number:       p.id.slice(0, 8).toUpperCase(),
        paid_at:              p.paid_at,
        student_number:       p.students?.student_number ?? "",
        student_name:         p.students?.full_name ?? "Unknown",
        amount:               Number(p.amount),
        payment_method_label: methodLabel,
        bank_account:         bankAccount,
        ar_account:           AR_ACCOUNT,
        reference_number:     p.reference_number ?? null,
        currency,
      });
    }
  }

  // ── 6. Build CSV content ────────────────────────────────────────────────────
  const csvFormat = (["pastel", "evolution", "cloud"].includes(format) ? format : "cloud") as CsvFormat;
  const invoicesCsv = buildInvoicesCsv(invoiceCsvRows, csvFormat);
  const paymentsCsv = buildPaymentsCsv(paymentCsvRows, csvFormat);

  // Bundle: simple concatenated file with section headers
  const timestamp   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const separator   = `\n\n--- SECTION ---\n\n`;
  const bundleCsv   = `# eScholr Finance Export — ${timestamp}\n# Format: ${csvFormat}\n# School: ${school_id}\n\n# INVOICES\n${invoicesCsv}${separator}# PAYMENTS\n${paymentsCsv}`;
  const fileName    = `exports/${school_id}/${timestamp}_finance.csv`;

  // ── 7. Upload to storage ────────────────────────────────────────────────────
  const encoder    = new TextEncoder();
  const csvBytes   = encoder.encode(bundleCsv);

  const { data: uploadData, error: uploadErr } = await admin.storage
    .from("receipts")
    .upload(fileName, csvBytes, {
      contentType: "text/csv",
      upsert: true,
    });

  if (uploadErr) {
    // Log failure and return error
    await admin.from("finance_exports").insert({
      school_id,
      export_type:    "csv",
      file_url:       null,
      rows_included:  0,
      status:         "failed",
      error_message:  uploadErr.message,
      created_by,
    });
    return json({ error: `Storage upload failed: ${uploadErr.message}` }, 500);
  }

  // Get public URL
  const { data: urlData } = admin.storage.from("receipts").getPublicUrl(fileName);
  const fileUrl = urlData?.publicUrl ?? null;

  // ── 8. Mark rows sent_csv ───────────────────────────────────────────────────
  const { error: updateErr } = await admin
    .from("sage_sync_queue")
    .update({
      status:  "sent_csv",
      sent_at: new Date().toISOString(),
    })
    .in("id", rowIds);

  const partialFailure = !!updateErr;

  // ── 9. Log to finance_exports ───────────────────────────────────────────────
  const { data: exportLog } = await admin.from("finance_exports").insert({
    school_id,
    export_type:   "csv",
    file_url:      fileUrl,
    rows_included: rowIds.length,
    status:        partialFailure ? "partial" : "success",
    error_message: partialFailure ? `Queue update failed: ${updateErr?.message}` : null,
    created_by,
  }).select("id").single();

  return json({
    file_url:      fileUrl,
    rows_included: rowIds.length,
    export_id:     (exportLog as any)?.id ?? null,
    invoice_rows:  invoiceCsvRows.length,
    payment_rows:  paymentCsvRows.length,
  });
});
