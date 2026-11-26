import type { Enrichment, Seniority, UsScope, Workplace } from "@/lib/domain";
import { SENIORITIES, US_SCOPES, WORKPLACES } from "@/lib/domain";
import type { AiProvider } from "@/lib/ai/provider";

type LlmEnrichment = Partial<
  Pick<Enrichment, "seniority" | "yoeMin" | "workplace" | "usScope" | "salary" | "skillTags">
>;

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export function parseLlmEnrichment(raw: string): LlmEnrichment | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const salary = record.salary;
  const salaryRecord = salary && typeof salary === "object" ? (salary as Record<string, unknown>) : null;
  return {
    seniority: oneOf<Seniority>(record.seniority, SENIORITIES) ?? undefined,
    yoeMin: typeof record.yoeMin === "number" && record.yoeMin > 0 && record.yoeMin <= 20 ? record.yoeMin : undefined,
    workplace: oneOf<Workplace>(record.workplace, WORKPLACES) ?? undefined,
    usScope: oneOf<UsScope>(record.usScope, US_SCOPES) ?? undefined,
    salary: salaryRecord
      ? {
          min: typeof salaryRecord.min === "number" ? salaryRecord.min : null,
          max: typeof salaryRecord.max === "number" ? salaryRecord.max : null,
          currency: "USD",
          interval: salaryRecord.interval === "hour" ? "hour" : salaryRecord.interval === "year" ? "year" : null,
        }
      : undefined,
    skillTags: Array.isArray(record.skillTags)
      ? record.skillTags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.toLowerCase())
      : undefined,
  };
}

/** Rules win when they already found a value. The model only fills gaps. */
export function mergeEnrichment(rules: Enrichment, llm: LlmEnrichment | null): Enrichment {
  if (!llm) return rules;
  const salaryMissing = rules.salary.min == null && rules.salary.max == null;
  return {
    ...rules,
    seniority: rules.seniority === "unknown" && llm.seniority ? llm.seniority : rules.seniority,
    yoeMin: rules.yoeMin ?? llm.yoeMin ?? null,
    workplace: rules.workplace === "unknown" && llm.workplace ? llm.workplace : rules.workplace,
    usScope: rules.usScope === "unknown" && llm.usScope ? llm.usScope : rules.usScope,
    salary: salaryMissing && llm.salary ? llm.salary : rules.salary,
    skillTags: [...new Set([...rules.skillTags, ...(llm.skillTags ?? [])])].sort(),
  };
}

export async function maybeLlmEnrich(
  rules: Enrichment,
  input: { title: string; descriptionText: string },
  provider: AiProvider | null,
): Promise<Enrichment> {
  if (!provider || process.env.LLM_ENRICH !== "true") return rules;
  const gaps =
    rules.seniority === "unknown" ||
    rules.yoeMin == null ||
    rules.workplace === "unknown" ||
    rules.usScope === "unknown" ||
    (rules.salary.min == null && rules.salary.max == null);
  if (!gaps) return rules;
  try {
    const raw = await provider.complete({
      system:
        "Extract hiring facts from a job post. Return JSON only. Do not invent compensation or visa policy. Use null when the post does not say.",
      prompt: `Title: ${input.title}\n\n${input.descriptionText.slice(0, 6000)}\n\nReturn {"seniority","yoeMin","workplace","usScope","salary":{"min","max","interval"},"skillTags"}. seniority is one of intern, junior, mid, senior, staff, principal, director, vp, cxo, unknown. workplace is remote, hybrid, onsite, or unknown. usScope is us, non_us, or unknown.`,
    });
    return mergeEnrichment(rules, parseLlmEnrichment(raw));
  } catch {
    return rules;
  }
}
