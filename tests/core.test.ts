import { describe, expect, it } from "vitest";
import { loadCompanySeed } from "@/lib/companies";
import { dedupeKey, markDuplicates } from "@/lib/dedupe";
import { detectNoSponsorship, detectSeniority, detectUsScope, detectW2Only, enrichJob, parseSalary, parseYoe } from "@/lib/enrich/rules";
import { mergeEnrichment, parseLlmEnrichment } from "@/lib/enrich/llm";
import { matchesProfileLocation, passesHardFilters, scoreJob } from "@/lib/fit/score";
import { isAllowedEmail } from "@/lib/auth-allowlist";
import { buildAnswerPacket } from "@/lib/apply/packet";
import { parseResume } from "@/lib/profile/parse-resume";
import { htmlToText } from "@/lib/text";
import { defaultProfile } from "@/lib/profile/defaults";
import type { ProfileRecord, ScoredJob } from "@/lib/domain";

const profile: ProfileRecord = {
  ...defaultProfile(),
  id: "profile-1",
  email: "khaja@applykar.local",
  skills: ["sql", "python"],
  targetTitles: ["data analyst"],
  interests: ["Analytics"],
  locations: ["Remote", "United States"],
  yearsExperience: 5,
  yoeMax: 8,
  onboardingComplete: true,
};

