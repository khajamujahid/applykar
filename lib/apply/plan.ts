import type { AnswerRecord } from "@/lib/domain";
import { cleanQuestion, matchAnswerKey, matchOption } from "@/lib/profile/answer-catalog";

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
  yearsExperience?: number | null;
};

export type PlannedAnswer = {
  id: string;
  label: string;
  value: string;
  kind: "text" | "choice";
};

export { savedValue };

export type ApplyPlan = {
  ready: boolean;
  answers: PlannedAnswer[];
  missing: string[];
  resume: boolean;
};

function savedValue(answers: AnswerRecord[], key: string): string | null {
  const found = answers.find((answer) => answer.key === key);
  const value = found?.answer.trim() ?? "";
  return value.length ? value : null;
}

function identityValue(label: string, applicant: Applicant | undefined, answers: AnswerRecord[]): string | null {
  const savedName = savedValue(answers, "legal_name");
  const name = (savedName || applicant?.name || "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (/preferred|nick/i.test(label)) return null;
  if (/first name|given name/i.test(label)) return parts[0] ?? null;
  if (/last name|family name|surname/i.test(label)) return parts.length > 1 ? parts.slice(1).join(" ") : null;
  if (/^(full )?name$|^your name$|^candidate name$/i.test(label)) return name || null;
  if (/e-?mail/i.test(label) && !/consent|opt/i.test(label)) return applicant?.email.trim() || savedValue(answers, "email");
  return null;
}

/** Value for one label: identity fields, then the matching saved answer (catalog key or custom question). */
export function answerFor(label: string, answers: AnswerRecord[], applicant?: Applicant): { key: string | null; value: string | null } {
  const identity = identityValue(label, applicant, answers);
  if (identity) return { key: null, value: identity };
  const key = matchAnswerKey(label, answers);
  if (!key) return { key: null, value: null };
  let value = savedValue(answers, key);
  if (!value && key === "years_experience" && applicant?.yearsExperience != null) value = String(applicant.yearsExperience);
  if (!value && key === "location") value = savedValue(answers, "city");
  return { key, value };
}

/** Maps form labels to saved answers. Required unknowns are flagged and block submit. */
export function planForm(questions: FormQuestion[], answers: AnswerRecord[], applicant?: Applicant): ApplyPlan {
  const planned: PlannedAnswer[] = [];
  const missing: string[] = [];
  let resume = false;

  for (const question of questions) {
    const label = cleanQuestion(question.label);
    if (question.kind === "file" || /resume|curriculum vitae|\bcv\b/i.test(label)) {
      resume = true;
      continue;
    }
    const raw = answerFor(label, answers, applicant).value;
    if (!raw) {
      if (question.required) missing.push(label);
      continue;
    }
    const matched = matchOption(raw, question.options);
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
