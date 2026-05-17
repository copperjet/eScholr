/**
 * generate-invoice-pdf (v2 — pdf-lib edition)
 *
 * POST /functions/v1/generate-invoice-pdf
 * Auth:  Bearer <SERVICE_ROLE_KEY>  (called by pdf-job-runner only)
 * Body:  { invoice_id: string }
 *
 * Renders an invoice PDF in-process with pdf-lib, uploads via the
 * shared helper, records a pdf_versions row, mirrors pdf_url onto
 * the invoices row.
 */
import { rgb } from "npm:pdf-lib@1.17.1";
import { serviceClient, uploadPdf } from "../_shared/pdfUpload.ts";
import {
  insertVersion,
  markParentFailed,
  markParentGenerating,
  markParentSuccess,
  nextVersionNumber,
} from "../_shared/pdfVersions.ts";
import { A4, Cursor, Fonts, Margins, newDoc, parseHex } from "../_shared/pdf/layout.ts";
import { drawFooterOnAllPages, drawHeader, drawSectionTitle, SchoolBrand } from "../_shared/pdf/branding.ts";
import { Column, drawInfoStrip, drawTable } from "../_shared/pdf/tables.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

interface Item {
  id:          string;
  description: string | null;
  amount:      number;
  fee_categories: { name: string | null } | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return json({ error: "Forbidden" }, 403);
  }

  let invoice_id = "";
  const admin = serviceClient();

  try {
    const body = await req.json() as { invoice_id?: string };
    invoice_id = body?.invoice_id ?? "";
    if (!invoice_id) return json({ error: "invoice_id required" }, 400);

    await markParentGenerating(admin, "invoice", invoice_id);

    const { data: invoice, error: invErr } = await admin
      .from("invoices")
      .select(`
        id, school_id, invoice_number, issue_date, due_date,
        total_amount, paid_amount, balance, status, notes, currency,
        students ( id, full_name, student_number,
          streams ( name, grades ( name ) ) ),
        semesters ( name, academic_years ( name ) ),
        schools ( id, name, primary_color, secondary_color, logo_url,
                  currency, address, phone, email, footer_text ),
        invoice_items (
          id, description, amount,
          fee_categories ( name )
        )
      `)
      .eq("id", invoice_id)
      .single();
    if (invErr || !invoice) throw new Error("Invoice not found");

    const schoolId = (invoice as any).school_id;
    if (!schoolId) throw new Error("school_id missing on invoice");

    const bytes = await renderInvoice(invoice as any);

    const versionNumber = await nextVersionNumber(admin, "invoice", invoice_id);
    const { pdfUrl }    = await uploadPdf(admin, {
      docType:       "invoice",
      schoolId,
      docId:         invoice_id,
      versionNumber,
      bytes,
    });
    await insertVersion(admin, {
      docType:       "invoice",
      docId:         invoice_id,
      schoolId,
      versionNumber,
      pdfUrl,
    });
    await markParentSuccess(admin, "invoice", invoice_id, pdfUrl);

    return json({ pdf_url: pdfUrl, version: versionNumber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-invoice-pdf error:", msg);
    if (invoice_id) {
      try { await markParentFailed(admin, "invoice", invoice_id, msg); }
      catch (_) { /* ignore */ }
    }
    return json({ error: msg }, 500);
  }
});

