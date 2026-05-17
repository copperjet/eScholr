/**
 * generate-receipt (v2 — pdf-lib edition)
 *
 * POST /functions/v1/generate-receipt
 * Auth:  Bearer <SERVICE_ROLE_KEY>  (called by pdf-job-runner only)
 * Body:  { finance_record_id: string }
 *
 * Pipeline:
 *   1. Mark finance_records.pdf_status='generating' on entry
 *   2. Render receipt PDF in-process with pdf-lib (no Chrome)
 *   3. Upload to receipts bucket via shared helper
 *   4. Insert pdf_versions row + flip is_current
 *   5. Mark finance_records.pdf_status='success', set pdf_url + receipt_url
 *
 * Failure flips pdf_status='failed'. Idempotency comes from the
 * unique partial index on pdf_jobs(doc_type, doc_id) — caller enqueues,
 * runner deduplicates.
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
import { Cursor, Fonts, Margins, A4, newDoc, parseHex } from "../_shared/pdf/layout.ts";
import { drawFooterOnAllPages, drawHeader, drawSectionTitle, SchoolBrand } from "../_shared/pdf/branding.ts";
import { drawInfoStrip, drawTable, Column } from "../_shared/pdf/tables.ts";

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

interface Txn {
  id:       string;
  amount:   number;
  paid_at:  string | null;
  note:     string | null;
  staff:    { full_name: string | null } | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.replace(/^Bearer\s+/i, "");
  if (token !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return json({ error: "Forbidden" }, 403);
  }

  let finance_record_id = "";
  const admin = serviceClient();

  try {
    const body = await req.json() as { finance_record_id?: string };
    finance_record_id = body?.finance_record_id ?? "";
    if (!finance_record_id) return json({ error: "finance_record_id required" }, 400);

    await markParentGenerating(admin, "receipt", finance_record_id);

    // ── Fetch data ──
    const { data: record, error: recErr } = await admin
      .from("finance_records")
      .select(`
        id, school_id, status, balance, updated_at,
        students (
          id, full_name, student_number, photo_url,
          grades ( name ), streams ( name )
        ),
        semesters ( id, name, academic_years ( name ) ),
        schools (
          id, name, primary_color, secondary_color, logo_url, currency,
          address, phone, email, footer_text
        )
      `)
      .eq("id", finance_record_id)
      .single();
    if (recErr || !record) throw new Error("Finance record not found");

    const { data: txnRows } = await admin
      .from("payment_transactions")
      .select("id, amount, paid_at, note, staff:recorded_by(full_name)")
      .eq("finance_record_id", finance_record_id)
      .order("paid_at", { ascending: false });

    const txns: Txn[] = (txnRows ?? []) as unknown as Txn[];

    const school   = (record as any).schools;
    const student  = (record as any).students;
    const semester = (record as any).semesters;
    const schoolId = (record as any).school_id;

    if (!schoolId) throw new Error("school_id missing on finance record");

    // ── Render with pdf-lib ──
    const bytes = await renderReceipt({
      record,
      txns,
      school,
      student,
      semester,
    });

    // ── Version + upload ──
    const versionNumber = await nextVersionNumber(admin, "receipt", finance_record_id);
    const { pdfUrl }    = await uploadPdf(admin, {
      docType:       "receipt",
      schoolId,
      docId:         finance_record_id,
      versionNumber,
      bytes,
    });
    await insertVersion(admin, {
      docType:        "receipt",
      docId:          finance_record_id,
      schoolId,
      versionNumber,
      pdfUrl,
    });
    await markParentSuccess(admin, "receipt", finance_record_id, pdfUrl);

    return json({ pdf_url: pdfUrl, receipt_url: pdfUrl, version: versionNumber });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("generate-receipt error:", msg);
    if (finance_record_id) {
      try { await markParentFailed(admin, "receipt", finance_record_id, msg); }
      catch (_) { /* ignore */ }
    }
    return json({ error: msg }, 500);
  }
});

interface RenderArgs {
  record:   any;
  txns:     Txn[];
  school:   any;
  student:  any;
  semester: any;
}

