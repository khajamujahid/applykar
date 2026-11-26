import type { AnswerRecord, ProfileInput, Seniority } from "@/lib/domain";

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

export const defaultAnswers = (): AnswerRecord[] => [
  {
    key: "work_authorization",
    question: "Are you authorized to work in the United States?",
    answer: "Yes. I am a U.S. lawful permanent resident (Green Card holder).",
  },
  {
    key: "sponsorship",
    question: "Will you now or in the future require visa sponsorship?",
    answer: "No. I do not need sponsorship now or in the future.",
  },
  {
    key: "willing_to_relocate",
    question: "Are you willing to relocate?",
    answer: "Yes. I am open to relocating within the United States.",
  },
  {
    key: "salary_expectation",
    question: "What compensation are you targeting?",
    answer: "$95,000–$120,000 base, or corp-to-corp at $65 per hour or higher.",
  },
  {
    key: "employment_type",
    question: "What engagement type do you want?",
    answer: "I prefer corp-to-corp (C2C). I skip W-2-only roles.",
  },
  {
    key: "availability",
    question: "When can you start?",
    answer: "I am available immediately.",
  },
  {
    key: "work_location",
    question: "Where can you work?",
    answer: "United States only.",
  },
  {
    key: "eeo_gender",
    question: "Gender (EEO)",
    answer: "Prefer not to say",
  },
  {
    key: "eeo_race",
    question: "Race or ethnicity (EEO)",
    answer: "Prefer not to say",
  },
  {
    key: "eeo_veteran",
    question: "Veteran status (EEO)",
    answer: "Prefer not to say",
  },
  {
    key: "eeo_disability",
    question: "Disability status (EEO)",
    answer: "Prefer not to say",
  },
];
