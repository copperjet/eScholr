/**
 * Header band, footer, school identity bar.
 * Used by every pdf-lib template so school colors stay consistent.
 */
import { rgb, RGB } from "npm:pdf-lib@1.17.1";
import { A4, Cursor, DocCtx, Margins, Fonts, drawText, parseHex, tryEmbedImage } from "./layout.ts";

export interface SchoolBrand {
  name:             string;
  logoUrl?:         string | null;
  primaryColor?:    string | null;
  secondaryColor?: string | null;
  address?:         string | null;
  phone?:           string | null;
  email?:           string | null;
  footerText?:      string | null;
}

const HEADER_HEIGHT = 84;
const FOOTER_HEIGHT = 28;

export async function drawHeader(
  ctx: DocCtx,
  cur: Cursor,
  school: SchoolBrand,
  docTitle: string,
): Promise<void> {
  cur.ensure(HEADER_HEIGHT + 16);

  const primary   = parseHex(school.primaryColor,   rgb(0.105, 0.165, 0.290));
  const secondary = parseHex(school.secondaryColor, rgb(0.910, 0.627, 0.125));

  // Top color bar
  cur.page.drawRectangle({
    x: 0, y: A4.height - 8, width: A4.width, height: 8, color: primary,
  });

  // Logo (best-effort)
  const logo = await tryEmbedImage(ctx, school.logoUrl);
  let textStartX = Margins.left;
  if (logo) {
    const targetH = 48;
    const scale   = targetH / logo.h;
    const w       = logo.w * scale;
    cur.page.drawImage(logo.image, {
      x: Margins.left,
      y: cur.y - targetH,
      width: w,
      height: targetH,
    });
    textStartX = Margins.left + w + 12;
  }

  drawText(cur.page, school.name, textStartX, cur.y - 18, {
    font: ctx.bold, size: Fonts.headingSize, color: primary,
  });

  drawText(cur.page, docTitle.toUpperCase(), textStartX, cur.y - 36, {
    font: ctx.bold, size: Fonts.subheadSize, color: secondary,
  });

  const subParts: string[] = [];
  if (school.address) subParts.push(school.address);
  if (school.phone)   subParts.push(school.phone);
  if (school.email)   subParts.push(school.email);
  if (subParts.length) {
    drawText(cur.page, subParts.join("  ·  "), textStartX, cur.y - 52, {
      font: ctx.regular, size: Fonts.smallSize, color: rgb(0.35, 0.35, 0.4),
    });
  }

  cur.advance(HEADER_HEIGHT);

  // Separator
  cur.page.drawLine({
    start: { x: Margins.left, y: cur.y },
    end:   { x: A4.width - Margins.right, y: cur.y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.88),
  });
  cur.advance(12);
}

export function drawSectionTitle(
  ctx: DocCtx,
  cur: Cursor,
  title: string,
  primary: RGB,
  secondary: RGB,
): void {
  cur.ensure(22);
  cur.page.drawRectangle({
    x: Margins.left, y: cur.y - 14,
    width: 4, height: 14, color: secondary,
  });
  drawText(cur.page, title, Margins.left + 10, cur.y - 12, {
    font: ctx.bold, size: Fonts.subheadSize, color: primary,
  });
  cur.advance(20);
}

export function drawFooterOnAllPages(ctx: DocCtx, school: SchoolBrand): void {
  const pages = ctx.doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    p.drawLine({
      start: { x: Margins.left, y: FOOTER_HEIGHT },
      end:   { x: A4.width - Margins.right, y: FOOTER_HEIGHT },
      thickness: 0.5, color: rgb(0.85, 0.85, 0.88),
    });
    if (school.footerText) {
      p.drawText(school.footerText, {
        x: Margins.left, y: FOOTER_HEIGHT - 12,
        size: Fonts.smallSize, font: ctx.regular, color: rgb(0.5, 0.5, 0.55),
      });
    }
    const pageLabel = `Page ${i + 1} of ${pages.length}`;
    const w = ctx.regular.widthOfTextAtSize(pageLabel, Fonts.smallSize);
    p.drawText(pageLabel, {
      x: A4.width - Margins.right - w, y: FOOTER_HEIGHT - 12,
      size: Fonts.smallSize, font: ctx.regular, color: rgb(0.5, 0.5, 0.55),
    });
  }
}
