/**
 * Table primitives for pdf-lib templates.
 * Supports column widths, alignment, header band, alt-row striping,
 * automatic page breaks via the Cursor.
 */
import { rgb, RGB } from "npm:pdf-lib@1.17.1";
import { A4, Cursor, DocCtx, Fonts, Margins } from "./layout.ts";

export type Align = "left" | "right" | "center";

export interface Column<Row> {
  header:   string;
  /** Fixed width in points. */
  width?:   number;
  /** Flex weight; share of remaining space after fixed columns. */
  flex?:    number;
  align?:   Align;
  format:   (row: Row) => string;
}

export interface TableOpts {
  headerBg:   RGB;
  headerFg:   RGB;
  altRowBg?:  RGB;
  rowHeight?: number;
}

const ROW_DEFAULT_HEIGHT = 22;
const CELL_PAD_X         = 6;

function totalContentWidth(): number {
  return A4.width - Margins.left - Margins.right;
}

function resolveWidths<Row>(cols: Column<Row>[]): number[] {
  const total   = totalContentWidth();
  const fixed   = cols.reduce((acc, c) => acc + (c.width ?? 0), 0);
  const flexSum = cols.reduce((acc, c) => acc + (c.flex  ?? 0), 0);
  const remaining = Math.max(0, total - fixed);
  return cols.map((c) =>
    c.width !== undefined
      ? c.width
      : flexSum > 0
        ? ((c.flex ?? 1) / flexSum) * remaining
        : remaining / cols.length
  );
}

export function drawTable<Row>(
  ctx: DocCtx,
  cur: Cursor,
  cols: Column<Row>[],
  rows: Row[],
  opts: TableOpts,
): void {
  const widths = resolveWidths(cols);
  const rowH   = opts.rowHeight ?? ROW_DEFAULT_HEIGHT;

  // Header
  cur.ensure(rowH + 4);
  cur.page.drawRectangle({
    x: Margins.left, y: cur.y - rowH,
    width: totalContentWidth(), height: rowH,
    color: opts.headerBg,
  });
  let xCursor = Margins.left;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const w   = widths[i];
    const text = col.header;
    const textW = ctx.bold.widthOfTextAtSize(text, Fonts.bodySize);
    let drawX = xCursor + CELL_PAD_X;
    if (col.align === "right")  drawX = xCursor + w - CELL_PAD_X - textW;
    if (col.align === "center") drawX = xCursor + (w - textW) / 2;
    cur.page.drawText(text, {
      x: drawX, y: cur.y - rowH + 6,
      size: Fonts.bodySize, font: ctx.bold, color: opts.headerFg,
    });
    xCursor += w;
  }
  cur.advance(rowH);

  // Body
  for (let r = 0; r < rows.length; r++) {
    cur.ensure(rowH);

    if (opts.altRowBg && r % 2 === 1) {
      cur.page.drawRectangle({
        x: Margins.left, y: cur.y - rowH,
        width: totalContentWidth(), height: rowH,
        color: opts.altRowBg,
      });
    }

    xCursor = Margins.left;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const w   = widths[i];
      const raw = col.format(rows[r]) ?? "";
      const text = String(raw);
      const textW = ctx.regular.widthOfTextAtSize(text, Fonts.bodySize);
      let drawX = xCursor + CELL_PAD_X;
      if (col.align === "right")  drawX = xCursor + w - CELL_PAD_X - textW;
      if (col.align === "center") drawX = xCursor + (w - textW) / 2;
      cur.page.drawText(text, {
        x: drawX, y: cur.y - rowH + 6,
        size: Fonts.bodySize, font: ctx.regular, color: rgb(0.12, 0.12, 0.15),
      });
      xCursor += w;
    }

    // Row separator
    cur.page.drawLine({
      start: { x: Margins.left,                              y: cur.y - rowH },
      end:   { x: Margins.left + totalContentWidth(),        y: cur.y - rowH },
      thickness: 0.4, color: rgb(0.88, 0.88, 0.92),
    });

    cur.advance(rowH);
  }
}

/**
 * Draw a single-row labelled-value strip (e.g. student info block).
 */
export function drawInfoStrip(
  ctx: DocCtx,
  cur: Cursor,
  pairs: Array<[label: string, value: string]>,
  bg: RGB,
  labelColor: RGB,
): void {
  const stripH = 38;
  cur.ensure(stripH + 6);
  cur.page.drawRectangle({
    x: Margins.left, y: cur.y - stripH,
    width: totalContentWidth(), height: stripH,
    color: bg,
  });

  const colW = totalContentWidth() / Math.max(1, pairs.length);
  for (let i = 0; i < pairs.length; i++) {
    const [label, value] = pairs[i];
    const x = Margins.left + i * colW + 10;
    cur.page.drawText(label.toUpperCase(), {
      x, y: cur.y - 14,
      size: Fonts.smallSize - 1, font: ctx.bold, color: labelColor,
    });
    cur.page.drawText(value ?? "—", {
      x, y: cur.y - 30,
      size: Fonts.bodySize, font: ctx.regular, color: rgb(0.1, 0.1, 0.15),
    });
  }
  cur.advance(stripH + 8);
}
