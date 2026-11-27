import type { JobFilters, JobType, ScoredJob } from "@/lib/domain";

const FUNCTIONS: { name: string; pattern: RegExp }[] = [
  { name: "Data", pattern: /data|analytics|analyst|bi\b|warehouse/i },
  { name: "Engineering", pattern: /engineer|developer|software|backend|frontend|fullstack|full-stack/i },
  { name: "Product", pattern: /product manager|\bpm\b/i },
  { name: "Design", pattern: /designer|design/i },
  { name: "Security", pattern: /security|appsec/i },
  { name: "Marketing", pattern: /marketing|growth|demand gen/i },
  { name: "Sales", pattern: /sales|account executive|\bae\b/i },
];

const AGENCIES = ["randstad", "robert half", "insight global", "teksystems", "tek systems", "kforce", "apex systems", "collabera", "cybercoders", "jobot", "motion recruitment"];

const FACTS: Record<string, { industry: string; stage: string; size: string }> = {
  stripe: { industry: "Fintech", stage: "Public", size: "1000+" },
  figma: { industry: "Software", stage: "Late", size: "1000+" },
  cloudflare: { industry: "Infrastructure", stage: "Public", size: "1000+" },
  databricks: { industry: "Data", stage: "Late", size: "1000+" },
  notion: { industry: "Software", stage: "Late", size: "201-1000" },
  linear: { industry: "Software", stage: "Growth", size: "51-200" },
  vercel: { industry: "Software", stage: "Growth", size: "201-1000" },
  gitlab: { industry: "Software", stage: "Public", size: "1000+" },
  netlify: { industry: "Software", stage: "Growth", size: "201-1000" },
  openai: { industry: "AI", stage: "Late", size: "1000+" },
  anthropic: { industry: "AI", stage: "Late", size: "201-1000" },
  snowflake: { industry: "Data", stage: "Public", size: "1000+" },
  datadog: { industry: "Software", stage: "Public", size: "1000+" },
  canva: { industry: "Software", stage: "Late", size: "1000+" },
  huggingface: { industry: "AI", stage: "Growth", size: "51-200" },
};

const CITIES: Record<string, [number, number]> = {
  "san francisco": [37.77, -122.42],
  "new york": [40.71, -74.01],
  austin: [30.27, -97.74],
  seattle: [47.61, -122.33],
  dallas: [32.78, -96.8],
  chicago: [41.88, -87.63],
  boston: [42.36, -71.06],
  atlanta: [33.75, -84.39],
  denver: [39.74, -104.99],
  "los angeles": [34.05, -118.24],
  remote: [39.8, -98.6],
};

/** Employment type from the title and description excerpt (most feeds don't send a field for it). */
export function jobTypeOf(title: string, text = ""): JobType {
  const blob = `${title} ${text.slice(0, 500)}`;
  if (/\b(intern|internship|co-?op)\b/i.test(title)) return "internship";
  if (/\b(contract|contractor|c2c|corp[- ]to[- ]corp|1099|temporary|temp)\b/i.test(blob) && !/full[- ]time/i.test(title)) return "contract";
  if (/\bpart[- ]time\b/i.test(blob) && !/full[- ]time/i.test(blob)) return "part_time";
  return "full_time";
}

export function jobFunction(title: string): string {
  return FUNCTIONS.find((item) => item.pattern.test(title))?.name ?? "Other";
}

export function isStaffingAgency(name: string): boolean {
  const value = name.toLowerCase();
  return AGENCIES.some((agency) => value.includes(agency));
}

export function companyFacts(name: string): { industry: string; stage: string; size: string } | null {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const found = Object.entries(FACTS).find(([company]) => key.includes(company));
  return found ? found[1] : null;
}

function cityOf(location: string | null): string | null {
  const value = (location ?? "").toLowerCase();
  return Object.keys(CITIES).find((city) => city !== "remote" && value.includes(city)) ?? null;
}

function miles(from: [number, number], to: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (to[0] - from[0]) * rad;
  const dLon = (to[1] - from[1]) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from[0] * rad) * Math.cos(to[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function matchesListing(job: ScoredJob, filters: JobFilters): boolean {
  if (filters.jobTypes?.length && !filters.jobTypes.includes(job.jobType)) return false;
  if (filters.jobFunction && jobFunction(job.title) !== filters.jobFunction) return false;
  if (filters.title && !job.title.toLowerCase().includes(filters.title.toLowerCase())) return false;
  if (filters.excludeStaffing && isStaffingAgency(job.companyName)) return false;
  const facts = companyFacts(job.companyName);
  if (filters.industry && facts?.industry !== filters.industry) return false;
  if (filters.companyStage && facts?.stage !== filters.companyStage) return false;
  if (filters.companySize && facts?.size !== filters.companySize) return false;
  if (filters.sponsorship === "no" && !job.noSponsorship) return false;
  if (filters.salaryFloor != null && (job.salaryMax ?? job.salaryMin ?? 0) < filters.salaryFloor) return false;
  if (filters.includeText) {
    const blob = `${job.title} ${job.companyName} ${job.skillTags.join(" ")}`.toLowerCase();
    if (!blob.includes(filters.includeText.toLowerCase())) return false;
  }
  if (filters.excludeText) {
    const blob = `${job.title} ${job.companyName} ${job.skillTags.join(" ")}`.toLowerCase();
    if (blob.includes(filters.excludeText.toLowerCase())) return false;
  }
  if (filters.excludeCompanies) {
    const blocked = filters.excludeCompanies.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (blocked.some((name) => job.companyName.toLowerCase().includes(name))) return false;
  }
  if (filters.near && filters.radiusMiles) {
    const origin = CITIES[filters.near.toLowerCase()];
    const city = cityOf(job.locationRaw) ?? (job.workplace === "remote" ? null : cityOf(job.city));
    if (!origin || !city) return job.workplace === "remote";
    if (miles(origin, CITIES[city]) > filters.radiusMiles) return false;
  }
  return true;
}
