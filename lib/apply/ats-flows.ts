import os from "node:os";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page } from "playwright";
import { planForm, savedValue, type FormQuestion } from "@/lib/apply/plan";
import { matchOption } from "@/lib/profile/answer-catalog";
import type { ApplyRequest, ApplyResult } from "@/lib/apply/browser";

async function shot(page: Page, source: string): Promise<string> {
  const dir = path.join(os.tmpdir(), "applykar", "proofs");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${source}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

const clean = (text: string) => text.replace(/[*✱]/g, "").replace(/\s+/g, " ").trim();

/* ----------------------------------------------------------------------------------------------
 * Workday (myworkdayjobs.com). Flow: posting → Apply → Apply Manually → (account) → steps → Review.
 * Never guesses: any required field without a saved answer is reported and the flow stops.
 * -------------------------------------------------------------------------------------------- */

type WorkdayField = { container: Locator; automationId: string; label: string; required: boolean };

async function workdayFields(page: Page): Promise<WorkdayField[]> {
  const containers = page.locator("[data-automation-id^='formField-']");
  const count = await containers.count();
  const fields: WorkdayField[] = [];
  for (let i = 0; i < count; i += 1) {
    const container = containers.nth(i);
    if (!(await container.isVisible().catch(() => false))) continue;
    const automationId = (await container.getAttribute("data-automation-id")) ?? "";
    const legend = container.locator("legend").first();
    const labelText =
      ((await legend.count()) > 0 ? await legend.innerText().catch(() => "") : await container.locator("label").first().innerText().catch(() => "")) || "";
    const required = /\*/.test(labelText) || (await container.locator("[aria-required='true'], [required]").count()) > 0;
    fields.push({ container, automationId, label: clean(labelText), required });
  }
  return fields;
}

function workdayValue(field: WorkdayField, request: ApplyRequest): string | null {
  const id = field.automationId.replace("formField-", "");
  const answers = request.answers;
  const name = (savedValue(answers, "legal_name") || request.applicant?.name || "").trim().split(/\s+/);
  switch (id) {
    case "legalName--firstName":
      return name[0] || null;
    case "legalName--lastName":
      return name.length > 1 ? name.slice(1).join(" ") : null;
    case "emailAddress":
    case "email":
      return request.applicant?.email || savedValue(answers, "email");
    case "phoneNumber":
      return savedValue(answers, "phone")?.replace(/^\+?1[\s-]?/, "").replace(/\D/g, "") || null;
    case "phoneType":
      return savedValue(answers, "phone_type") ?? "Mobile";
    case "countryPhoneCode":
    case "country":
    {
      const country = savedValue(answers, "country") ?? (/united states|u\.s\.|usa/i.test(savedValue(answers, "work_authorization") ?? "") ? "United States" : null);
      return country && /^(united states|usa|us|u\.s\.a?\.?)$/i.test(country.trim()) ? "United States of America" : country;
    }
    case "addressLine1":
      return savedValue(answers, "address_line1");
    case "city":
      return savedValue(answers, "city");
    case "addressLine2":
      return savedValue(answers, "address_line2");
    case "legalName--middleName":
      return null;
    case "preferredName--firstName":
      return savedValue(answers, "preferred_name");
    case "countryRegion":
      return savedValue(answers, "state_region");
    case "postalCode":
      return savedValue(answers, "postal_code");
    case "source":
      return savedValue(answers, "referral_source");
    case "candidateIsPreviousWorker":
      return savedValue(answers, "previous_worker");
    default: {
      const plan = planForm([{ id, label: field.label, required: field.required, kind: "text", options: [] }], answers, request.applicant);
      return plan.answers[0]?.value ?? null;
    }
  }
}

async function fillWorkdayField(page: Page, field: WorkdayField, value: string): Promise<boolean> {
  const c = field.container;
  const radio = c.locator("input[type='radio']");
  if ((await radio.count()) > 0) {
    const labels = (await c.locator("label").allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter(Boolean);
    const pick = matchOption(value, labels);
    if (!pick) return false;
    const option = c.locator("label").filter({ hasText: pick }).first();
    if ((await option.count()) === 0) return false;
    await option.click({ force: true });
    return true;
  }
  const button = c.locator("button[aria-haspopup='listbox']").first();
  if ((await button.count()) > 0) {
    await button.click();
    await page.locator("[role='option']").first().waitFor({ timeout: 3000 }).catch(() => undefined);
    const texts = (await page.locator("[role='option']").allInnerTexts().catch(() => [] as string[])).map((t) => t.trim()).filter(Boolean);
    const pick = matchOption(value, texts) ?? value;
    const option = page.locator("[role='option']").filter({ hasText: pick }).first();
    if (!(await option.isVisible({ timeout: 3000 }).catch(() => false))) {
      await page.keyboard.press("Escape");
      return false;
    }
    await option.click();
    return true;
  }
  const multi = c.locator("[data-automation-id='multiselectInputContainer'] input, input[data-uxi-widget-type='selectinput']").first();
  if ((await multi.count()) > 0) {
    await multi.fill(value);
    await multi.press("Enter");
    const option = page.locator(`[data-automation-id='promptOption']:has-text("${value}"), [role='option']:has-text("${value}")`).first();
    if (!(await option.isVisible({ timeout: 4000 }).catch(() => false))) return false;
    await option.click();
    return true;
  }
  const input = c.locator("input:not([type='hidden']):not([type='checkbox']), textarea").first();
  if ((await input.count()) === 0) return false;
  await input.fill(value);
  return (await input.inputValue().catch(() => "")) === value;
}

async function fieldHasValue(field: WorkdayField): Promise<boolean> {
  const c = field.container;
  if ((await c.locator("input[type='radio']").count()) > 0) return (await c.locator("input[type='radio']:checked").count()) > 0;
  if ((await c.locator("[data-automation-id='selectedItem']").count()) > 0) return true;
  const button = c.locator("button[aria-haspopup='listbox']").first();
  if ((await button.count()) > 0) return !/select one/i.test((await button.innerText().catch(() => "")) || "Select One");
  const input = c.locator("input:not([type='hidden']):not([type='checkbox']), textarea").first();
  if ((await input.count()) > 0) return ((await input.inputValue().catch(() => "")) || "").trim().length > 0;
  return false;
}

async function fillWorkdayStep(page: Page, request: ApplyRequest): Promise<string[]> {
  const missing: string[] = [];
  for (const field of await workdayFields(page)) {
    if (await fieldHasValue(field)) continue;
    const value = workdayValue(field, request);
    if (value && (await fillWorkdayField(page, field, value).catch(() => false))) continue;
    if (field.required) missing.push(field.label || field.automationId);
  }
  const file = page.locator("input[type='file'][data-automation-id='file-upload-input-ref']").first();
  if ((await file.count()) > 0 && request.resumeFilePath) await file.setInputFiles(request.resumeFilePath).catch(() => undefined);
  return missing;
}

export async function applyWorkday(page: Page, request: ApplyRequest): Promise<ApplyResult> {
  await page.goto(request.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const apply = page.locator("[data-automation-id='adventureButton']").first();
  await apply.waitFor({ timeout: 20_000 });
  await apply.click();
  const manual = page.locator("[data-automation-id='applyManually']").first();
  if (await manual.isVisible({ timeout: 8000 }).catch(() => false)) await manual.click();
  // Serverless Chromium renders slower: wait for whichever comes first (account wall, sign-in, or the first form step).
  await page
    .locator(
      "[data-automation-id='createAccountSubmitButton'], [data-automation-id='createAccountLink'], [data-automation-id='SignInWithEmailButton'], [data-automation-id='email'], [data-automation-id='pageFooterNextButton'], [data-automation-id='bottom-navigation-next-button']",
    )
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(1500);

  // Account wall: some tenants require "Create Account" before the form.
  const createAccount = page.locator("[data-automation-id='createAccountSubmitButton'], [data-automation-id='createAccountLink'], [data-automation-id='SignInWithEmailButton']").first();
  const signInEmail = page.locator("[data-automation-id='email']").first();
  if ((await createAccount.count()) > 0 || (await signInEmail.isVisible().catch(() => false))) {
    const password = savedValue(request.answers, "ats_password");
    if (!request.submit || !password) {
      const screenshotPath = await shot(page, "workday");
      return {
        status: "skipped",
        missing: password ? [] : ["Workday account password (saved answer ats_password)"],
        proofNote: "Workday requires an account for this employer. Stopped before creating it.",
        screenshotPath,
      };
    }
    const withEmail = page.locator("[data-automation-id='SignInWithEmailButton']").first();
    if (await withEmail.isVisible().catch(() => false)) {
      await withEmail.click();
      await page.waitForTimeout(2000);
    }
    const link = page.locator("[data-automation-id='createAccountLink']").first();
    if (await link.isVisible().catch(() => false)) await link.click();
    await page.locator("[data-automation-id='email']").first().fill(request.applicant?.email ?? "");
    await page.locator("[data-automation-id='password']").first().fill(password);
    const verify = page.locator("[data-automation-id='verifyPassword']").first();
    if (await verify.isVisible().catch(() => false)) await verify.fill(password);
    const consent = page.locator("[data-automation-id='createAccountCheckbox']").first();
    if (await consent.isVisible().catch(() => false)) await consent.check({ force: true });
    await page.locator("[data-automation-id='createAccountSubmitButton'], [data-automation-id='signInSubmitButton']").first().click({ force: true });
    await page.waitForTimeout(5000);
    if (/verify your (?:email|account)|verification email/i.test(await page.locator("body").innerText())) {
      const verifyUrl = request.verification ? await request.verification.getLink(request.employer) : null;
      if (!verifyUrl) {
        return { status: "failed", missing: [], proofNote: null, screenshotPath: await shot(page, "workday"), error: "Workday sent a verification email that has not arrived yet." };
      }
      await page.goto(verifyUrl, { waitUntil: "domcontentloaded" });
      await page.goto(request.url, { waitUntil: "domcontentloaded" });
      return applyWorkday(page, { ...request, answers: request.answers });
    }
  }

  for (let step = 0; step < 10; step += 1) {
    const ready = await page
      .locator("[data-automation-id='pageFooterNextButton'], [data-automation-id='bottom-navigation-next-button']")
      .first()
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (!ready) {
      return { status: "failed", missing: [], proofNote: null, screenshotPath: await shot(page, "workday"), error: "The Workday application form did not load (no Next button). Open the original job link to apply." };
    }
    await page.locator("[data-automation-id^='formField-']").first().waitFor({ timeout: 25_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const missing = await fillWorkdayStep(page, request);
    const next = page.locator("[data-automation-id='pageFooterNextButton'], [data-automation-id='bottom-navigation-next-button']").first();
    const label = ((await next.innerText().catch(() => "")) || "").trim();
    if (missing.length || !request.submit) {
      const screenshotPath = await shot(page, "workday");
      return {
        status: missing.length ? "skipped" : "ready",
        missing,
        proofNote: missing.length ? `Filled known answers on step ${step + 1}. Did not continue. Unanswered: ${missing.join("; ")}` : `Step ${step + 1} filled. Submit is off.`,
        screenshotPath,
      };
    }
    await next.click();
    await page.waitForTimeout(3500);
    const errors = await page.locator("[data-automation-id='errorMessage'], [data-automation-id='errorBanner']").allInnerTexts().catch(() => []);
    if (errors.length) {
      return { status: "skipped", missing: errors.map(clean), proofNote: "Workday rejected the step.", screenshotPath: await shot(page, "workday") };
    }
    if (/^submit$/i.test(label)) {
      const body = await page.locator("body").innerText();
      const screenshotPath = await shot(page, "workday");
      if (/application submitted|thank you|successfully submitted/i.test(body)) return { status: "applied", missing: [], proofNote: body.slice(0, 500), screenshotPath };
      return { status: "failed", missing: [], proofNote: body.slice(0, 500), screenshotPath, error: "No confirmation after Workday submit." };
    }
  }
  return { status: "failed", missing: [], proofNote: null, screenshotPath: await shot(page, "workday"), error: "Workday flow had too many steps." };
}

/* ----------------------------------------------------------------------------------------------
 * iCIMS (careers-<tenant>.icims.com). Flow: posting → "Apply for this job online" → email login →
 * candidate profile → questions → submit. Email-first login; a verification code may be emailed.
 * -------------------------------------------------------------------------------------------- */

async function icimsFrame(page: Page) {
  const frame = page.frames().find((item) => /icims\.com/.test(item.url()) && item !== page.mainFrame());
  return frame ?? page.mainFrame();
}

export async function applyIcims(page: Page, request: ApplyRequest): Promise<ApplyResult> {
  const url = new URL(request.url);
  const match = /\/jobs\/(\d+)\//.exec(url.pathname);
  const loginUrl = match ? `${url.origin}/jobs/${match[1]}/login` : request.url;
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3000);
  let frame = await icimsFrame(page);
  const email = frame.locator("input[type='email'], input[name*='email' i], #email").first();
  if (await email.isVisible({ timeout: 8000 }).catch(() => false)) {
    await email.fill(request.applicant?.email ?? "");
    const consent = frame.locator("input[type='checkbox'][name*='accept' i], input[type='checkbox'][id*='privacy' i]").first();
    const consentRequired = (await consent.count()) > 0;
    if (!request.submit) {
      const screenshotPath = await shot(page, "icims");
      return {
        status: "ready",
        missing: [],
        proofNote: `iCIMS login filled with ${request.applicant?.email}. Stopped before Next (dry run).${consentRequired ? " A privacy consent checkbox is present." : ""}`,
        screenshotPath,
      };
    }
    if (consentRequired && !savedValue(request.answers, "privacy_consent")) {
      return { status: "skipped", missing: ["Privacy policy consent (saved answer privacy_consent)"], proofNote: null, screenshotPath: await shot(page, "icims") };
    }
    if (consentRequired) await consent.check({ force: true });
    await frame.locator("button[type='submit'], input[type='submit'], #enterEmailSubmitButton").first().click();
    await page.waitForTimeout(4000);
    frame = await icimsFrame(page);
    const code = frame.locator("input[name*='code' i], input[autocomplete='one-time-code']").first();
    if (await code.isVisible().catch(() => false)) {
      const value = request.verification ? await request.verification.getCode(request.employer) : null;
      if (!value) return { status: "failed", missing: [], proofNote: null, screenshotPath: await shot(page, "icims"), error: "iCIMS asked for an email code that has not arrived." };
      await code.fill(value);
      await frame.locator("button[type='submit'], input[type='submit']").first().click();
      await page.waitForTimeout(4000);
    }
    const password = frame.locator("input[type='password']").first();
    if (await password.isVisible().catch(() => false)) {
      const saved = savedValue(request.answers, "ats_password");
      if (!saved) return { status: "skipped", missing: ["iCIMS account password (saved answer ats_password)"], proofNote: null, screenshotPath: await shot(page, "icims") };
      await password.fill(saved);
      await frame.locator("button[type='submit'], input[type='submit']").first().click();
      await page.waitForTimeout(4000);
    }
  }
  // Profile and question pages: fill known answers, stop on unknown required ones.
  for (let step = 0; step < 8; step += 1) {
    frame = await icimsFrame(page);
    const questions = (await frame
      .locator("label")
      .evaluateAll((labels) =>
        labels
          .map((label) => {
            const target = (label as HTMLLabelElement).htmlFor;
            const control = target ? document.getElementById(target) : null;
            if (!control || (control as HTMLInputElement).type === "hidden") return null;
            const text = (label.textContent || "").trim();
            const required = /\*/.test(text) || control.getAttribute("aria-required") === "true" || (control as HTMLInputElement).required;
            const options = control.tagName === "SELECT" ? [...(control as HTMLSelectElement).options].map((o) => o.text.trim()).filter(Boolean) : [];
            const kind = (control as HTMLInputElement).type === "file" ? "file" : "text";
            return { id: `#${CSS.escape(target)}`, label: text, required, kind, options };
          })
          .filter(Boolean),
      )
      .catch(() => [])) as unknown as FormQuestion[];
    const plan = planForm(questions as FormQuestion[], request.answers, request.applicant);
    for (const answer of plan.answers) {
      const control = frame.locator(answer.id).first();
      const tag = await control.evaluate((node: Element) => node.tagName.toLowerCase()).catch(() => "");
      if (tag === "select") await control.selectOption({ label: answer.value }).catch(() => undefined);
      else if (tag) await control.fill(answer.value).catch(() => undefined);
    }
    const submitButton = frame.locator("input[type='submit'], button[type='submit']").last();
    if (!plan.ready || !request.submit || (await submitButton.count()) === 0) {
      return {
        status: plan.ready ? "ready" : "skipped",
        missing: plan.missing,
        proofNote: plan.ready ? "iCIMS step filled. Submit is off." : `Unanswered: ${plan.missing.join("; ")}`,
        screenshotPath: await shot(page, "icims"),
      };
    }
    await submitButton.click();
    await page.waitForTimeout(4000);
    const body = await page.locator("body").innerText();
    if (/thank you for applying|application (?:has been )?(?:submitted|received)|successfully applied/i.test(body)) {
      return { status: "applied", missing: [], proofNote: body.slice(0, 500), screenshotPath: await shot(page, "icims") };
    }
  }
  return { status: "failed", missing: [], proofNote: null, screenshotPath: await shot(page, "icims"), error: "iCIMS flow had too many steps." };
}
