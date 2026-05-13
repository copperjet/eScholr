/**
 * generate-invoice-pdf
 * POST /functions/v1/generate-invoice-pdf
 * Authorization: Bearer <user_jwt>
 *
 * Body: { invoice_id: string }
 *
 * Returns: { pdf_url: string, format: "pdf" | "html" }
 *
 * Generates an invoice PDF, uploads to receipts bucket, stores URL on invoice.
 * Allowed roles: finance, admin, super_admin, school_super_admin
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return json({ error: "Unauthorized" }, 401);

  const callerRoles: string[] = (caller.app_metadata as any)?.roles ?? [];
  const allowed = ["finance", "admin", "super_admin", "school_super_admin"];
  if (!callerRoles.some((r) => allowed.includes(r))) {
    return json({ error: "Forbidden" }, 403);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let invoice_id: string;
  try {
    const body = await req.json();
    invoice_id = body.invoice_id;
    if (!invoice_id) throw new Error("invoice_id required");
  } catch (e: any) {
    return json({ error: e.message }, 400);
  }

  // Fetch invoice with related data
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, issue_date, due_date, total_amount, paid_amount,
      balance, status, notes, currency,
      students ( id, full_name, student_number,
        streams ( name, grades ( name ) ) ),
      semesters ( name, academic_years ( name ) ),
      schools ( id, name, primary_color, secondary_color, logo_url, currency ),
      invoice_items (
        id, description, amount,
        fee_categories ( name )
      )
    `)
    .eq("id", invoice_id)
    .single();

  if (invErr || !invoice) return json({ error: "Invoice not found" }, 404);

  const school: any    = invoice.schools as any;
  const student: any   = invoice.students as any;
  const semester: any  = invoice.semesters as any;
  const items: any[]   = (invoice.invoice_items ?? []) as any[];

  const primaryColor   = school?.primary_color ?? "#1B2A4A";
  const secondaryColor = school?.secondary_color ?? "#E8A020";
  const currency       = invoice.currency ?? school?.currency ?? "ZMW";
  const totalAmount    = Number(invoice.total_amount) || 0;
  const paidAmount     = Number(invoice.paid_amount) || 0;
  const balance        = Number(invoice.balance) || 0;
  const issuedAt       = invoice.issue_date
    ? new Date(invoice.issue_date).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const dueDate        = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : null;
  const statusLabel    = (invoice.status ?? "unpaid").toUpperCase();
  const statusBg       = invoice.status === "paid" ? "#D1FAE5" : invoice.status === "partial" ? "#FEF3C7" : "#FEE2E2";
  const statusColor    = invoice.status === "paid" ? "#065F46" : invoice.status === "partial" ? "#92400E" : "#991B1B";

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #1F2937; background: #fff; padding: 40px; }
  .accent-bar { height: 4px; background: ${secondaryColor}; border-radius: 2px; margin-bottom: 24px; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 3px solid ${primaryColor}; }
  .school-info h1 { font-size: 22px; font-weight: 800; color: ${primaryColor}; }
  .school-info p  { font-size: 12px; color: #6B7280; margin-top: 4px; }
  .inv-meta { text-align: right; }
  .inv-meta h2 { font-size: 18px; font-weight: 700; color: ${primaryColor}; letter-spacing: 1px; }
  .inv-meta .inv-no { font-size: 13px; color: #6B7280; margin-top: 4px; }
  .inv-meta .issued { font-size: 12px; color: #9CA3AF; margin-top: 2px; }
  .status-badge { display: inline-block; padding: 4px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; margin-top: 8px; background: ${statusBg}; color: ${statusColor}; }
  .student-section { background: #F9FAFB; border-radius: 10px; padding: 18px; margin-bottom: 24px; display: flex; gap: 32px; flex-wrap: wrap; }
  .field label { font-size: 10px; font-weight: 700; color: #9CA3AF; letter-spacing: 0.5px; text-transform: uppercase; display: block; margin-bottom: 4px; }
  .field .value { font-size: 14px; font-weight: 600; color: #111827; }
  .section-title { font-size: 11px; font-weight: 700; color: #9CA3AF; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  thead tr { background: ${primaryColor}; color: #fff; }
  thead th { padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.4px; }
  tbody tr:nth-child(even) { background: #F9FAFB; }
  tbody td { padding: 10px 14px; font-size: 12px; border-bottom: 1px solid #F3F4F6; }
  .amount-col { text-align: right; font-variant-numeric: tabular-nums; }
  .summary { margin-left: auto; width: 260px; }
  .summary-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F3F4F6; font-size: 13px; }
  .summary-row.total { font-weight: 800; font-size: 16px; color: ${primaryColor}; border-bottom: none; padding-top: 12px; }
  .summary-row.balance-row { color: ${balance > 0 ? "#B45309" : "#065F46"}; font-weight: 700; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer .note { font-size: 11px; color: #9CA3AF; max-width: 300px; line-height: 1.5; }
  .footer .sig { text-align: right; }
  .footer .sig .sig-line { border-top: 1px solid #9CA3AF; width: 160px; margin-left: auto; margin-bottom: 4px; margin-top: 40px; }
  .footer .sig .sig-label { font-size: 11px; color: #6B7280; }
</style>
</head>
<body>
<div class="accent-bar"></div>
<div class="header">
  <div class="school-info">
    ${school?.logo_url ? `<img src="${school.logo_url}" style="height:48px;margin-bottom:8px;" />` : ""}
    <h1>${school?.name ?? "School"}</h1>
    <p>Fee Invoice</p>
  </div>
  <div class="inv-meta">
    <h2>INVOICE</h2>
    <div class="inv-no">${invoice.invoice_number}</div>
    <div class="issued">Issued: ${issuedAt}</div>
    ${dueDate ? `<div class="issued">Due: ${dueDate}</div>` : ""}
    <div class="status-badge">${statusLabel}</div>
  </div>
</div>

<div class="student-section">
  <div class="field">
    <label>Student Name</label>
    <div class="value">${student?.full_name ?? "—"}</div>
  </div>
  <div class="field">
    <label>Student ID</label>
    <div class="value">${student?.student_number ?? "—"}</div>
  </div>
  <div class="field">
    <label>Grade / Stream</label>
    <div class="value">${(student?.streams?.grades as any)?.name ?? "—"} · ${(student?.streams as any)?.name ?? "—"}</div>
  </div>
  <div class="field">
    <label>Term / Semester</label>
    <div class="value">${semester?.name ?? "—"}${semester?.academic_years ? " · " + (semester.academic_years as any).name : ""}</div>
  </div>
</div>

<div class="section-title">Fee Breakdown</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Description</th>
      <th class="amount-col">Amount (${currency})</th>
    </tr>
  </thead>
  <tbody>
    ${items.map((it: any, i: number) => `
    <tr>
      <td>${i + 1}</td>
      <td>${(it.fee_categories as any)?.name ?? it.description ?? "Fee"}</td>
      <td class="amount-col">${Number(it.amount).toLocaleString("en", { minimumFractionDigits: 2 })}</td>
    </tr>`).join("")}
  </tbody>
</table>

<div class="summary">
  <div class="summary-row total">
    <span>Total Due</span>
    <span>${currency} ${totalAmount.toLocaleString("en", { minimumFractionDigits: 2 })}</span>
  </div>
  ${paidAmount > 0 ? `
  <div class="summary-row">
    <span>Paid</span>
    <span>${currency} ${paidAmount.toLocaleString("en", { minimumFractionDigits: 2 })}</span>
  </div>` : ""}
  ${balance > 0 ? `
  <div class="summary-row balance-row">
    <span>Outstanding Balance</span>
    <span>${currency} ${balance.toLocaleString("en", { minimumFractionDigits: 2 })}</span>
  </div>` : ""}
</div>

${invoice.notes ? `<div style="margin-top:24px;padding:14px;background:#F9FAFB;border-radius:8px;font-size:12px;color:#4B5563;"><strong>Notes:</strong> ${invoice.notes}</div>` : ""}

<div class="footer">
  <div class="note">
    Please pay by ${dueDate ?? "the due date"} to avoid late fees.<br/>
    Quote your student number and invoice number at the bank.<br/>
    Invoice #${invoice.invoice_number} · ${school?.name ?? ""}
  </div>
  <div class="sig">
    <div class="sig-line"></div>
    <div class="sig-label">Authorised by Finance Office</div>
  </div>
</div>
</body>
</html>`;

  // Generate PDF via Puppeteer
  let pdfBuffer: Uint8Array;
  try {
    const puppeteer = await import("npm:puppeteer-core@21");
    const browser = await (puppeteer as any).default.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: "/usr/bin/chromium-browser",
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfData = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    pdfBuffer = new Uint8Array(pdfData);
    await browser.close();
  } catch (_e) {
    // Fallback: HTML
    const htmlBytes = new TextEncoder().encode(html);
    const path = `invoices/${school?.id ?? "school"}/${invoice_id}.html`;
    await supabase.storage.from("receipts").upload(path, htmlBytes, { contentType: "text/html", upsert: true });
    const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
    await supabase.from("invoices").update({ pdf_url: urlData.publicUrl }).eq("id", invoice_id);
    return json({ pdf_url: urlData.publicUrl, format: "html" });
  }

  const storagePath = `invoices/${school?.id ?? "school"}/${invoice_id}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from("receipts")
    .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  if (uploadErr) return json({ error: "Upload failed: " + uploadErr.message }, 500);

  const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(storagePath);

  await supabase.from("invoices").update({ pdf_url: urlData.publicUrl }).eq("id", invoice_id);

  return json({ pdf_url: urlData.publicUrl, format: "pdf" });
});
