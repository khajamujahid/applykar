/**
 * Local dry-run of one application form. Never submits.
 * Reads the test email and career-site password from files (do not print them).
 *
 *   npx tsx scripts/account-dry-run.ts --source workday --url URL --employer Acme --out /workspace/applykar-proofs/accounts/workday-acme.png
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { applyOnPage } from "../lib/apply/browser";
import { fileMailWaiter } from "../lib/apply/file-mail";
import { sourceFromUrl, type ApplySource } from "../lib/apply/hosts";
import { defaultAnswers } from "../lib/profile/defaults";

function arg(name: string, fallback = ""): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function secret(file: string, env: string): Promise<string> {
  if (process.env[env]) return process.env[env]!;
  return (await readFile(file, "utf8")).trim();
}

async function main() {
  const url = arg("url");
  const source = (arg("source") || sourceFromUrl(url) || "") as ApplySource;
  const employer = arg("employer") || "Test employer";
  const out = arg("out") || path.join("/workspace/applykar-proofs/accounts", `${source}.png`);
  if (!url || !source) throw new Error("Need --url and a known --source");

  const email = await secret("/workspace/applykar-secrets/TEST_ATS_EMAIL", "TEST_ATS_EMAIL");
  const password = await secret("/workspace/applykar-secrets/TEST_ATS_PASSWORD", "TEST_ATS_PASSWORD");
  if (!email || !password) throw new Error("Test email or password file is missing");

  const answers = defaultAnswers().map((row) => {
    if (row.key === "email") return { ...row, answer: email };
    if (row.key === "phone") return { ...row, answer: "2025550100" };
    if (row.key === "full_name") return { ...row, answer: "Applykar Tester" };
    if (row.key === "address" || row.key === "address_line1" || row.key === "street") return { ...row, answer: row.answer.trim() || "100 Test Street" };
    if (row.key === "zip" || row.key === "postal_code" || row.key === "zip_code") return { ...row, answer: row.answer.trim() || "06037" };
    return row;
  });
  if (!answers.some((row) => row.key === "ats_password")) {
    answers.push({ key: "ats_password", question: "Career-site account password", answer: password });
  } else {
    for (const row of answers) if (row.key === "ats_password") row.answer = password;
  }

  process.env.APPLYKAR_MAIL_DIR ??= "/tmp/applykar-mail";
  await mkdir(process.env.APPLYKAR_MAIL_DIR, { recursive: true });
  await mkdir(path.dirname(out), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  const result = await applyOnPage(page, {
    url,
    source,
    employer,
    answers,
    resumeText: "Applykar Tester\nSoftware engineer. This is a test application and will not be submitted.",
    resumeFilename: "applykar-tester.txt",
    applicant: { name: "Applykar Tester", email },
    submit: false,
    verification: fileMailWaiter(),
  });
  if (result.status === "applied") throw new Error(`Dry run submitted ${url}`);
  if (result.screenshotPath && result.screenshotPath !== out) {
    const { copyFile } = await import("node:fs/promises");
    await copyFile(result.screenshotPath, out).catch(() => undefined);
  } else {
    await page.screenshot({ path: out, fullPage: true }).catch(() => undefined);
  }
  const report = {
    source,
    employer,
    url,
    status: result.status,
    missing: result.missing,
    error: result.error ?? null,
    proofNote: result.proofNote,
    filled: (result.answers ?? []).map((item) => item.question),
    proof: out,
    emailDomain: email.split("@")[1],
  };
  console.log(JSON.stringify(report, null, 2));
  await writeFile(out.replace(/\.png$/i, ".json"), JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
