/** HTML -> PDF with Chromium (same engine Tsenta's PDFs come from). Works with local Playwright or a serverless Chromium. */
import type { Browser } from "playwright-core";
import type { ResumeData } from "@/lib/resume/types";
import { renderResumeHtml } from "@/lib/resume/render";

export async function launchChromium(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (process.env.VERCEL) {
    const serverless = (await import("@sparticuz/chromium")).default;
    return chromium.launch({ args: serverless.args, executablePath: await serverless.executablePath(), headless: true });
  }
  return chromium.launch({ headless: true });
}

export async function resumePdf(resume: ResumeData, browser?: Browser): Promise<Buffer> {
  const own = browser ? null : await launchChromium();
  const page = await (browser ?? own!).newPage();
  try {
    await page.setContent(renderResumeHtml(resume), { waitUntil: "load" });
    return Buffer.from(await page.pdf({ format: "Letter", preferCSSPageSize: true, printBackground: true }));
  } finally {
    await page.close();
    await own?.close();
  }
}
