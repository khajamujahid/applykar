import type { JobFilters, ProfileRecord, ScoredJob, Seniority, UsScope, Workplace } from "@/lib/domain";
import { isLeadership } from "@/lib/domain";

export function cosineSimilarity(left: number[], right: number[]): number | null {
  if (left.length === 0 || left.length !== right.length) return null;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return null;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function overlap(needles: string[], haystack: string): number {
  if (needles.length === 0) return 0.5;
  const hay = haystack.toLowerCase();
  let hits = 0;
  for (const needle of needles) {
    const value = needle.trim().toLowerCase();
    if (value && hay.includes(value)) hits += 1;
  }
  return hits / needles.length;
}

function salaryScore(job: Pick<ScoredJob, "salaryMin" | "salaryMax" | "salaryInterval">, profile: ProfileRecord): number {
  const min = job.salaryMin;
  const max = job.salaryMax ?? job.salaryMin;
  if (min == null || max == null) return 8;
  if (job.salaryInterval === "hour") return max >= profile.c2cMinHourly ? 15 : 3;
  return max >= profile.salaryMin * 0.9 ? 15 : 3;
}

function seniorityScore(
  job: Pick<ScoredJob, "seniority" | "yoeMin">,
  profile: ProfileRecord,
): number {
  if (profile.yearsExperience != null && job.yoeMin != null) {
    if (profile.yearsExperience >= job.yoeMin) return 15;
    if (profile.yearsExperience + 1 >= job.yoeMin) return 8;
    return 2;
  }
  return job.seniority === "unknown" ? 10 : 11;
}

function workplaceScore(workplace: Workplace): number {
  if (workplace === "remote") return 10;
  if (workplace === "hybrid") return 8;
  return 7;
}

export function scoreJob(
  job: Omit<ScoredJob, "score" | "scoreNotes" | "breakdown" | "why">,
  profile: ProfileRecord,
  similarity: number | null = null,
): { score: number; notes: string[]; breakdown: ScoredJob["breakdown"]; why: string } {
  const titleParts: number[] = [];
  if (profile.targetTitles.length) titleParts.push(overlap(profile.targetTitles, job.title));
  if (profile.interests.length) {
    titleParts.push(overlap(profile.interests, `${job.title} ${job.skillTags.join(" ")}`));
  }
  const titleRatio = titleParts.length ? titleParts.reduce((sum, value) => sum + value, 0) / titleParts.length : 0.5;
  const skillRatio = overlap(profile.skills, `${job.title} ${job.skillTags.join(" ")}`);
  const title = Math.round(titleRatio * 25);
  const skills = Math.round(skillRatio * 25);
  const experience = Math.round((seniorityScore(job, profile) / 15) * 25);
  const locationFit = matchesProfileLocation(job, profile.locations);
  const location = Math.min(25, (locationFit ? 16 : 6) + Math.round(workplaceScore(job.workplace) / 10 * 9));
  let score = title + skills + experience + location;
  const breakdown = { skills, experience, title, location };
  const whyParts = [
    skills >= 13 ? "skills overlap" : null,
    title >= 13 ? "the title is close to a target" : null,
    experience >= 13 ? "experience covers the ask" : null,
    location >= 16 ? "location fits this profile" : null,
  ].filter((part): part is string => Boolean(part));
  const why = whyParts.length
    ? `Matches because ${whyParts.join(", ")}.`
    : "Thin overlap with this profile. Read the description before applying.";
  const notes = [
    `Skills ${skills}/25`,
    `Experience ${experience}/25`,
    `Title ${title}/25`,
    `Location ${location}/25`,
    `Pay signal ${salaryScore(job, profile)}/15`,
  ];
  if (similarity != null && similarity > 0) {
    const embedScore = Math.round(Math.max(0, Math.min(1, similarity)) * 100);
    score = Math.round(score * 0.55 + embedScore * 0.45);
    notes.push(`Embedding similarity ${embedScore}`);
  }
  return { score: Math.max(0, Math.min(100, score)), notes, breakdown, why };
}

export function matchesProfileLocation(
  job: { locationRaw: string | null; city: string | null; region: string | null; workplace: Workplace; usScope: UsScope },
  locations: string[],
): boolean {
  if (locations.length === 0) return true;
  const blob = `${job.locationRaw ?? ""} ${job.city ?? ""} ${job.region ?? ""}`.toLowerCase();
  return locations.some((location) => {
    const value = location.trim().toLowerCase();
    if (!value) return false;
    if (value === "remote") return job.workplace === "remote";
    if (value === "united states" || value === "usa" || value === "us") return job.usScope !== "non_us";
    return blob.includes(value);
  });
}

export function passesHardFilters(
  job: Pick<
    ScoredJob,
    | "seniority"
    | "w2Only"
    | "usScope"
    | "hidden"
    | "yoeMin"
    | "workplace"
    | "c2cFriendly"
    | "salaryMin"
    | "source"
    | "locationRaw"
    | "city"
    | "region"
  >,
  profile: Pick<
    ProfileRecord,
    "skipW2Only" | "usaOnly" | "includeLeadership" | "locations" | "seniorityFilters" | "yoeMax"
  >,
  filters: JobFilters = {},
): boolean {
  if (job.hidden) return false;
  const includeLeadership = filters.includeLeadership ?? profile.includeLeadership;
  if (!includeLeadership && isLeadership(job.seniority)) return false;
  if (profile.seniorityFilters.length > 0 && !profile.seniorityFilters.includes(job.seniority)) return false;
  const includeW2 = filters.includeW2Only ?? !profile.skipW2Only;
  if (!includeW2 && job.w2Only) return false;
  const includeNonUs = filters.includeNonUs ?? !profile.usaOnly;
  if (!includeNonUs && job.usScope === "non_us") return false;
  if (!matchesProfileLocation(job, profile.locations)) return false;
  if (filters.workplace?.length && !filters.workplace.includes(job.workplace)) return false;
  if (filters.seniority?.length && !filters.seniority.includes(job.seniority as Seniority)) return false;
  if (filters.sources?.length && !filters.sources.includes(job.source)) return false;
  if (filters.c2cOnly && !job.c2cFriendly) return false;
  if (filters.hasSalary && job.salaryMin == null) return false;
  const yoeMax = filters.yoeMax ?? profile.yoeMax ?? undefined;
  if (yoeMax != null && job.yoeMin != null && job.yoeMin > yoeMax) return false;
  return true;
}