async function renderInvoice(invoice: any): Promise<Uint8Array> {
  const school   = invoice.schools;
  const student  = invoice.students;
  const semester = invoice.semesters;
  const items    = (invoice.invoice_items ?? []) as Item[];

  const currency    = invoice.currency ?? school?.currency ?? "ZMW";
  const totalAmount = Number(invoice.total_amount) || 0;
  const paidAmount  = Number(invoice.paid_amount)  || 0;
  const balance     = Number(invoice.balance)      || 0;

  const fmtDate = (d: string | null | undefined): string =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "—";

  const issuedAt = fmtDate(invoice.issue_date ?? new Date().toISOString());
  const dueDate  = invoice.due_date ? fmtDate(invoice.due_date) : null;
  const status   = (invoice.status ?? "unpaid") as string;
  const statusLabel = status.toUpperCase();

  const brand: SchoolBrand = {
    name:           school?.name           ?? "School",
    logoUrl:        school?.logo_url       ?? null,
    primaryColor:   school?.primary_color  ?? "#1B2A4A",
    secondaryColor: school?.secondary_color ?? "#E8A020",
    address:        school?.address        ?? null,
    phone:          school?.phone          ?? null,
    email:          school?.email          ?? null,
    footerText:     school?.footer_text    ?? "Fee Invoice",
  };

  const ctx = await newDoc();
  const cur = new Cursor(ctx);
  const primary   = parseHex(brand.primaryColor,   rgb(0.105, 0.165, 0.290));
  const secondary = parseHex(brand.secondaryColor, rgb(0.910, 0.627, 0.125));
  const softBg    = rgb(0.973, 0.976, 0.984);
  const warning   = rgb(0.706, 0.325, 0.035);
  const success   = rgb(0.024, 0.373, 0.275);
  const danger    = rgb(0.600, 0.106, 0.106);

  await drawHeader(ctx, cur, brand, "Fee Invoice");

  // Invoice meta strip
  cur.ensure(40);
  cur.page.drawText(`INVOICE #${invoice.invoice_number}`, {
    x: Margins.left, y: cur.y - 14,
    font: ctx.bold, size: Fonts.subheadSize, color: primary,
  });
  const metaLine2 = dueDate ? `Issued: ${issuedAt}    Due: ${dueDate}` : `Issued: ${issuedAt}`;
  cur.page.drawText(metaLine2, {
    x: Margins.left, y: cur.y - 30,
    font: ctx.regular, size: Fonts.smallSize, color: rgb(0.4, 0.4, 0.45),
  });
  const badgeW = ctx.bold.widthOfTextAtSize(statusLabel, Fonts.smallSize);
  const badgeBg = status === "paid"    ? rgb(0.82,  0.96, 0.89)
                : status === "partial" ? rgb(0.996, 0.953, 0.78)
                                       : rgb(0.996, 0.886, 0.886);
  const badgeFg = status === "paid"    ? success
                : status === "partial" ? warning
                                       : danger;
  cur.page.drawRectangle({
    x: A4.width - Margins.right - badgeW - 14, y: cur.y - 30,
    width: badgeW + 14, height: 18,
    color: badgeBg,
  });
  cur.page.drawText(statusLabel, {
    x: A4.width - Margins.right - badgeW - 7, y: cur.y - 26,
    font: ctx.bold, size: Fonts.smallSize, color: badgeFg,
  });
  cur.advance(40);

  drawInfoStrip(
    ctx, cur,
    [
      ["Student",        student?.full_name ?? "—"],
      ["Student ID",     student?.student_number ?? "—"],
      ["Grade / Stream", `${student?.streams?.grades?.name ?? "—"} · ${student?.streams?.name ?? "—"}`],
      ["Term",           `${semester?.name ?? "—"}${semester?.academic_years ? " · " + semester.academic_years.name : ""}`],
    ],
    softBg, primary,
  );

  drawSectionTitle(ctx, cur, "Fee Breakdown", primary, secondary);

  if (items.length === 0) {
    cur.ensure(18);
    cur.page.drawText("No line items.", {
      x: Margins.left, y: cur.y - 12,
      font: ctx.italic, size: Fonts.bodySize, color: rgb(0.55, 0.55, 0.6),
    });
    cur.advance(20);
  } else {
    const cols: Column<Item & { idx: number }>[] = [
      { header: "#",           width: 28,  align: "left",  format: (r) => String(r.idx) },
      { header: "Description", flex:  1,   align: "left",  format: (r) => r.fee_categories?.name ?? r.description ?? "Fee" },
      { header: `Amount (${currency})`, width: 110, align: "right", format: (r) => Number(r.amount).toLocaleString("en", { minimumFractionDigits: 2 }) },
    ];
    drawTable(
      ctx, cur, cols,
      items.map((it, i) => ({ ...it, idx: i + 1 })),
      { headerBg: primary, headerFg: rgb(1, 1, 1), altRowBg: softBg },
    );
  }

  // Summary box (right-aligned)
  const summaryW = 260;
  const summaryX = A4.width - Margins.right - summaryW;
  let rows = 1;
  if (paidAmount > 0) rows++;
  if (balance > 0)    rows++;
  const summaryH = 18 * rows + 24;

  cur.ensure(summaryH + 12);
  cur.advance(8);
  cur.page.drawRectangle({
    x: summaryX, y: cur.y - summaryH,
    width: summaryW, height: summaryH,
    color: softBg,
  });

  let sy = cur.y - 18;
  const drawSummaryRow = (label: string, value: string, opts: { bold?: boolean; color?: ReturnType<typeof rgb>; size?: number } = {}) => {
    const font  = opts.bold ? ctx.bold : ctx.regular;
    const size  = opts.size ?? Fonts.bodySize;
    const color = opts.color ?? rgb(0.1, 0.1, 0.15);
    cur.page.drawText(label, { x: summaryX + 12, y: sy, font, size, color });
    const w = font.widthOfTextAtSize(value, size);
    cur.page.drawText(value, { x: summaryX + summaryW - 12 - w, y: sy, font, size, color });
    sy -= 18;
  };

  drawSummaryRow(
    "Total Due",
    `${currency} ${totalAmount.toLocaleString("en", { minimumFractionDigits: 2 })}`,
    { bold: true, color: primary, size: Fonts.subheadSize },
  );
  if (paidAmount > 0) {
    drawSummaryRow(
      "Paid",
      `${currency} ${paidAmount.toLocaleString("en", { minimumFractionDigits: 2 })}`,
      { color: rgb(0.4, 0.4, 0.45) },
    );
  }
  if (balance > 0) {
    drawSummaryRow(
      "Outstanding Balance",
      `${currency} ${balance.toLocaleString("en", { minimumFractionDigits: 2 })}`,
      { bold: true, color: warning },
    );
  }

  cur.advance(summaryH + 8);

  // Notes
  if (invoice.notes) {
    cur.ensure(50);
    cur.page.drawRectangle({
      x: Margins.left, y: cur.y - 40,
      width: A4.width - Margins.left - Margins.right, height: 40,
      color: softBg,
    });
    cur.page.drawText("Notes", {
      x: Margins.left + 10, y: cur.y - 14,
      font: ctx.bold, size: Fonts.smallSize, color: primary,
    });
    cur.page.drawText(String(invoice.notes).slice(0, 240), {
      x: Margins.left + 10, y: cur.y - 30,
      font: ctx.regular, size: Fonts.bodySize, color: rgb(0.3, 0.3, 0.35),
      maxWidth: A4.width - Margins.left - Margins.right - 20,
    });
    cur.advance(48);
  }

  // Signature
  cur.ensure(60);
  const sigX = A4.width - Margins.right - 160;
  cur.advance(36);
  cur.page.drawLine({
    start: { x: sigX, y: cur.y },
    end:   { x: sigX + 160, y: cur.y },
    thickness: 0.8, color: rgb(0.4, 0.4, 0.45),
  });
  cur.page.drawText("Authorised by Finance Office", {
    x: sigX, y: cur.y - 12,
    font: ctx.regular, size: Fonts.smallSize, color: rgb(0.4, 0.4, 0.45),
  });

  drawFooterOnAllPages(ctx, brand);
  return new Uint8Array(await ctx.doc.save());
}
