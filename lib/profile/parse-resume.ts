import { extractSkillTags } from "@/lib/enrich/skills";

export type ParsedResume = {
  headline: string;
  skills: string[];
  targetTitles: string[];
  yearsExperience: number | null;
};

function cleanLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

export function estimateYears(text: string, nowYear = new Date().getFullYear()): number | null {
  const spans: number[] = [];
  const pattern = /\b((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(present|current|((?:19|20)\d{2}))/gi;
  for (const match of text.matchAll(pattern)) {
    const start = Number(match[1]);
    const end = match[2] && /^\d{4}$/.test(match[2]) ? Number(match[2]) : nowYear;
    if (end >= start && end - start <= 50) spans.push(end - start);
  }
  if (spans.length === 0) return null;
  return Math.max(...spans);
}

export function extractTargetTitles(text: string): string[] {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const titles: string[] = [];
  const experienceAt = lines.findIndex((line) => /^experience\b/i.test(line));
  const window = experienceAt >= 0 ? lines.slice(experienceAt + 1, experienceAt + 40) : lines.slice(0, 40);
  for (const line of window) {
    if (line.length < 4 || line.length > 80) continue;
    if (/^[\u2022•\-*]/.test(line)) continue;
    if (/^(summary|education|skills|projects|certifications)\b/i.test(line)) break;
    if (/\b(19|20)\d{2}\b/.test(line) && line.length < 24) continue;
    if (!/[a-z]/i.test(line)) continue;
    if (/\b(engineer|developer|analyst|designer|scientist|manager|architect|consultant)\b/i.test(line)) {
      titles.push(line.replace(/\s+[|•-]\s+.*$/, "").trim());
    }
    if (titles.length >= 4) break;
  }
  return [...new Set(titles)];
}

export function parseResume(text: string): ParsedResume {
  const normalized = text.replace(/\u0000/g, "").trim();
  const lines = normalized.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const headline = lines.find((line) => line.length > 12 && line.length < 140) ?? "";
  return {
    headline: headline.slice(0, 140),
    skills: extractSkillTags(normalized),
    targetTitles: extractTargetTitles(normalized),
    yearsExperience: estimateYears(normalized),
  };
}
