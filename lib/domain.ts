export const JOB_SOURCES = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "workday",
  "icims",
  "recruitee",
  "bamboohr",
  "breezy",
  "adzuna",
  "usajobs",
  "jsearch",
] as const;

export const BOARD_SOURCES = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "workday",
  "icims",
  "recruitee",
  "bamboohr",
  "breezy",
] as const;

export const SENIORITIES = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "director",
  "vp",
  "cxo",
  "unknown",
] as const;

export const WORKPLACES = ["remote", "hybrid", "onsite", "unknown"] as const;

export const US_SCOPES = ["us", "non_us", "unknown"] as const;

export const APPLICATION_STATUSES = [
  "queued",
  "ready_for_review",
  "applied",
  "interview",
  "rejected",
] as const;

export const SALARY_INTERVALS = ["year", "hour"] as const;

export type JobSource = (typeof JOB_SOURCES)[number];
export type BoardSource = (typeof BOARD_SOURCES)[number];
export type Seniority = (typeof SENIORITIES)[number];
export type Workplace = (typeof WORKPLACES)[number];
export type UsScope = (typeof US_SCOPES)[number];
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type SalaryInterval = (typeof SALARY_INTERVALS)[number];

export type Salary = {
  min: number | null;
  max: number | null;
  currency: string | null;
  interval: SalaryInterval | null;
};

export type Enrichment = {
  seniority: Seniority;
  yoeMin: number | null;
  workplace: Workplace;
  usScope: UsScope;
  salary: Salary;
  w2Only: boolean;
  c2cFriendly: boolean;
  noSponsorship: boolean;
  skillTags: string[];
};

export type NormalizedJob = {
  source: JobSource;
  externalId: string;
  title: string;
  companyName: string;
  descriptionText: string;
  locationRaw: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  workplaceHint: Workplace;
  applyUrl: string;
  sourceUrl: string | null;
  postedAt: Date | null;
  salary: Salary | null;
  raw: Record<string, unknown>;
};

export type ProfileRecord = {
  id: string;
  name: string;
  email: string;
  headline: string;
  skills: string[];
  targetTitles: string[];
  locations: string[];
  interests: string[];
  seniorityFilters: Seniority[];
  yearsExperience: number | null;
  yoeMax: number | null;
  visaStatus: string;
  needsSponsorship: boolean;
  openToRelocate: boolean;
  salaryMin: number;
  salaryMax: number;
  c2cMinHourly: number;
  availableImmediately: boolean;
  usaOnly: boolean;
  prefersC2c: boolean;
  skipW2Only: boolean;
  includeLeadership: boolean;
  resumeFilename: string | null;
  resumeText: string;
  applicationEmail: string | null;
  onboardingComplete: boolean;
};

export type ProfileInput = Omit<ProfileRecord, "id">;

export type AnswerRecord = {
  key: string;
  question: string;
  answer: string;
};

export type ScoredJob = {
  id: string;
  title: string;
  companyName: string;
  source: JobSource;
  locationRaw: string | null;
  city: string | null;
  region: string | null;
  workplace: Workplace;
  seniority: Seniority;
  yoeMin: number | null;
  salaryLabel: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryInterval: SalaryInterval | null;
  w2Only: boolean;
  c2cFriendly: boolean;
  noSponsorship: boolean;
  usScope: UsScope;
  applyUrl: string;
  sourceUrl: string | null;
  postedAt: string | null;
  skillTags: string[];
  score: number;
  scoreNotes: string[];
  breakdown: { skills: number; experience: number; title: number; location: number };
  why: string;
  saved: boolean;
  hidden: boolean;
  applicationId: string | null;
  applicationStatus: ApplicationStatus | null;
  description: string | null;
};

export type JobFilters = {
  q?: string;
  workplace?: Workplace[];
  seniority?: Seniority[];
  sources?: JobSource[];
  postedWithinDays?: number;
  c2cOnly?: boolean;
  hasSalary?: boolean;
  yoeMax?: number;
  includeLeadership?: boolean;
  includeNonUs?: boolean;
  includeW2Only?: boolean;
  savedOnly?: boolean;
  tab?: "recommended" | "liked" | "applied" | "external";
  jobFunction?: string;
  title?: string;
  near?: string;
  radiusMiles?: number;
  salaryFloor?: number;
  excludeStaffing?: boolean;
  sponsorship?: "no";
  industry?: string;
  companyStage?: string;
  companySize?: string;
  includeText?: string;
  excludeText?: string;
  excludeCompanies?: string;
};

export const LEADERSHIP: ReadonlySet<Seniority> = new Set(["director", "vp", "cxo"]);

export function isLeadership(seniority: Seniority): boolean {
  return LEADERSHIP.has(seniority);
}

export function formatSalary(input: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryInterval: SalaryInterval | null;
}): string | null {
  const { salaryMin, salaryMax, salaryInterval } = input;
  if (salaryMin == null && salaryMax == null) return null;
  const fmt = (value: number) => {
    if (salaryInterval === "hour") return `$${Math.round(value)}/hr`;
    if (value >= 1000) return `$${Math.round(value / 1000)}k`;
    return `$${Math.round(value)}`;
  };
  const min = salaryMin ?? salaryMax;
  const max = salaryMax ?? salaryMin;
  if (min == null || max == null) return null;
  if (min === max) return fmt(min);
  return `${fmt(min)}–${fmt(max)}`;
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "Date unknown";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Date unknown";
  const delta = Math.max(0, now - then);
  const minutes = Math.round(delta / 60000);
  if (minutes < 60) return minutes <= 1 ? "Just now" : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}
