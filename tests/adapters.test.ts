import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { enrichJob } from "@/lib/enrich/rules";
import { parseAdzuna, parseJsearch, parseUsajobs } from "@/lib/sources/optional";
import { parseAshby } from "@/lib/sources/ashby";
import { parseGreenhouse } from "@/lib/sources/greenhouse";
import { parseLever } from "@/lib/sources/lever";
import { parseSmartRecruiters } from "@/lib/sources/smartrecruiters";
import { parseWorkable } from "@/lib/sources/workable";

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));
}

describe("ATS fixtures", () => {
  it("parses Greenhouse", () => {
    const [job] = parseGreenhouse(fixture("greenhouse"), "Netlify");
    expect(job?.title).toContain("Senior Demand Generation");
    expect(job?.companyName).toBe("Netlify");
    expect(job?.applyUrl).toContain("greenhouse.io");
    expect(job?.descriptionText).toContain("About the Team");
    expect(enrichJob(job!).seniority).toBe("senior");
    expect(enrichJob({ ...job!, workplaceHint: job!.workplaceHint }).workplace).toBe("remote");
  });

  it("parses Lever", () => {
    const [job] = parseLever(fixture("lever"), "Sonar");
    expect(job?.title).toContain("Account Executive");
    expect(job?.country).toBe("CH");
    expect(job?.workplaceHint).toBe("onsite");
    const enriched = enrichJob(job!);
    expect(enriched.usScope).toBe("non_us");
    expect(enriched.yoeMin).toBe(2);
  });

  it("parses Ashby", () => {
    const [job] = parseAshby(fixture("ashby"), "Linear");
    expect(job?.title).toContain("Fullstack");
    expect(job?.workplaceHint).toBe("remote");
    expect(job?.applyUrl).toContain("ashbyhq.com");
    expect(enrichJob(job!).seniority).toBe("staff");
    expect(enrichJob(job!).usScope).toBe("non_us");
  });

  it("parses SmartRecruiters", () => {
    const payload = fixture("smartrecruiters") as { list: unknown; detail: { id: string } };
    const [job] = parseSmartRecruiters(payload.list, "Canva", { [payload.detail.id]: payload.detail });
    expect(job?.title).toContain("Japan");
    expect(job?.workplaceHint).toBe("hybrid");
    expect(job?.applyUrl).toContain("smartrecruiters.com");
    expect(enrichJob(job!).usScope).toBe("non_us");
  });

  it("parses Workable", () => {
    const [job] = parseWorkable(fixture("workable"), "Hugging Face");
    expect(job?.companyName).toBe("Hugging Face");
    expect(job?.workplaceHint).toBe("remote");
    expect(job?.country).toBe("France");
    expect(enrichJob(job!).usScope).toBe("non_us");
  });

  it("parses the optional source contracts", () => {
    expect(parseAdzuna({ results: [{ id: "1", title: "Engineer", redirect_url: "https://apply.example", description: "Remote SQL", company: { display_name: "Ada" }, location: { display_name: "Austin" }, salary_min: 100000, salary_max: 120000, created: "2026-01-01" }] })[0]).toMatchObject({ source: "adzuna", companyName: "Ada" });
    expect(parseUsajobs({ SearchResult: { SearchResultItems: [{ MatchedObjectId: "9", MatchedObjectDescriptor: { PositionTitle: "Analyst", ApplyURI: ["https://usajobs.gov/9"], OrganizationName: "USDS", PositionLocationDisplay: "Washington, DC", PositionLocation: [{ CityName: "Washington", CountryCode: "United States" }], PublicationStartDate: "2026-01-01", PositionRemuneration: [{ MinimumRange: "90000", MaximumRange: "120000", RateIntervalCode: "PA" }] } }] } })[0]).toMatchObject({ source: "usajobs", title: "Analyst" });
    expect(parseJsearch({ data: [{ job_id: "j1", job_title: "Analyst", employer_name: "Ada", job_apply_link: "https://apply.example", job_city: "Austin", job_state: "TX", job_country: "US", job_is_remote: true, job_description: "SQL", job_min_salary: 90, job_max_salary: 110, job_salary_period: "HOUR" }] })[0]).toMatchObject({ source: "jsearch", workplaceHint: "remote" });
  });
});