async function renderReceipt(args: RenderArgs): Promise<Uint8Array> {
  const { record, txns, school, student, semester } = args;
  const currency = school?.currency ?? "ZMW";
  const balance  = Number(record?.balance ?? 0);
  const totalPaid = txns.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const receiptNo = `RCP-${String(record.id).slice(0, 8).toUpperCase()}`;
  const issuedAt  = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const isPaid    = record?.status === "paid";

  const brand: SchoolBrand = {
    name:           school?.name           ?? "School",
    logoUrl:        school?.logo_url       ?? null,
    primaryColor:   school?.primary_color  ?? "#1B2A4A",
    secondaryColor: school?.secondary_color ?? "#E8A020",
    address:        school?.address        ?? null,
    phone:          school?.phone          ?? null,
    email:          school?.email          ?? null,
    footerText:     school?.footer_text    ?? "Official Payment Receipt",
  };

  const ctx = await newDoc();
  const cur = new Cursor(ctx);
  const primary   = parseHex(brand.primaryColor,   rgb(0.105, 0.165, 0.290));
  const secondary = parseHex(brand.secondaryColor, rgb(0.910, 0.627, 0.125));
  const softBg    = rgb(0.973, 0.976, 0.984);

  await drawHeader(ctx, cur, brand, "Payment Receipt");

  // Receipt meta strip
  cur.ensure(40);
  cur.page.drawText(`RECEIPT #${receiptNo}`, {
    x: Margins.left, y: cur.y - 14,
    font: ctx.bold, size: Fonts.subheadSize, color: primary,
  });
  const issued = `Issued: ${issuedAt}`;
  const issuedW = ctx.regular.widthOfTextAtSize(issued, Fonts.bodySize);
  cur.page.drawText(issued, {
    x: A4.width - Margins.right - issuedW, y: cur.y - 14,
    font: ctx.regular, size: Fonts.bodySize, color: rgb(0.4, 0.4, 0.45),
  });
  const statusLbl = isPaid ? "PAID" : "BALANCE OUTSTANDING";
  const statusW = ctx.bold.widthOfTextAtSize(statusLbl, Fonts.smallSize);
  cur.page.drawRectangle({
    x: A4.width - Margins.right - statusW - 14, y: cur.y - 32,
    width: statusW + 14, height: 16,
    color: isPaid ? rgb(0.82, 0.96, 0.89) : rgb(0.996, 0.953, 0.78),
  });
  cur.page.drawText(statusLbl, {
    x: A4.width - Margins.right - statusW - 7, y: cur.y - 28,
    font: ctx.bold, size: Fonts.smallSize,
    color: isPaid ? rgb(0.024, 0.373, 0.275) : rgb(0.573, 0.255, 0.055),
  });
  cur.advance(38);

  // Info strip
  drawInfoStrip(
    ctx, cur,
    [
      ["Student",       student?.full_name             ?? "—"],
      ["Student ID",    student?.student_number        ?? "—"],
      ["Grade / Stream", `${student?.grades?.name ?? "—"} · ${student?.streams?.name ?? "—"}`],
      ["Semester",      semester?.name                 ?? "—"],
    ],
    softBg, primary,
  );

  // Transactions
  drawSectionTitle(ctx, cur, "Payment Transactions", primary, secondary);

  if (txns.length === 0) {
    cur.ensure(18);
    cur.page.drawText("No individual transactions recorded.", {
      x: Margins.left, y: cur.y - 12,
      font: ctx.italic, size: Fonts.bodySize, color: rgb(0.55, 0.55, 0.6),
    });
    cur.advance(20);
  } else {
    const cols: Column<Txn & { idx: number }>[] = [
      { header: "#",            width: 28,  align: "left",   format: (r) => String(r.idx) },
      { header: "Date",         width: 90,  align: "left",   format: (r) => r.paid_at ? new Date(r.paid_at).toLocaleDateString("en-GB") : "—" },
      { header: "Note",         flex:  2,   align: "left",   format: (r) => r.note ?? "—" },
      { header: "Recorded By",  flex:  1.2, align: "left",   format: (r) => r.staff?.full_name ?? "—" },
      { header: `Amount (${currency})`, width: 90, align: "right", format: (r) => Number(r.amount).toLocaleString("en", { minimumFractionDigits: 2 }) },
    ];
    drawTable(
      ctx, cur, cols,
      txns.map((t, i) => ({ ...t, idx: i + 1 })),
      {
        headerBg: primary,
        headerFg: rgb(1, 1, 1),
        altRowBg: softBg,
      },
    );
  }

  // Summary box (right-aligned)
  const summaryW = 240;
  const summaryX = A4.width - Margins.right - summaryW;
  const summaryH = 78;
  cur.ensure(summaryH + 12);
  cur.advance(8);
  cur.page.drawRectangle({
    x: summaryX, y: cur.y - summaryH,
    width: summaryW, height: summaryH,
    color: softBg,
  });

  let sy = cur.y - 16;
  const drawSummaryRow = (label: string, value: string, bold = false, color = rgb(0.1, 0.1, 0.15)) => {
    const font = bold ? ctx.bold : ctx.regular;
    cur.page.drawText(label, { x: summaryX + 12, y: sy, font, size: Fonts.bodySize, color });
    const vw = font.widthOfTextAtSize(value, Fonts.bodySize);
    cur.page.drawText(value, { x: summaryX + summaryW - 12 - vw, y: sy, font, size: Fonts.bodySize, color });
    sy -= 18;
  };

  drawSummaryRow("Total Paid",   `${currency} ${totalPaid.toLocaleString("en", { minimumFractionDigits: 2 })}`);
  drawSummaryRow(
    balance > 0 ? "Outstanding Balance" : "Balance",
    `${currency} ${balance.toLocaleString("en", { minimumFractionDigits: 2 })}`,
    true,
    balance > 0 ? rgb(0.706, 0.325, 0.035) : rgb(0.024, 0.373, 0.275),
  );
  drawSummaryRow("Status", isPaid ? "Cleared" : "Pending", true, primary);

  cur.advance(summaryH + 8);

  // Signature line
  cur.ensure(60);
  const sigX = A4.width - Margins.right - 160;
  cur.advance(36);
  cur.page.drawLine({
    start: { x: sigX, y: cur.y },
    end:   { x: sigX + 160, y: cur.y },
    thickness: 0.8, color: rgb(0.4, 0.4, 0.45),
  });
  cur.page.drawText("Authorised Signature", {
    x: sigX, y: cur.y - 12,
    font: ctx.regular, size: Fonts.smallSize, color: rgb(0.4, 0.4, 0.45),
  });

  drawFooterOnAllPages(ctx, brand);
  return new Uint8Array(await ctx.doc.save());
}
