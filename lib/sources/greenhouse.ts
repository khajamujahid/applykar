import type { NormalizedJob } from "@/lib/domain";
import { htmlToText, asRecord, asString, parseDate } from "@/lib/text";
import { fetchJson } from "@/lib/sources/http";
import type { BoardAdapter, FetchLike } from "@/lib/sources/types";

export function parseGreenhouse(payload: unknown, fallbackCompany: string): NormalizedJob[] {
  const root = asRecord(payload);
  const jobs = root?.jobs;
  if (!Array.isArray(jobs)) return [];
  const parsed: NormalizedJob[] = [];
  for (const entry of jobs) {
    const job = asRecord(entry);
    if (!job) continue;
    const title = asString(job.title);
    const externalId = asString(job.id);
    const applyUrl = asString(job.absolute_url);
    if (!title || !externalId || !applyUrl) continue;
    const location = asRecord(job.location);
    const locationRaw = asString(location?.name);
    parsed.push({
      source: "greenhouse",
      externalId,
      title,
      companyName: asString(job.company_name) ?? fallbackCompany,
      descriptionText: htmlToText(asString(job.content) ?? ""),
      locationRaw,
      city: null,
      region: null,
      country: null,
      workplaceHint: "unknown",
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: parseDate(job.first_published) ?? parseDate(job.updated_at),
      salary: null,
      raw: job,
    });
  }
  return parsed;
}

export const greenhouseAdapter: BoardAdapter = {
  source: "greenhouse",
  async fetchJobs(company, fetchImpl: FetchLike = fetch) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.slug)}/jobs?content=true`;
    const payload = await fetchJson(url, fetchImpl);
    return parseGreenhouse(payload, company.name);
  },
};
