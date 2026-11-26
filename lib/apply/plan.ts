import type { AnswerRecord } from "@/lib/domain";

export type FormQuestion = {
  id: string;
  label: string;
  required: boolean;
  kind: "text" | "file" | "choice";
  options: string[];
};

export type Applicant = {
  name: string;
  email: string;
};

export type PlannedAnswer = {
  id: string;
  label: string;
  value: string;
  kind: "text" | "choice";
};

export type ApplyPlan = {
  ready: boolean;
  answers: PlannedAnswer[];
  missing: string[];
  resume: boolean;
};

const RULES: { patterns: RegExp; key: string }[] = [
  { key: "work_authorization", patterns: /authori[sz]ed to work|work authorization|legally authori[sz]ed|eligible to work/i },
  { key: "sponsorship", patterns: /sponsor|visa|h-?1b/i },
  { key: "willing_to_relocate", patterns: /relocat/i },
  { key: "salary_expectation", patterns: /salary|compensation|pay expectation|desired pay/i },
  { key: "employment_type", patterns: /employment type|corp-?to-?corp|\bc2c\b|\bw-?2\b/i },
  { key: "availability", patterns: /start date|when can you start|available to start|availability/i },
  { key: "work_location", patterns: /where (?:can|do) you|work location|preferred location/i },
  { key: "eeo_gender", patterns: /\bgender\b/i },
  { key: "eeo_race", patterns: /race|ethnicity/i },
  { key: "eeo_veteran", patterns: /veteran/i },
  { key: "eeo_disability", patterns: /disability/i },
];

function savedValue(answers: AnswerRecord[], key: string): string | null {
  const found = answers.find((answer) => answer.key === key);
  const value = found?.answer.trim() ?? "";
  return value.length ? value : null;
}

function optionMatch(value: string, options: string[]): string | null {
  if (options.length === 0) return value;
  const exact = options.find((option) => option.trim().toLowerCase() === value.trim().toLowerCase());
  if (exact) return exact;
  const yesNo = /^(yes|no)\b/i.exec(value);
  if (yesNo?.[1]) {
    const choice = options.find((option) => option.trim().toLowerCase() === yesNo[1].toLowerCase());
    if (choice) return choice;
  }
  return null;
}

function cleanLabel(label: string): string {
  return label.replace(/[*✱]/g, "").replace(/\s+/g, " ").trim();
}

function identityValue(label: string, applicant: Applicant | undefined, answers: AnswerRecord[]): string | null {
  const savedName = savedValue(answers, "legal_name");
  const name = (savedName || applicant?.name || "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (/first name/i.test(label) && !/last|preferred/i.test(label)) return parts[0] ?? null;
  if (/last name/i.test(label)) return parts.length > 1 ? parts.slice(1).join(" ") : null;
  if (/full name|^name$/i.test(label)) return name || null;
  if (/e-?mail/i.test(label)) return applicant?.email.trim() || savedValue(answers, "email");
  if (/phone|mobile/i.test(label)) return savedValue(answers, "phone");
  if (/linkedin/i.test(label)) return savedValue(answers, "linkedin");
  if (/\bcountry\b|\blocation\b|\bcity\b/i.test(label)) {
    const saved = savedValue(answers, "work_location");
    if (!saved) return null;
    if (/united states|\busa\b/i.test(saved)) return "United States";
    return saved;
  }
  return null;
}

/** Maps form labels to saved answers. Required unknowns are flagged and block submit. */
export function planForm(questions: FormQuestion[], answers: AnswerRecord[], applicant?: Applicant): ApplyPlan {
  const planned: PlannedAnswer[] = [];
  const missing: string[] = [];
  let resume = false;

  for (const question of questions) {
    const label = cleanLabel(question.label);
    if (question.kind === "file" || /resume|curriculum vitae|\bcv\b/i.test(label)) {
      resume = true;
      continue;
    }
    const rule = RULES.find((candidate) => candidate.patterns.test(label));
    const raw = rule ? savedValue(answers, rule.key) : identityValue(label, applicant, answers);
    if (!raw) {
      if (question.required) missing.push(label);
      continue;
    }
    const matched = optionMatch(raw, question.options);
    if (!matched) {
      if (question.required) missing.push(label);
      continue;
    }
    planned.push({
      id: question.id,
      label,
      value: matched,
      kind: question.kind === "choice" ? "choice" : "text",
    });
  }

  return { ready: missing.length === 0, answers: planned, missing, resume };
}
