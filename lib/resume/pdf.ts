/** HTML -> PDF with Chromium (same engine Tsenta's PDFs come from). Works with local Playwright or a serverless Chromium. */
import type { Browser } from "playwright-core";
import type { ResumeData } from "@/lib/resume/types";
import { renderResumeHtml } from "@/lib/resume/render";

/** Put Liberation Sans into the fontconfig dir serverless Chromium reads (/tmp/fonts). */
async function installFonts(): Promise<void> {
  const { mkdir, writeFile, access } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = process.env.FONTCONFIG_PATH || "/tmp/fonts";
  await mkdir(dir, { recursive: true });
  const { LIBERATION_SANS } = await import("@/lib/resume/fonts");
  for (const [name, b64] of Object.entries(LIBERATION_SANS)) {
    const file = join(dir, name);
    if (await access(file).then(() => true, () => false)) continue;
    await writeFile(file, Buffer.from(b64, "base64"));
  }
}

export async function launchChromium(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (process.env.VERCEL) {
    const serverless = (await import("@sparticuz/chromium")).default;
    const executablePath = await serverless.executablePath();
    await installFonts();
    return chromium.launch({ args: serverless.args, executablePath, headless: true });
  }
  return chromium.launch({ headless: true });
}

export async function resumePdf(resume: ResumeData, browser?: Browser): Promise<Buffer> {
  const own = browser ? null : await launchChromium();
  const page = await (browser ?? own!).newPage();
  try {
    await page.setContent(renderResumeHtml(resume), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return Buffer.from(await page.pdf({ format: "Letter", preferCSSPageSize: true, printBackground: true }));
  } finally {
    await page.close();
    await own?.close();
  }
}
