/**
 * Shared HTML→PDF renderer.
 *
 * Connects to a remote Chrome via the puppeteer protocol. Source of
 * truth for `page.pdf` settings. Used only for the report-card
 * pipeline; invoice/receipt/transcript render directly with pdf-lib.
 *
 * Requires CHROME_WS_ENDPOINT env var (Cloudflare Browser Rendering
 * WebSocket URL). Throws if unset — we deliberately do not fall back
 * to a local launch because no Chrome binary ships in Supabase Edge.
 */
import puppeteer from "npm:puppeteer-core@22.15.0";

export interface RenderOptions {
  format?:          "A4" | "Letter";
  printBackground?: boolean;
  margin?: {
    top?:    string;
    right?:  string;
    bottom?: string;
    left?:   string;
  };
  /** Max ms to wait for setContent. Default 30s. */
  timeoutMs?: number;
}

const DEFAULTS: Required<Omit<RenderOptions, "timeoutMs">> & { timeoutMs: number } = {
  format:          "A4",
  printBackground: true,
  margin:          { top: "16mm", right: "12mm", bottom: "16mm", left: "12mm" },
  timeoutMs:       30_000,
};

export async function renderHTML(html: string, opts: RenderOptions = {}): Promise<Uint8Array> {
  const wsEndpoint = Deno.env.get("CHROME_WS_ENDPOINT");
  if (!wsEndpoint) {
    throw new Error("CHROME_WS_ENDPOINT not configured");
  }

  const cfg = { ...DEFAULTS, ...opts, margin: { ...DEFAULTS.margin, ...(opts.margin ?? {}) } };

  const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0", timeout: cfg.timeoutMs });
    const buf = await page.pdf({
      format:          cfg.format,
      printBackground: cfg.printBackground,
      margin:          cfg.margin,
    });
    return buf;
  } finally {
    // Disconnect — do NOT close, the remote browser is shared.
    await browser.disconnect().catch(() => { /* ignore */ });
  }
}
