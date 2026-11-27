import type { AnswerRecord } from "@/lib/domain";

/**
 * Every common application question (Workday, iCIMS, Greenhouse, Lever, Ashby, SmartRecruiters, ...), answered once.
 * Order matters: the first entry whose pattern matches a form label wins, so specific questions come before general ones.
 * extension/page-logic.js carries a generated copy of the patterns (scripts/sync-extension-rules.ts; a test checks it).
 */
export type AnswerGroup = "Contact" | "Work eligibility" | "Job preferences" | "Background" | "Education" | "Voluntary disclosures (EEO)";

export type CatalogEntry = {
  key: string;
  group: AnswerGroup;
  label: string;
  question: string;
  answer: string;
  match: RegExp;
};

export const ANSWER_GROUPS: AnswerGroup[] = ["Contact", "Work eligibility", "Job preferences", "Background", "Education", "Voluntary disclosures (EEO)"];

const DECLINE = "Prefer not to say";

export const ANSWER_CATALOG: CatalogEntry[] = [
  // Contact
  { key: "legal_name", group: "Contact", label: "Legal name", question: "Full legal name", answer: "Khaja Mujahiddin Mohammed", match: /full legal name|^legal name$|signature|sign your name/i },
  { key: "preferred_name", group: "Contact", label: "Preferred name", question: "Preferred name", answer: "Khaja", match: /preferred (first )?name|nick ?name|name you (go by|prefer)/i },
  { key: "pronouns", group: "Contact", label: "Pronouns", question: "Pronouns", answer: DECLINE, match: /pronoun/i },
  { key: "sms_consent", group: "Contact", label: "Text message consent", question: "Do you consent to receive text messages about your application?", answer: "Yes", match: /text messag|\bsms\b|receive texts|opt.?in to (text|messages)/i },
  { key: "phone_type", group: "Contact", label: "Phone type", question: "Phone device type", answer: "Mobile", match: /phone (device )?type|type of phone/i },
  { key: "phone", group: "Contact", label: "Phone", question: "Phone number", answer: "", match: /phone|mobile|cell/i },
  { key: "address_line1", group: "Contact", label: "Street address", question: "Street address (line 1)", answer: "", match: /address line ?1|street address|^address$|home address|mailing address|current address|residential address/i },
  { key: "address_line2", group: "Contact", label: "Address line 2", question: "Address line 2 (apt, suite)", answer: "", match: /address line ?2|apartment|\bapt\b|\bsuite\b/i },
  { key: "location", group: "Contact", label: "Current location", question: "Current location (city, state)", answer: "Berlin, Connecticut, United States", match: /^location\b|current location|where are you (currently )?(located|based)|location \(city\)/i },
  { key: "city", group: "Contact", label: "City", question: "City", answer: "Berlin", match: /\bcity\b|\btown\b/i },
  { key: "state_region", group: "Contact", label: "State", question: "State", answer: "Connecticut", match: /^state\b|state\/province|province|^region$|state of residence/i },
  { key: "postal_code", group: "Contact", label: "ZIP code", question: "ZIP / postal code", answer: "", match: /postal|\bzip\b/i },
  { key: "country", group: "Contact", label: "Country", question: "Country of residence", answer: "United States", match: /^country$|country of residence|^country \(|current country|^country\/region$/i },
  { key: "linkedin", group: "Contact", label: "LinkedIn", question: "LinkedIn profile URL", answer: "https://www.linkedin.com/in/mujahiddin-md-6b21b1390", match: /linked ?in/i },
  { key: "github", group: "Contact", label: "GitHub", question: "GitHub profile URL", answer: "https://github.com/khajamujahid", match: /git ?hub/i },
  { key: "portfolio", group: "Contact", label: "Portfolio / website", question: "Portfolio or personal website", answer: "https://portfolio-one-theta-71.vercel.app", match: /portfolio|personal (web)?site|^website|website url|\bblog\b|other (website|link|url)/i },

  // Work eligibility
  { key: "age_18", group: "Work eligibility", label: "18 or older", question: "Are you at least 18 years old?", answer: "Yes", match: /\b18\b.*(years|older|age)|over 18|at least 18|age of 18|\b18\+|legal (working )?age|age of majority/i },
  { key: "sponsorship", group: "Work eligibility", label: "Needs sponsorship", question: "Will you now or in the future require visa sponsorship?", answer: "No. I do not need sponsorship now or in the future.", match: /sponsor|h-?1b/i },
  { key: "us_citizen", group: "Work eligibility", label: "U.S. citizen", question: "Are you a U.S. citizen?", answer: "No. I am a U.S. lawful permanent resident (Green Card holder).", match: /\bu\.?\s?s\.? citizen|united states citizen|are you a citizen|citizenship status/i },
  { key: "immigration_status", group: "Work eligibility", label: "Work authorization type", question: "What is your current work authorization / immigration status?", answer: "U.S. Permanent Resident (Green Card)", match: /immigration status|visa status|current (work )?(authori[sz]ation|visa|immigration) status|type of (work )?(authori[sz]ation|visa)|authori[sz]ation (type|status)/i },
  { key: "work_authorization", group: "Work eligibility", label: "Authorized to work in the U.S.", question: "Are you legally authorized to work in the United States?", answer: "Yes. I am a U.S. lawful permanent resident (Green Card holder).", match: /authori[sz]ed to work|work authori[sz]ation|legally (authori[sz]ed|eligible|permitted)|eligible to work|right to work|employment eligibility/i },
  { key: "based_in_us", group: "Work eligibility", label: "Based in the U.S.", question: "Are you currently based in the United States?", answer: "Yes", match: /(currently )?(based|located|residing|reside|living|live) in the (united states|u\.?s\.?a?\b)|u\.?s\.?[- ]based/i },
  { key: "security_clearance", group: "Work eligibility", label: "Security clearance", question: "Do you have an active U.S. security clearance?", answer: "No active clearance", match: /clearance/i },

  // Job preferences
  { key: "interview_preference", group: "Job preferences", label: "Interview preference", question: "Interview format preference", answer: "Remote / virtual interviews preferred", match: /interview (format|preference|availability)|virtual interview/i },
  { key: "availability", group: "Job preferences", label: "Start date / notice", question: "When can you start? (notice period)", answer: "Immediately", match: /start date|when can you start|available to (start|begin)|begin work|availability|notice period|earliest (start|date|available)|how soon/i },
  { key: "salary_hourly", group: "Job preferences", label: "Hourly rate (C2C)", question: "Desired hourly / C2C rate", answer: "$65 per hour or higher (C2C)", match: /hourly|per hour|bill rate|\brate\b/i },
  { key: "salary_expectation", group: "Job preferences", label: "Desired salary", question: "Desired salary", answer: "$95,000–$120,000 per year (or C2C at $65/hr+)", match: /salary|compensation|pay expectation|desired pay|expected pay|pay range|\bwages?\b/i },
  { key: "employment_type", group: "Job preferences", label: "Employment type", question: "What type of employment are you looking for?", answer: "I prefer corp-to-corp (C2C). I skip W-2-only roles.", match: /employment type|type of employment|corp-?to-?corp|\bc2c\b|\bw-?2\b|\b1099\b|contract or full|engagement type/i },
  { key: "willing_to_relocate", group: "Job preferences", label: "Willing to relocate", question: "Are you willing to relocate?", answer: "Yes", match: /relocat/i },
  { key: "work_location", group: "Job preferences", label: "Where you can work", question: "Where can you work?", answer: "United States only.", match: /where (can|do|would) you (like to )?work|work location|preferred location|location preference/i },
  { key: "work_arrangement", group: "Job preferences", label: "Remote / hybrid / onsite", question: "Are you open to remote, hybrid or onsite work?", answer: "Yes, open to remote, hybrid or onsite (remote preferred)", match: /remote|hybrid|on-?site|in[- ]office|in the office|commut|work arrangement|workplace type/i },
  { key: "travel", group: "Job preferences", label: "Willing to travel", question: "Are you willing to travel?", answer: "Yes, some travel is fine", match: /travel/i },
  { key: "years_experience", group: "Job preferences", label: "Years of experience", question: "How many years of experience do you have? (blank = from your profile)", answer: "", match: /years of (professional |relevant |related |total |work )?experience|how many years/i },
  { key: "referral_source", group: "Job preferences", label: "How did you hear", question: "How did you hear about this job?", answer: "Company website / Job board", match: /how did you (hear|find|learn)|hear about (us|this)|^source$|referral source|where did you (find|see|learn)/i },

  // Background
  { key: "government_employee", group: "Background", label: "Government employee history", question: "Have you ever been employed by a government agency?", answer: "No", match: /government (employee|employment|official|agency)|federal (employee|government|agency)|public sector|worked for (the |a )?(u\.?s\.? |federal |state )?government/i },
  { key: "previous_worker", group: "Background", label: "Worked here before", question: "Have you previously worked for this company?", answer: "No", match: /previously (been )?(employed|worked)|former employee|current or former|worked (for|at|with) .{0,60}(before|previously)|ever (been )?(employed|worked) (by|for|at)|been employed by .{0,60}before|have you worked (for|at)/i },
  { key: "currently_employed", group: "Background", label: "Currently employed", question: "Are you currently employed?", answer: "Yes", match: /currently employed|presently employed|are you (currently )?employed|current employment status/i },
  { key: "related_to_employee", group: "Background", label: "Related to an employee", question: "Are you related to anyone who works here?", answer: "No", match: /related to (an?y? )?(current )?(employee|anyone)|relatives?|family members?.{0,40}(employ|work)/i },
  { key: "non_compete", group: "Background", label: "Non-compete / agreements", question: "Are you bound by a non-compete or other agreement?", answer: "No", match: /non-?compete|non-?solicit|restrictive covenant|agreement.{0,60}(prevent|restrict|limit)|bound by/i },
  { key: "criminal_conviction", group: "Background", label: "Criminal conviction", question: "Have you ever been convicted of a crime?", answer: "No", match: /convicted|conviction|felony|misdemeanor|criminal/i },
  { key: "background_check_consent", group: "Background", label: "Background check / drug test", question: "Will you consent to a background check and drug test?", answer: "Yes", match: /background (check|screen|investigation)|drug (test|screen)/i },
  { key: "privacy_consent", group: "Background", label: "Privacy / data consent", question: "Do you agree to the privacy notice and data processing?", answer: "Yes", match: /privacy (policy|notice|statement)|data (processing|privacy)|consent to (the )?(processing|collection)|gdpr|(store|process|retain)( and process)? my (personal )?(data|information)/i },
  { key: "date_of_birth", group: "Background", label: "Date of birth (only if asked)", question: "Date of birth", answer: "January 20, 1989", match: /date of birth|birth ?date|\bdob\b/i },
  { key: "english", group: "Background", label: "English proficiency", question: "Are you fluent in English?", answer: "Yes", match: /english/i },
  { key: "languages", group: "Background", label: "Languages", question: "Which languages do you speak?", answer: "English", match: /languages? (do )?you (speak|know)|spoken languages?|what languages|language proficiency|languages spoken/i },

  // Education
  { key: "education_highest", group: "Education", label: "Highest education", question: "Highest level of education", answer: "Master's degree – M.S. in Data Science, University of New Haven", match: /highest (level of )?(education|degree)|education level|level of education|degree (obtained|earned|completed)|master/i },
  { key: "education_bachelors", group: "Education", label: "Bachelor's degree", question: "Bachelor's degree", answer: "B.Tech in Computer Science (May 2012)", match: /bachelor|undergrad/i },
  { key: "field_of_study", group: "Education", label: "Field of study", question: "Field of study / major", answer: "Data Science", match: /field of study|discipline|\bmajor\b/i },
  { key: "school", group: "Education", label: "School", question: "School / university", answer: "University of New Haven", match: /school|university|college|institution/i },
  { key: "graduation_year", group: "Education", label: "Graduation year", question: "Graduation date (highest degree)", answer: "May 2025", match: /graduat/i },

  // EEO
  { key: "eeo_gender", group: "Voluntary disclosures (EEO)", label: "Gender", question: "Gender", answer: DECLINE, match: /\bgender\b|\bsex\b/i },
  { key: "eeo_transgender", group: "Voluntary disclosures (EEO)", label: "Transgender", question: "Do you identify as transgender?", answer: DECLINE, match: /transgender/i },
  { key: "eeo_sexual_orientation", group: "Voluntary disclosures (EEO)", label: "Sexual orientation", question: "Sexual orientation", answer: DECLINE, match: /sexual orientation|lgbt/i },
  { key: "eeo_hispanic", group: "Voluntary disclosures (EEO)", label: "Hispanic or Latino", question: "Are you Hispanic or Latino?", answer: DECLINE, match: /hispanic|latin[oax]/i },
  { key: "eeo_race", group: "Voluntary disclosures (EEO)", label: "Race / ethnicity", question: "Race or ethnicity", answer: DECLINE, match: /\brace\b|ethnic/i },
  { key: "eeo_veteran", group: "Voluntary disclosures (EEO)", label: "Veteran status", question: "Veteran status", answer: DECLINE, match: /veteran|military/i },
  { key: "eeo_disability", group: "Voluntary disclosures (EEO)", label: "Disability status", question: "Disability status", answer: DECLINE, match: /disabilit/i },
];

/** Matching order: yes/no and preference questions first, so e.g. "sponsorship ... in your current location" never hits the location field. */
const MATCH_GROUPS: AnswerGroup[] = ["Work eligibility", "Background", "Voluntary disclosures (EEO)", "Job preferences", "Education", "Contact"];
export const MATCH_ORDER: CatalogEntry[] = MATCH_GROUPS.flatMap((g) => ANSWER_CATALOG.filter((e) => e.group === g));

export const CATALOG_KEYS = new Set(ANSWER_CATALOG.map((e) => e.key));

/** Saved answers that are secrets: never returned to the extension, MCP clients or the AI assistant. */
export const SECRET_ANSWER_KEYS = new Set(["ats_password"]);

/** Keys that hold secrets or are edited elsewhere (Personal info form); never listed as questions. */
export const HIDDEN_ANSWER_KEYS = new Set(["ats_password", "full_name", "email", "remote", "job_type"]);

export function catalogDefaults(): AnswerRecord[] {
  return ANSWER_CATALOG.map(({ key, question, answer }) => ({ key, question, answer }));
}

export function catalogEntry(key: string): CatalogEntry | undefined {
  return ANSWER_CATALOG.find((e) => e.key === key);
}

/** Stable key for a question that is not in the catalog (custom / auto-saved). */
export function customAnswerKey(question: string): string {
  return `q_${question.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60)}`;
}

export function cleanQuestion(label: string): string {
  return label.replace(/[*✱]/g, "").replace(/\s+/g, " ").replace(/\(required\)|\(optional\)/gi, "").trim();
}

const STOP = new Set("a an the of to for in on at and or you your are is do does did have has will would be been with this our we us any please what which who how if".split(" "));

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOP.has(t))
      .map((t) => t.replace(/(ing|ed|s)$/, "")),
  );
}

