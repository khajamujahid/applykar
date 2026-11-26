import type { NormalizedJob, Workplace } from "@/lib/domain";
import { parseSalary } from "@/lib/enrich/rules";
import { htmlToText, asRecord, asString, parseDate } from "@/lib/text";
import { fetchJson } from "@/lib/sources/http";
import type { BoardAdapter, FetchLike } from "@/lib/sources/types";

function workplace(value: string | null, isRemote: boolean): Workplace {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("hybrid")) return "hybrid";
  if (normalized.includes("remote") || isRemote) return "remote";
  if (normalized.includes("on")) return "onsite";
  return "unknown";
}

export function parseAshby(payload: unknown, fallbackCompany: string): NormalizedJob[] {
  const root = asRecord(payload);
  const jobs = root?.jobs;
  if (!Array.isArray(jobs)) return [];
  const parsed: NormalizedJob[] = [];
  for (const entry of jobs) {
    const job = asRecord(entry);
    if (!job) continue;
    const title = asString(job.title);
    const externalId = asString(job.id);
    const applyUrl = asString(job.applyUrl) ?? asString(job.jobUrl);
    if (!title || !externalId || !applyUrl) continue;
    const address = asRecord(asRecord(job.address)?.postalAddress);
    const compensation = asRecord(job.compensation);
    const summary = asString(compensation?.scrapeableCompensationSalarySummary) ?? asString(compensation?.compensationTierSummary);
    const description = asString(job.descriptionPlain) ?? htmlToText(asString(job.descriptionHtml) ?? "");
    parsed.push({
      source: "ashby",
      externalId,
      title,
      companyName: fallbackCompany,
      descriptionText: description,
      locationRaw: asString(job.location),
      city: asString(address?.addressLocality),
      region: asString(address?.addressRegion),
      country: asString(address?.addressCountry),
      workplaceHint: workplace(asString(job.workplaceType), job.isRemote === true),
      applyUrl,
      sourceUrl: asString(job.jobUrl),
      postedAt: parseDate(job.publishedAt),
      salary: summary ? parseSalary(summary) : null,
      raw: { id: externalId, title },
    });
  }
  return parsed;
}

export const ashbyAdapter: BoardAdapter = {
  source: "ashby",
  async fetchJobs(company, fetchImpl: FetchLike = fetch) {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company.slug)}?includeCompensation=true`;
    const payload = await fetchJson(url, fetchImpl);
    return parseAshby(payload, company.name);
  },
};
