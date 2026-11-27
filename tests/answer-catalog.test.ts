import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planForm } from "@/lib/apply/plan";
import { ANSWER_CATALOG, matchAnswerKey, matchOption } from "@/lib/profile/answer-catalog";
import { defaultAnswers } from "@/lib/profile/defaults";
import { syncedSource } from "../scripts/sync-extension-rules";

const cases: [string, string][] = [
  ["Are you legally authorized to work in the United States?", "work_authorization"],
  ["Will you now or in the future require sponsorship for employment visa status (e.g., H-1B)?", "sponsorship"],
  ["Are you a U.S. citizen?", "us_citizen"],
  ["Are you at least 18 years of age?", "age_18"],
  ["Have you previously worked for Acme or any of its subsidiaries?", "previous_worker"],
  ["Have you ever been employed by a federal government agency?", "government_employee"],
  ["Are you currently employed?", "currently_employed"],
  ["What is your notice period?", "availability"],
  ["How did you hear about this position?", "referral_source"],
  ["Do you have an active security clearance?", "security_clearance"],
  ["What level is your US government security clearance?", "security_clearance"],
  ["Highest level of education completed", "education_highest"],
  ["Do you have a Bachelor's degree?", "education_bachelors"],
  ["Desired salary", "salary_expectation"],
  ["What is your expected hourly rate?", "salary_hourly"],
  ["Are you willing to relocate?", "willing_to_relocate"],
  ["Are you comfortable working in a hybrid setting (3 days onsite)?", "work_arrangement"],
  ["Are you willing to travel up to 25%?", "travel"],
  ["Are you subject to a non-compete agreement?", "non_compete"],
  ["Will you consent to a background check and drug screening?", "background_check_consent"],
  ["Have you ever been convicted of a felony?", "criminal_conviction"],
  ["Are you related to any current employee of the company?", "related_to_employee"],
  ["I agree to receive text messages (SMS) about my application", "sms_consent"],
  ["Preferred First Name", "preferred_name"],
  ["Pronouns", "pronouns"],
  ["Date of Birth", "date_of_birth"],
  ["What languages do you speak?", "languages"],
  ["LinkedIn Profile", "linkedin"],
  ["GitHub URL", "github"],
  ["Portfolio / Website", "portfolio"],
  ["Phone*", "phone"],
  ["Address Line 1", "address_line1"],
  ["City", "city"],
  ["Location (City)", "location"],
  ["State", "state_region"],
  ["Postal Code", "postal_code"],
  ["Country", "country"],
  ["How many years of professional experience do you have with Python?", "years_experience"],
  ["Gender", "eeo_gender"],
  ["Are you Hispanic/Latino?", "eeo_hispanic"],
  ["Race", "eeo_race"],
  ["Veteran Status", "eeo_veteran"],
  ["Disability Status", "eeo_disability"],
  ["Sexual Orientation", "eeo_sexual_orientation"],
  ["Will you now or in the future require sponsorship for a visa to remain in your current location?", "sponsorship"],
  ["Are you currently based in the United States?", "based_in_us"],
  ["What is your current country of residence?", "country"],
  ["What is your current employment status?", "currently_employed"],
  ["Are you subject to any employment agreements and/or post-employment restrictions with your current employer?", "non_compete"],
  ["Have you previously worked at or consulted for GitLab?", "previous_worker"],
];

describe("answer catalog", () => {
  it("has unique keys and at least 50 questions", () => {
    expect(new Set(ANSWER_CATALOG.map((e) => e.key)).size).toBe(ANSWER_CATALOG.length);
    expect(defaultAnswers().length).toBeGreaterThanOrEqual(57);
  });
  it.each(cases)("maps %s", (label, key) => {
    expect(matchAnswerKey(label)).toBe(key);
  });
  it("matches custom saved questions fuzzily", () => {
    const answers = [{ key: "q_are_you_comfortable_with_on_call_rotation", question: "Are you comfortable with an on-call rotation?", answer: "Yes" }];
    expect(matchAnswerKey("Are you comfortable with on call rotations?", answers)).toBe("q_are_you_comfortable_with_on_call_rotation");
    expect(matchAnswerKey("Favorite pizza topping", answers)).toBeNull();
  });
  it("picks options for decline, yes/no and alternatives", () => {
    expect(matchOption("Prefer not to say", ["Male", "Female", "I don't wish to answer"])).toBe("I don't wish to answer");
    expect(matchOption("Prefer not to say", ["Yes", "No", "Decline to self-identify"])).toBe("Decline to self-identify");
    expect(matchOption("No. I do not need sponsorship now or in the future.", ["Yes", "No"])).toBe("No");
    expect(matchOption("Company website / Job board", ["LinkedIn", "Job Board", "Referral"])).toBe("Job Board");
    expect(matchOption("United States", ["Canada", "United States of America"])).toBe("United States of America");
  });
  it("fills yes/no selects from the defaults and flags blank phone", () => {
    const plan = planForm(
      [
        { id: "a", label: "Are you at least 18 years old?*", required: true, kind: "choice", options: ["Yes", "No"] },
        { id: "b", label: "Have you been convicted of a crime?*", required: true, kind: "choice", options: ["Yes", "No"] },
        { id: "c", label: "Phone*", required: true, kind: "text", options: [] },
        { id: "d", label: "Years of experience*", required: true, kind: "text", options: [] },
      ],
      defaultAnswers(),
      { name: "Khaja Mujahiddin Mohammed", email: "k@example.com", yearsExperience: 6 },
    );
    expect(plan.answers.map((a) => a.value)).toEqual(["Yes", "No", "6"]);
    expect(plan.missing).toEqual(["Phone"]);
  });
  it("keeps the extension rules in sync with the catalog", () => {
    const source = readFileSync("extension/page-logic.js", "utf8");
    expect(syncedSource(source)).toBe(source);
  });
});

describe("secrets and explicit keys", () => {
  it("never treats the career-site password as shareable", async () => {
    const { SECRET_ANSWER_KEYS } = await import("@/lib/profile/answer-catalog");
    expect(SECRET_ANSWER_KEYS.has("ats_password")).toBe(true);
  });
  it("maps '(saved answer key)' labels straight to that key", async () => {
    const { matchAnswerKey } = await import("@/lib/profile/answer-catalog");
    expect(matchAnswerKey("Workday account password (saved answer ats_password)")).toBe("ats_password");
  });
});
