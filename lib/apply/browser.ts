import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import type { AnswerRecord } from "@/lib/domain";
import { matchOption } from "@/lib/profile/answer-catalog";
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
  /** Answers that were filled into the form (label -> value). */
  answers?: { question: string; answer: string }[];
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

async function fillControl(page: Page, id: string, value: string): Promise<void> {
  const control = controlLocator(page, id);
  const tag = await control.evaluate((node: Element) => node.tagName.toLowerCase()).catch(() => "");
  if (!tag) return;
  if (tag === "select") {
    await control.selectOption({ label: value }).catch(() => undefined);
    return;
  }
  const combo = await control.evaluate((node: Element) => node.getAttribute("role") === "combobox" || node.hasAttribute("aria-autocomplete")).catch(() => false);
  if (combo) {
    // React-select style pickers: open, then choose the matching option from the list.
    await control.click({ timeout: 3_000 }).catch(() => undefined);
    // Only this picker's open list (pages keep other hidden lists, e.g. phone country codes, in the DOM).
    const listId = await control.evaluate((node: Element) => node.getAttribute("aria-controls") || node.getAttribute("aria-owns") || "").catch(() => "");
    const optionSel = listId ? `[id="${listId}"] [role='option']` : "[role='option']:visible";
    const options = page.locator(optionSel);
    await options.first().waitFor({ timeout: 2_500 }).catch(() => undefined);
    const texts = (await options.allInnerTexts().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, " ").trim());
    // Short lists: pick directly. Long lists (countries) are filtered by typing first.
    const pick = texts.length && texts.length <= 25 ? matchOption(value, texts) : null;
    if (pick && texts.includes(pick)) {
      await options.nth(texts.indexOf(pick)).click({ timeout: 3_000 }).catch(() => undefined);
      return;
    }
    await control.fill(value).catch(() => undefined);
    const typed = page.locator(optionSel).first();
    if (await typed.waitFor({ timeout: 2_500 }).then(() => true).catch(() => false)) {
      const after = (await page.locator(optionSel).allInnerTexts().catch(() => [] as string[])).map((t) => t.replace(/\s+/g, " ").trim());
      const best = matchOption(value, after);
      await page.locator(optionSel).nth(best && after.includes(best) ? after.indexOf(best) : 0).click({ timeout: 3_000 }).catch(() => undefined);
    } else await control.press("Enter").catch(() => undefined);
    return;
  }
  await control.fill(value).catch(() => undefined);
  const current = await control.inputValue().catch(() => "");
  if (current !== value) {
    await control.click().catch(() => undefined);
    await control.pressSequentially(value, { delay: 0 }).catch(() => undefined);
  }
}

