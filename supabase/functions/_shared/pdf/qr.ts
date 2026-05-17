/**
 * QR helper for verification stamps (reports only today, but
 * exposed so future docs can opt in).
 */
import QRCode from "npm:qrcode@1.5.3";
import { DocCtx } from "./layout.ts";

/**
 * Returns a PDF-embeddable PNG image of `data` encoded as a QR code,
 * or null if encoding fails.
 */
export async function embedQR(
  ctx: DocCtx,
  data: string,
  pixelWidth = 144,
): Promise<{ image: Awaited<ReturnType<typeof ctx.doc.embedPng>>; w: number; h: number } | null> {
  try {
    const dataUrl = await QRCode.toDataURL(data, {
      errorCorrectionLevel: "M",
      margin: 1,
      width:  pixelWidth,
    });
    const base64 = dataUrl.split(",")[1];
    const bytes  = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const image  = await ctx.doc.embedPng(bytes);
    return { image, w: image.width, h: image.height };
  } catch (_) {
    return null;
  }
}