function job(overrides: Partial<ScoredJob> = {}): ScoredJob {
  return {
    id: "job-1",
    title: "Senior Data Analyst",
    companyName: "Northwind",
    source: "greenhouse",
    locationRaw: "Remote, United States",
    city: null,
    region: null,
    workplace: "remote",
    seniority: "senior",
    yoeMin: 4,
    salaryLabel: "$110k–$130k",
    salaryMin: 110000,
    salaryMax: 130000,
    salaryInterval: "year",
    w2Only: false,
    c2cFriendly: true,
    noSponsorship: true,
    usScope: "us",
    applyUrl: "https://example.com/apply",
    sourceUrl: null,
    postedAt: null,
    skillTags: ["sql", "python"],
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

describe("allowlist", () => {
  it("accepts only listed emails", () => {
    expect(isAllowedEmail("Khaja@Applykar.local", "khaja@applykar.local, other@example.com")).toBe(true);
    expect(isAllowedEmail("other@example.com", "khaja@applykar.local")).toBe(false);
    expect(isAllowedEmail("khaja@applykar.local", "")).toBe(false);
  });
});

describe("html and salary", () => {
  it("decodes greenhouse escaped html", () => {
    const text = htmlToText("&lt;p&gt;About the Team&amp;amp; Netlify&lt;/p&gt;");
    expect(text).toContain("About the Team");
    expect(text).toContain("&");
    expect(text).not.toContain("<p>");
  });

  it("parses yearly and hourly ranges", () => {
    expect(parseSalary("$140,000 - $180,000 a year")).toMatchObject({ min: 140000, max: 180000, interval: "year" });
    expect(parseSalary("$140k–$180k")).toMatchObject({ min: 140000, max: 180000, interval: "year" });
    expect(parseSalary("$65 - $80 per hour")).toMatchObject({ min: 65, max: 80, interval: "hour" });
    expect(parseSalary("USD 160000")).toMatchObject({ min: 160000, interval: "year" });
  });
});

describe("enrichment", () => {
  it("ranks the highest seniority in the title", () => {
    expect(detectSeniority("Senior / Staff Fullstack Engineer")).toBe("staff");
    expect(detectSeniority("Director of Engineering")).toBe("director");
    expect(detectSeniority("VP of Sales")).toBe("vp");
    expect(detectSeniority("Chief Technology Officer")).toBe("cxo");
    expect(detectSeniority("Software Engineer II")).toBe("mid");
    expect(detectSeniority("Account Executive")).toBe("unknown");
  });

  it("reads required years and workplace flags", () => {
    expect(parseYoe("Have 2 to 5 years of experience and 8+ years of experience")).toBe(8);
    const enriched = enrichJob({
      title: "Backend Engineer",
      descriptionText: "This is W2 only. No C2C. No sponsorship. Must be authorized to work. $120k-$150k. Remote - US.",
      locationRaw: "Remote - US",
    });
    expect(enriched.w2Only).toBe(true);
    expect(enriched.c2cFriendly).toBe(false);
    expect(enriched.noSponsorship).toBe(true);
    expect(enriched.workplace).toBe("remote");
    expect(enriched.usScope).toBe("us");
    expect(enriched.salary.min).toBe(120000);
  });

  it("does not treat a mentioned VP in the description as the job level", () => {
    expect(detectSeniority("Senior Demand Generation Marketing Manager")).toBe("senior");
    expect(detectUsScope({ location: "Geneva", country: "CH" })).toBe("non_us");
    expect(detectUsScope({ location: "Remote" })).toBe("unknown");
    expect(detectW2Only("corp to corp welcome")).toBe(false);
    expect(detectNoSponsorship("visa sponsorship is available")).toBe(false);
  });

  it("lets the model fill only unknown fields", () => {
    const rules = enrichJob({ title: "Engineer", descriptionText: "Build APIs.", locationRaw: "Remote" });
    const merged = mergeEnrichment(rules, parseLlmEnrichment('{"seniority":"senior","yoeMin":6,"workplace":"hybrid"}'));
    expect(merged.seniority).toBe("senior");
    expect(merged.yoeMin).toBe(6);
    expect(merged.workplace).toBe("remote");
  });
});

describe("dedupe", () => {
  it("collapses the same role and keeps the richer posting", () => {
    expect(
      dedupeKey({ companyName: "Stripe, Inc.", title: "Senior Engineer", locationRaw: "NYC", workplace: "onsite" }),
    ).toBe(dedupeKey({ companyName: "stripe", title: "Senior engineer", locationRaw: "NYC", workplace: "onsite" }));
    const mapping = markDuplicates([
      { id: "a", dedupeKey: "same", richness: 10, firstSeenAt: 1 },
      { id: "b", dedupeKey: "same", richness: 50, firstSeenAt: 2 },
    ]);
    expect(mapping.get("b")).toBeNull();
    expect(mapping.get("a")).toBe("b");
  });
});

describe("fit", () => {
  it("hides leadership, W-2 only, non-US, and over-senior asks", () => {
    expect(passesHardFilters(job({ seniority: "director" }), profile)).toBe(false);
    expect(passesHardFilters(job({ seniority: "director" }), profile, { includeLeadership: true })).toBe(true);
    expect(passesHardFilters(job({ w2Only: true }), profile)).toBe(false);
    expect(passesHardFilters(job({ usScope: "non_us", locationRaw: "Paris", workplace: "onsite" }), profile)).toBe(false);
    expect(passesHardFilters(job({ yoeMin: 12 }), profile)).toBe(false);
    expect(matchesProfileLocation(job({ workplace: "onsite", locationRaw: "Austin, TX", usScope: "us" }), ["Austin"])).toBe(true);
  });

  it("scores overlapping skills above an unrelated title", () => {
    const match = scoreJob(job(), profile).score;
    const miss = scoreJob(job({ title: "Restaurant manager", skillTags: [], c2cFriendly: false, salaryMin: 20000, salaryMax: 30000 }), profile).score;
    expect(match).toBeGreaterThan(miss);
  });
});

describe("resume and packet", () => {
  it("reads skills, a title, and a date span", () => {
    const parsed = parseResume(`Khaja Mujahiddin Mohammed\nExperience\nData Analyst\n2020 - Present\nBuilt SQL and Python pipelines.`);
    expect(parsed.skills).toEqual(expect.arrayContaining(["sql", "python"]));
    expect(parsed.targetTitles[0]).toContain("Data Analyst");
    expect(parsed.yearsExperience).toBeGreaterThan(0);
  });

  it("copies saved answers and does not invent EEO", () => {
    const packet = buildAnswerPacket({
      job: { title: "Data Analyst", companyName: "Northwind", applyUrl: "https://example.com", skillTags: ["sql"], locationRaw: "Remote" },
      profile,
      answers: [{ key: "eeo_gender", question: "Gender (EEO)", answer: "Prefer not to say" }],
    });
    expect(packet.text).toContain("Prefer not to say");
    expect(packet.text).toContain("sql");
    expect(packet.whyThisRole).not.toMatch(/he is|she is/i);
  });
});

describe("company seed", () => {
  it("includes at least 200 verified boards across the public ATS sources", () => {
    const companies = loadCompanySeed();
    expect(companies.length).toBeGreaterThanOrEqual(200);
    const sources = new Set(companies.map((company) => company.source));
    for (const source of ["greenhouse", "lever", "ashby", "smartrecruiters", "workable"]) {
      expect(sources.has(source as never)).toBe(true);
    }
  });
});