export async function applyOnPage(page: Page, request: ApplyRequest, options?: { skipNavigation?: boolean }): Promise<ApplyResult> {
  assertApplyHost(request.url, request.source);
  if (request.source === "workday" || request.source === "icims") {
    const flows = await import("@/lib/apply/ats-flows");
    return request.source === "workday" ? flows.applyWorkday(page, request) : flows.applyIcims(page, request);
  }
  if (!options?.skipNavigation) {
    await page.goto(request.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator("form label, form input").first().waitFor({ timeout: 12_000 }).catch(() => undefined);
    // React boards (Greenhouse, Ashby) re-render after hydration and wipe anything typed earlier.
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(800).catch(() => undefined);
    // SmartRecruiters / Workable / BambooHR often show a posting first; open the apply form.
    const preview = await readQuestions(page, request.source);
    const hasIdentity = preview.some((question) => /email|first name|full name|^name\b/i.test(question.label));
    if (!hasIdentity) {
      const apply = page.locator("a, button, [role='button'], input[type='button'], input[type='submit']").filter({ hasText: /interested|apply now|apply for this job|apply for this position|apply to (this )?(position|job|role)|start application|^apply$/i }).first();
      if (await apply.count()) {
        // Stay in this tab so Cloudflare / session cookies from the posting page are kept.
        await page.evaluate(() => document.querySelectorAll("a[target]").forEach((a) => a.setAttribute("target", "_self")));
        await Promise.all([
          page.waitForURL(/oneclick|application|\/apply|login/i, { timeout: 15_000 }).catch(() => undefined),
          apply.click({ force: true }),
        ]).catch(() => undefined);
        await page.locator("form label, form input, input[type='email'], input[type='text']").first().waitFor({ timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(2000).catch(() => undefined);
      }
    }
  }
  const questions = await readQuestions(page, request.source);
  if (questions.length === 0) {
    const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 4000);
    const blocked = /403 error|request could not be satisfied|attention required|cf-error|access denied|sorry, you have been blocked/i.test(text);
    const closed = /couldn'?t find anything here|no longer (available|accepting|open)|(posting|job|position) (has been |was )?(closed|filled|removed)|page not found|\b404\b/i.test(text);
    return { status: "failed", missing: [], proofNote: null, screenshotPath: null, error: blocked ? "The career site blocked the application form (Cloudflare or bot check). Open the original job link to apply." : closed ? "This job posting is closed or was removed by the employer." : "No application form was found." };
  }
  const plan = planForm(questions, request.answers, request.applicant);
  for (const answer of plan.answers) {
    if (answer.kind === "choice") {
      const inputs = page.locator(answer.id);
      const count = await inputs.count();
      for (let index = 0; index < count; index += 1) {
        const input = inputs.nth(index);
        const inputId = await input.getAttribute("id");
        const forLabel = inputId ? (await page.locator(`label[for="${inputId}"]`).first().innerText().catch(() => "")) || "" : "";
        // Lever/Recruitee wrap the radio in its label (no id); fall back to the wrapping label, then the value.
        const wrapped = forLabel ? "" : await input.evaluate((node: Element) => node.closest("label")?.textContent ?? (node as HTMLInputElement).value ?? "").catch(() => "");
        const optionText = (forLabel || wrapped).replace(/\s+/g, " ").trim();
        if (optionText.toLowerCase() === answer.value.toLowerCase()) {
          const ok = await input.check({ force: true, timeout: 5_000 }).then(() => true).catch(() => false);
          // Custom-styled boxes (Ashby) sometimes reject a direct check; click the visible label instead.
          if (!ok) await input.evaluate((node: Element) => (node.closest("label") as HTMLElement | null)?.click()).catch(() => undefined);
          break;
        }
      }
      continue;
    }
    await fillControl(page, answer.id, answer.value);
  }
  // Second pass: anything a late re-render cleared gets typed again.
  await page.waitForTimeout(1_000).catch(() => undefined);
  for (const answer of plan.answers) {
    if (answer.kind === "choice") continue;
    const control = controlLocator(page, answer.id);
    const tag = await control.evaluate((node: Element) => node.tagName.toLowerCase()).catch(() => "");
    if (!tag || tag === "select") continue;
    if (await control.evaluate((node: Element) => node.getAttribute("role") === "combobox").catch(() => false)) continue;
    const current = await control.inputValue().catch(() => answer.value);
    if (!current.trim()) await fillControl(page, answer.id, answer.value);
  }
  const filled = plan.answers.map((answer) => ({ question: answer.label, answer: answer.value }));
  if (plan.resume && request.resumeFilePath) {
    const file = page.locator("input[type='file']").first();
    if ((await file.count()) > 0) {
      await file.setInputFiles(request.resumeFilePath).catch(() => undefined);
      filled.push({ question: "Resume", answer: path.basename(request.resumeFilePath) });
    }
  } else if (plan.resume && request.resumeText.trim()) {
    const directory = path.join(os.tmpdir(), "applykar", "resumes");
    await mkdir(directory, { recursive: true });
    const filename = request.resumeFilename?.replace(/[^\w.-]+/g, "-") || "resume.txt";
    const resumePath = path.join(directory, filename.endsWith(".txt") || filename.endsWith(".pdf") || filename.endsWith(".docx") ? filename : `${filename}.txt`);
    if (resumePath.endsWith(".txt")) await writeFile(resumePath, request.resumeText);
    const file = page.locator("input[type='file']").first();
    if ((await file.count()) > 0 && resumePath.endsWith(".txt")) await file.setInputFiles(resumePath);
  }
  const shotDir = path.join(os.tmpdir(), "applykar", "proofs");
  await mkdir(shotDir, { recursive: true });
  const screenshotPath = path.join(shotDir, `${Date.now()}-${request.source}.png`);
  const formShot = page.locator("form").first();
  const shoot = async () => {
    // A form that keeps re-rendering can't be element-captured; fall back to the page, and never fail the run over a proof image.
    try {
      const ok = (await formShot.count()) > 0 && (await formShot.screenshot({ path: screenshotPath, timeout: 10_000 }).then(() => true).catch(() => false));
      if (!ok) await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 15_000 }).catch(() => undefined);
    } catch {
      /* the site may have closed the tab */
    }
  };
  const challenge = page.locator(".h-captcha, .g-recaptcha:not([data-size='invisible']), .cf-turnstile");
  if (!plan.ready || !request.submit) {
    await shoot();
    const note = !plan.ready
      ? `Filled known answers. Did not submit. Unanswered: ${plan.missing.join("; ")}`
      : "Form filled from saved answers. Submit is off.";
    return { status: plan.ready ? "ready" : "skipped", missing: plan.missing, proofNote: note, screenshotPath, answers: filled };
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
    return { status: "applied", missing: [], proofNote: after.slice(0, 500), screenshotPath, answers: filled };
  }
  return { status: "failed", missing: [], proofNote: after.slice(0, 500), screenshotPath, error: "No confirmation appeared after submit." };
}
