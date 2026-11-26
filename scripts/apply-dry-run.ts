import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { applyOnPage } from "../lib/apply/browser";
import type { ApplySource } from "../lib/apply/hosts";
import { sourceFromUrl } from "../lib/apply/hosts";
import { defaultAnswers, OWNER_NAME } from "../lib/profile/defaults";

const targets = [
  ["greenhouse", "https://job-boards.greenhouse.io/airtable/jobs/7909563002"],
  ["lever", "https://jobs.lever.co/100ms/4c9f19c7-4432-4394-ba93-167319c68adc/apply"],
  ["ashby", "https://jobs.ashbyhq.com/notion/11e56782-ee28-4025-ba0e-76222b0bfcea/application"],
  ["workday", process.env.DRY_RUN_WORKDAY || "https://2020companies.wd1.myworkdayjobs.com/external_careers/job/Bronx-NY/Google-TV-Experience-Manager_REQ_116514"],
  ["icims", process.env.DRY_RUN_ICIMS || "https://careers-360care.icims.com/jobs/5699/mobile-medical-assistant/job"],
] as const;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const outDir = process.env.DRY_RUN_OUT || path.join(process.cwd(), "data", "proofs");
  await mkdir(outDir, { recursive: true });
  const summary = [];
  const only = process.env.DRY_RUN_ONLY?.split(",");
  for (const [expected, url] of targets.filter(([name]) => !only || only.includes(name))) {
    const source = sourceFromUrl(url);
    if (source !== expected) throw new Error(`Expected ${expected} for ${url}`);
    const page = await browser.newPage();
    const result = await applyOnPage(page, {
      url,
      source: source as ApplySource,
      employer: expected,
      answers: defaultAnswers(),
      resumeText: `${OWNER_NAME}\nAnalytics and data engineering.`,
      applicant: { name: OWNER_NAME, email: "khajamujahiddin@gmail.com" },
      submit: false,
    });
    if (result.status === "applied") throw new Error(`Dry run submitted ${url}`);
    let proof: string | null = null;
    if (result.screenshotPath) {
      proof = path.join(outDir, `${expected}-dry-run.png`);
      await copyFile(result.screenshotPath, proof);
    }
    const filled = await page.locator("input, textarea").evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const input = node as HTMLInputElement;
          if (input.type === "hidden" || input.type === "file") return false;
          if (input.type === "radio" || input.type === "checkbox") return input.checked;
          return (input.value || "").trim().length > 0;
        })
        .map((node) => {
          const input = node as HTMLInputElement;
          return { id: input.id || input.name, value: (input.type === "radio" || input.type === "checkbox" ? "checked" : input.value).slice(0, 80) };
        }),
    );
    summary.push({
      source,
      url,
      status: result.status,
      filled,
      missing: result.missing,
      proof,
      error: result.error ?? null,
    });
    await page.close();
  }
  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
