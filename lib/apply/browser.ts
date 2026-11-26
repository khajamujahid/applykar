import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import type { AnswerRecord } from "@/lib/domain";
import { planForm, type Applicant, type FormQuestion } from "@/lib/apply/plan";
import { assertApplyHost, type ApplySource } from "@/lib/apply/hosts";

export type VerificationLookup = {
  getCode(employer: string): Promise<string | null>;
  getLink(employer: string): Promise<string | null>;
};

export type ApplyRequest = {
  url: string;
  source: ApplySource;
  employer: string;
  answers: AnswerRecord[];
  resumeText: string;
  resumeFilename?: string | null;
  resumeFilePath?: string | null;
  submit: boolean;
  applicant?: Applicant;
  verification?: VerificationLookup;
};

export type ApplyResult = {
  status: "applied" | "skipped" | "failed" | "ready";
  missing: string[];
  proofNote: string | null;
  screenshotPath: string | null;
  error?: string;
};

const readInPage = new Function(readFileSync(fileURLToPath(new URL("./read-questions.js", import.meta.url)), "utf8")) as () => FormQuestion[];

export async function readQuestions(page: Page, _source: ApplySource): Promise<FormQuestion[]> {
  return page.evaluate(readInPage);
}

function cssEscape(value: string): string {
  return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function controlLocator(page: Page, id: string) {
  if (id.startsWith("#") || id.startsWith("[") || id.includes(" ")) return page.locator(id).first();
  return page.locator(`#${cssEscape(id)}`).first();
}

export async function applyOnPage(page: Page, request: ApplyRequest, options?: { skipNavigation?: boolean }): Promise<ApplyResult> {
  assertApplyHost(request.url);
  if (request.source === "workday" || request.source === "icims") {
    const flows = await import("@/lib/apply/ats-flows");
    return request.source === "workday" ? flows.applyWorkday(page, request) : flows.applyIcims(page, request);
  }
  if (!options?.skipNavigation) {
    await page.goto(request.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator("form label, form input").first().waitFor({ timeout: 12_000 }).catch(() => undefined);
  }
  const questions = await readQuestions(page, request.source);
  if (questions.length === 0) {
    return { status: "failed", missing: [], proofNote: null, screenshotPath: null, error: "No application form was found." };
  }
  const plan = planForm(questions, request.answers, request.applicant);
  for (const answer of plan.answers) {
    if (answer.kind === "choice") {
      const inputs = page.locator(answer.id);
      const count = await inputs.count();
      for (let index = 0; index < count; index += 1) {
        const input = inputs.nth(index);
        const inputId = await input.getAttribute("id");
        const optionText = inputId
          ? ((await page.locator(`label[for="${inputId}"]`).first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim()
          : "";
        if (optionText.toLowerCase() === answer.value.toLowerCase()) {
          await input.check({ force: true });
          break;
        }
      }
      continue;
    }
    const control = controlLocator(page, answer.id);
    const tag = await control.evaluate((node: Element) => node.tagName.toLowerCase()).catch(() => "");
    if (!tag) continue;
    if (tag === "select") {
      await control.selectOption({ label: answer.value }).catch(() => undefined);
      continue;
    }
    await control.fill(answer.value).catch(() => undefined);
    const current = await control.inputValue().catch(() => "");
    if (current !== answer.value) {
      await control.click().catch(() => undefined);
      await control.pressSequentially(answer.value, { delay: 0 });
    }
  }
  if (plan.resume && request.resumeText.trim()) {
    const directory = path.join(process.cwd(), "data", "resumes");
    await mkdir(directory, { recursive: true });
    const filename = request.resumeFilename?.replace(/[^\w.-]+/g, "-") || "resume.txt";
    const resumePath = path.join(directory, filename.endsWith(".txt") || filename.endsWith(".pdf") || filename.endsWith(".docx") ? filename : `${filename}.txt`);
    if (resumePath.endsWith(".txt")) await writeFile(resumePath, request.resumeText);
    const file = page.locator("input[type='file']").first();
    if ((await file.count()) > 0 && resumePath.endsWith(".txt")) await file.setInputFiles(resumePath);
  }
  const shotDir = path.join(process.cwd(), "data", "proofs");
  await mkdir(shotDir, { recursive: true });
  const screenshotPath = path.join(shotDir, `${Date.now()}-${request.source}.png`);
  const formShot = page.locator("form").first();
  const shoot = async () => {
    if ((await formShot.count()) > 0) await formShot.screenshot({ path: screenshotPath });
    else await page.screenshot({ path: screenshotPath, fullPage: true });
  };
  const challenge = page.locator(".h-captcha, .g-recaptcha:not([data-size='invisible']), .cf-turnstile");
  if (!plan.ready || !request.submit) {
    await shoot();
    const note = !plan.ready
      ? `Filled known answers. Did not submit. Unanswered: ${plan.missing.join("; ")}`
      : "Form filled from saved answers. Submit is off.";
    return { status: plan.ready ? "ready" : "skipped", missing: plan.missing, proofNote: note, screenshotPath };
  }
  const challengeFrame = page.frames().some((frame) => {
    const url = frame.url();
    return /hcaptcha|challenges\.cloudflare|recaptcha/i.test(url) && !/size=invisible/i.test(url) && /anchor|bframe|checkbox/i.test(url);
  });
  if ((await challenge.count()) > 0 || challengeFrame) {
    await shoot();
    return {
      status: "skipped",
      missing: plan.missing,
      proofNote: null,
      screenshotPath,
      error: "The page has a verification challenge. Applykar will not bypass it.",
    };
  }
  await page.locator("button[type='submit'], input[type='submit'], button:has-text('Submit application')").first().click();
  await page.waitForTimeout(500);
  await page.waitForTimeout(2500);
  // Greenhouse emails an 8-character security code into split boxes (security-input-0..7).
  const splitCode = page.locator("input[id^='security-input-']");
  if ((await splitCode.count()) > 0 && request.verification) {
    const code = await request.verification.getCode(request.employer);
    if (!code) {
      await shoot();
      return { status: "failed", missing: [], proofNote: null, screenshotPath, error: "The form asked for an email security code that has not arrived." };
    }
    const boxes = await splitCode.count();
    for (let index = 0; index < boxes && index < code.length; index += 1) await splitCode.nth(index).fill(code[index]);
    await page.locator("button[type='submit'], input[type='submit'], button:has-text('Submit application')").first().click();
    await page.waitForTimeout(3000);
  }
  const codeField = page.locator("input[name='code'], #verification_code").first();
  if ((await codeField.count()) > 0 && request.verification) {
    let code: string | null = null;
    code = await request.verification.getCode(request.employer);
    if (!code) {
      await shoot();
      return { status: "failed", missing: [], proofNote: null, screenshotPath, error: "The form asked for a verification code that is not in the inbox." };
    }
    await codeField.fill(code);
    await page.locator("button[type='submit'], input[type='submit']").first().click();
    await page.waitForTimeout(3000);
  }
  const after = await page.locator("body").innerText();
  await shoot();
  if (/application submitted|thank you for applying|we received your application/i.test(after)) {
    return { status: "applied", missing: [], proofNote: after.slice(0, 500), screenshotPath };
  }
  return { status: "failed", missing: [], proofNote: after.slice(0, 500), screenshotPath, error: "No confirmation appeared after submit." };
}
