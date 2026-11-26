import type { JobFilters, JobSource, Seniority, Workplace } from "@/lib/domain";
import { JOB_SOURCES, SENIORITIES, WORKPLACES } from "@/lib/domain";

type Params = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function many<T extends string>(value: string, allowed: readonly T[]): T[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is T => (allowed as readonly string[]).includes(item));
}

export function parseFilters(params: Params): JobFilters {
  const workplace = many<Workplace>(one(params.workplace), WORKPLACES);
  const seniority = many<Seniority>(one(params.seniority), SENIORITIES);
  const sources = many<JobSource>(one(params.source), JOB_SOURCES);
  const posted = Number(one(params.posted));
  const yoe = Number(one(params.yoe));
  return {
    q: one(params.q) || undefined,
    workplace: workplace.length ? workplace : undefined,
    seniority: seniority.length ? seniority : undefined,
    sources: sources.length ? sources : undefined,
    postedWithinDays: posted === 1 || posted === 7 || posted === 30 ? posted : undefined,
    c2cOnly: one(params.c2c) === "1",
    hasSalary: one(params.salary) === "1",
    includeW2Only: one(params.w2) === "1",
    includeLeadership: one(params.leadership) === "1",
    includeNonUs: one(params.anywhere) === "1",
    yoeMax: Number.isFinite(yoe) && yoe > 0 ? yoe : undefined,
    tab: (["recommended", "liked", "applied", "external"] as const).find((tab) => tab === one(params.tab)) ?? "recommended",
    jobFunction: one(params.fn) || undefined,
    title: one(params.title) || undefined,
    near: one(params.near) || undefined,
    radiusMiles: Number(one(params.radius)) > 0 ? Number(one(params.radius)) : undefined,
    salaryFloor: Number(one(params.pay)) > 0 ? Number(one(params.pay)) : undefined,
    excludeStaffing: one(params.agencies) === "0" ? false : true,
    sponsorship: one(params.sponsor) === "no" ? "no" : undefined,
    industry: one(params.industry) || undefined,
    companyStage: one(params.stage) || undefined,
    companySize: one(params.size) || undefined,
    includeText: one(params.include) || undefined,
    excludeText: one(params.exclude) || undefined,
    excludeCompanies: one(params.companies) || undefined,
  };
}

export function filtersToQuery(filters: JobFilters, jobId?: string | null): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.workplace?.length) params.set("workplace", filters.workplace.join(","));
  if (filters.seniority?.length) params.set("seniority", filters.seniority.join(","));
  if (filters.sources?.length) params.set("source", filters.sources.join(","));
  if (filters.postedWithinDays) params.set("posted", String(filters.postedWithinDays));
  if (filters.c2cOnly) params.set("c2c", "1");
  if (filters.hasSalary) params.set("salary", "1");
  if (filters.includeW2Only) params.set("w2", "1");
  if (filters.includeLeadership) params.set("leadership", "1");
  if (filters.includeNonUs) params.set("anywhere", "1");
  if (filters.yoeMax) params.set("yoe", String(filters.yoeMax));
  if (filters.tab && filters.tab !== "recommended") params.set("tab", filters.tab);
  if (filters.jobFunction) params.set("fn", filters.jobFunction);
  if (filters.title) params.set("title", filters.title);
  if (filters.near) params.set("near", filters.near);
  if (filters.radiusMiles) params.set("radius", String(filters.radiusMiles));
  if (filters.salaryFloor) params.set("pay", String(filters.salaryFloor));
  if (filters.excludeStaffing === false) params.set("agencies", "0");
  if (filters.sponsorship === "no") params.set("sponsor", "no");
  if (filters.industry) params.set("industry", filters.industry);
  if (filters.companyStage) params.set("stage", filters.companyStage);
  if (filters.companySize) params.set("size", filters.companySize);
  if (filters.includeText) params.set("include", filters.includeText);
  if (filters.excludeText) params.set("exclude", filters.excludeText);
  if (filters.excludeCompanies) params.set("companies", filters.excludeCompanies);
  if (jobId) params.set("job", jobId);
  const query = params.toString();
  return query ? `?${query}` : "";
}