/** Token overlap (0..1) between two questions, for matching custom saved answers to form labels. */
export function similarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / Math.max(x.size, y.size);
}

/** Which saved-answer key a form label maps to: catalog pattern first, then the closest custom question. */
export function matchAnswerKey(label: string, answers: AnswerRecord[] = []): string | null {
  const explicit = /\(saved answer ([a-z0-9_]+)\)/i.exec(label);
  if (explicit) return explicit[1];
  const text = cleanQuestion(label);
  if (!text) return null;
  const custom = answers.filter((a) => !CATALOG_KEYS.has(a.key));
  const norm = (s: string) => cleanQuestion(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const exact = custom.find((a) => norm(a.question) === norm(text) || a.key === customAnswerKey(text));
  const entry = MATCH_ORDER.find((e) => e.match.test(text));
  // A blank custom question saved before the catalog covered it must not hide the catalog answer.
  if (exact && (exact.answer.trim() || !entry)) return exact.key;
  if (entry) return entry.key;
  let best: { key: string; score: number } | null = null;
  for (const a of custom) {
    const score = similarity(a.question, text);
    if (score >= 0.6 && (!best || score > best.score)) best = { key: a.key, score };
  }
  return best?.key ?? null;
}

const DECLINE_RE = /prefer not|decline|don'?t wish|do not wish|not wish to|choose not|not to (say|answer|disclose|self)|do not want|don'?t want|rather not|not disclose/i;

/** Pick the form option that corresponds to a saved answer (exact, yes/no, decline-to-answer, alternatives, containment). */
export function matchOption(value: string, options: string[]): string | null {
  const opts = options.map((o) => o.trim()).filter(Boolean);
  if (opts.length === 0) return value;
  // A lone checkbox ("By checking this box, I agree…") is ticked for an affirmative answer.
  if (opts.length === 1 && /^(yes|y|true|i agree|agree|accept|acknowledge)/i.test(value.trim())) return opts[0]!;
  const low = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const alts = [value, ...value.split(/\s*(?:\/|;|\bor\b|–|—|\(|\))\s*/i)].map((s) => s.trim()).filter((s) => s.length > 0);
  for (const alt of alts) {
    const exact = opts.find((o) => low(o) === low(alt));
    if (exact) return exact;
  }
  if (DECLINE_RE.test(value)) {
    const decline = opts.find((o) => DECLINE_RE.test(o) || /not (specified|declared|listed)|^i don'?t know/i.test(o));
    if (decline) return decline;
  }
  const yesNo = /^(yes|no)\b/i.exec(value.trim());
  if (yesNo) {
    const word = yesNo[1].toLowerCase();
    const choice = opts.find((o) => low(o) === word) ?? opts.find((o) => new RegExp(`^${word}\\b`, "i").test(o.trim()));
    if (choice) return choice;
  }
  for (const alt of alts) {
    const a = low(alt);
    if (a.length < 3) continue;
    const hit = opts.find((o) => low(o).length >= 3 && (low(o).includes(a) || a.includes(low(o))));
    if (hit) return hit;
  }
  return null;
}
