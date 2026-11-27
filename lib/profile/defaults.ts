import type { AnswerRecord, ProfileInput, Seniority } from "@/lib/domain";
import { catalogDefaults } from "@/lib/profile/answer-catalog";

export const OWNER_NAME = "Khaja Mujahiddin Mohammed";

export const MAX_PROFILES_DEFAULT = 5;

export const INTEREST_OPTIONS = [
  "Backend",
  "Frontend",
  "Full stack",
  "Data engineering",
  "Analytics",
  "Machine learning",
  "Infrastructure",
  "Security",
  "Product",
  "Design",
  "Mobile",
  "QA",
] as const;

export const LOCATION_OPTIONS = [
  "Remote",
  "United States",
  "New York",
  "San Francisco",
  "Austin",
  "Seattle",
  "Dallas",
  "Chicago",
  "Boston",
  "Atlanta",
] as const;

export const SENIORITY_OPTIONS: Seniority[] = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "director",
  "vp",
  "cxo",
];

export function maxProfiles(): number {
  const parsed = Number(process.env.MAX_PROFILES ?? MAX_PROFILES_DEFAULT);
  if (!Number.isFinite(parsed) || parsed < 1) return MAX_PROFILES_DEFAULT;
  return Math.min(10, Math.floor(parsed));
}

export const defaultProfile = (): ProfileInput => ({
  name: "Primary",
  email: "",
  headline: "Open to C2C in the United States",
  skills: [],
  targetTitles: [],
  locations: ["Remote", "United States"],
  interests: [],
  seniorityFilters: [],
  yearsExperience: null,
  yoeMax: null,
  visaStatus: "U.S. lawful permanent resident (Green Card)",
  needsSponsorship: false,
  openToRelocate: true,
  salaryMin: 95_000,
  salaryMax: 120_000,
  c2cMinHourly: 65,
  availableImmediately: true,
  usaOnly: true,
  prefersC2c: true,
  skipW2Only: true,
  includeLeadership: false,
  resumeFilename: null,
  resumeText: "",
  applicationEmail: null,
  onboardingComplete: false,
});

/** The full saved-answer set (every common application question). Source of truth: lib/profile/answer-catalog.ts. */
export const defaultAnswers = (): AnswerRecord[] => catalogDefaults();
