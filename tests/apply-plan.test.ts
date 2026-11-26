import { expect, it } from "vitest";
import { chromium } from "playwright";
import { applyOnPage } from "@/lib/apply/browser";
import { planForm } from "@/lib/apply/plan";
import { serverApplySource } from "@/lib/extension/policy";
import { defaultAnswers } from "@/lib/profile/defaults";

const form = `<!doctype html><form data-ats="greenhouse">
  <label for="auth">Are you authorized to work in the United States?</label>
  <input id="auth" name="auth" />
  <label for="pizza">Favorite pizza topping</label>
  <input id="pizza" name="pizza" required />
  <button type="submit">Submit</button>
  <p id="result"></p>
</form>
<script>
document.querySelector("form").addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#result").textContent = "Application submitted";
});
</script>`;

const cleanForm = `<!doctype html><form data-ats="greenhouse">
  <label for="auth">Are you authorized to work in the United States?</label>
  <input id="auth" name="auth" />
  <button type="submit">Submit</button>
  <p id="result"></p>
</form>
<script>
document.querySelector("form").addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#result").textContent = "Application submitted " + document.querySelector("#auth").value;
});
</script>`;

it("fills the owner's name and email and leaves an optional unknown blank", () => {
  const plan = planForm(
    [
      { id: "#first_name", label: "First Name*", required: true, kind: "text", options: [] },
      { id: "#last_name", label: "Last Name*", required: true, kind: "text", options: [] },
      { id: "#email", label: "Email*", required: true, kind: "text", options: [] },
      { id: "#linkedin", label: "LinkedIn Profile", required: false, kind: "text", options: [] },
      { id: "#sponsor", label: "Will you now or in the future require sponsorship?", required: true, kind: "choice", options: ["Yes", "No"] },
    ],
    defaultAnswers(),
    { name: "Khaja Mujahiddin Mohammed", email: "khajamujahiddin@gmail.com" },
  );
  expect(plan.ready).toBe(true);
  expect(plan.missing).toEqual([]);
  expect(plan.answers).toEqual([
    { id: "#first_name", label: "First Name", value: "Khaja", kind: "text" },
    { id: "#last_name", label: "Last Name", value: "Mujahiddin Mohammed", kind: "text" },
    { id: "#email", label: "Email", value: "khajamujahiddin@gmail.com", kind: "text" },
    { id: "#sponsor", label: "Will you now or in the future require sponsorship?", value: "No", kind: "choice" },
  ]);
});

it("does not invent an answer for an unknown question", () => {
  const plan = planForm(
    [
      { id: "auth", label: "Are you authorized to work in the United States?", required: true, kind: "text", options: [] },
      { id: "pizza", label: "Favorite pizza topping", required: true, kind: "text", options: [] },
    ],
    defaultAnswers(),
  );
  expect(plan.ready).toBe(false);
  expect(plan.missing).toEqual(["Favorite pizza topping"]);
  expect(plan.answers.map((answer) => answer.id)).toEqual(["auth"]);
  expect(serverApplySource("https://www.linkedin.com/jobs/view/1")).toBeNull();
  expect(serverApplySource("https://jobs.ashbyhq.com/notion/1")).toBe("ashby");
});

it("fills a Greenhouse-style form from saved answers and skips when a question is unknown", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(form);
    const skipped = await applyOnPage(
      page,
      {
        url: "http://127.0.0.1/fixture",
        source: "greenhouse",
        employer: "Example",
        answers: defaultAnswers(),
        resumeText: "Khaja Mujahiddin Mohammed",
        submit: true,
      },
      { skipNavigation: true },
    );
    expect(skipped.status).toBe("skipped");
    expect(skipped.missing).toContain("Favorite pizza topping");
    expect(await page.locator("#result").innerText()).toBe("");

    await page.setContent(cleanForm);
    const applied = await applyOnPage(
      page,
      {
        url: "http://127.0.0.1/fixture",
        source: "greenhouse",
        employer: "Example",
        answers: defaultAnswers(),
        resumeText: "",
        submit: true,
      },
      { skipNavigation: true },
    );
    expect(applied.status).toBe("applied");
    expect(await page.locator("#result").innerText()).toContain("permanent resident");
  } finally {
    await browser.close();
  }
});
