/**
 * pdf-lib layout primitives.
 * Page setup, fonts, margins, color parsing, image embedding.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, RGB } from "npm:pdf-lib@1.17.1";

export const A4 = { width: 595.28, height: 841.89 } as const;

export const Margins = { top: 48, right: 40, bottom: 48, left: 40 } as const;

export const Fonts = {
  bodySize:    10,
  smallSize:   8.5,
  headingSize: 16,
  subheadSize: 12,
  lineHeight:  1.35,
} as const;

export interface DocCtx {
  doc:     PDFDocument;
  regular: PDFFont;
  bold:    PDFFont;
  italic:  PDFFont;
}

export async function newDoc(): Promise<DocCtx> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic  = await doc.embedFont(StandardFonts.HelveticaOblique);
  return { doc, regular, bold, italic };
}

export function newPage(ctx: DocCtx): PDFPage {
  return ctx.doc.addPage([A4.width, A4.height]);
}

/**
 * Cursor encapsulates current page + Y position. Auto-advances to a
 * new page when content would overflow the bottom margin.
 */
export class Cursor {
  page: PDFPage;
  y:    number;
  constructor(private ctx: DocCtx, page?: PDFPage) {
    this.page = page ?? newPage(ctx);
    this.y    = A4.height - Margins.top;
  }
  ensure(spaceNeeded: number): void {
    if (this.y - spaceNeeded < Margins.bottom) {
      this.page = newPage(this.ctx);
      this.y    = A4.height - Margins.top;
    }
  }
  advance(dy: number): void {
    this.y -= dy;
  }
}

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function parseHex(hex: string | null | undefined, fallback: RGB = rgb(0.1, 0.1, 0.1)): RGB {
  if (!hex) return fallback;
  const m = HEX_RE.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
}

/**
 * Embed a remote PNG/JPG. Returns null on failure (logo URL down,
 * wrong content-type, etc.) — caller decides whether to omit.
 */
export async function tryEmbedImage(
  ctx: DocCtx,
  url: string | null | undefined,
): Promise<{ image: Awaited<ReturnType<typeof ctx.doc.embedPng>>; w: number; h: number } | null> {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const ct    = (resp.headers.get("content-type") ?? "").toLowerCase();
    const image = ct.includes("jpeg") || ct.includes("jpg")
      ? await ctx.doc.embedJpg(bytes)
      : await ctx.doc.embedPng(bytes);
    return { image, w: image.width, h: image.height };
  } catch (_) {
    return null;
  }
}

export function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  opts: { font: PDFFont; size?: number; color?: RGB; maxWidth?: number } ,
): void {
  page.drawText(text ?? "", {
    x,
    y,
    size:  opts.size  ?? Fonts.bodySize,
    font:  opts.font,
    color: opts.color ?? rgb(0.1, 0.1, 0.1),
    maxWidth: opts.maxWidth,
  });
}
