import { expect, it } from "vitest";
import type { ScoredJob } from "@/lib/domain";
import { isStaffingAgency, jobFunction, matchesListing } from "@/lib/feed/listing";

function job(overrides: Partial<ScoredJob> = {}): ScoredJob {
  return {
    jobType: "full_time",
    isNew: false,
    id: "1",
    title: "Senior Data Analyst",
    companyName: "Stripe",
    source: "greenhouse",
    locationRaw: "San Francisco, CA",
    city: "San Francisco",
    region: "CA",
    workplace: "onsite",
    seniority: "senior",
    yoeMin: 4,
    salaryLabel: null,
    salaryMin: 140000,
    salaryMax: 180000,
    salaryInterval: "year",
    w2Only: false,
    c2cFriendly: false,
    noSponsorship: true,
    usScope: "us",
    applyUrl: "https://boards.greenhouse.io/stripe/jobs/1",
    sourceUrl: null,
    postedAt: null,
    skillTags: ["sql"],
    score: 0,
    scoreNotes: [],
    breakdown: { skills: 0, experience: 0, title: 0, location: 0 },
    why: "",
    saved: false,
    hidden: false,
    applicationId: null,
    applicationStatus: null,
    description: null,
    ...overrides,
  };
}

it("classifies function, agencies, and rich filters", () => {
  expect(jobFunction("Staff Backend Engineer")).toBe("Engineering");
  expect(isStaffingAgency("Insight Global")).toBe(true);
  expect(matchesListing(job(), { jobFunction: "Data", industry: "Fintech" })).toBe(true);
  expect(matchesListing(job(), { excludeCompanies: "stripe" })).toBe(false);
  expect(matchesListing(job(), { near: "Austin", radiusMiles: 50 })).toBe(false);
  expect(matchesListing(job({ companyName: "Insight Global" }), { excludeStaffing: true })).toBe(false);
  expect(matchesListing(job(), { sponsorship: "no" })).toBe(true);
  expect(matchesListing(job({ noSponsorship: false }), { sponsorship: "no" })).toBe(false);
});
