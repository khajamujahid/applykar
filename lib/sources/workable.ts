import type { NormalizedJob, Workplace } from "@/lib/domain";
import { htmlToText, asRecord, asString, parseDate } from "@/lib/text";
import { fetchJson } from "@/lib/sources/http";
import type { BoardAdapter, FetchLike } from "@/lib/sources/types";

export function parseWorkable(payload: unknown, fallbackCompany: string): NormalizedJob[] {
  const root = asRecord(payload);
  const jobs = root?.jobs;
  if (!Array.isArray(jobs)) return [];
  const companyName = asString(root?.name) ?? fallbackCompany;
  const parsed: NormalizedJob[] = [];
  for (const entry of jobs) {
    const job = asRecord(entry);
    if (!job) continue;
    const title = asString(job.title);
    const externalId = asString(job.shortcode) ?? asString(job.id);
    const applyUrl = asString(job.application_url) ?? asString(job.url) ?? asString(job.shortlink);
    if (!title || !externalId || !applyUrl) continue;
    const workplace: Workplace = job.telecommuting === true ? "remote" : asString(job.city) ? "onsite" : "unknown";
    parsed.push({
      source: "workable",
      externalId,
      title,
      companyName,
      descriptionText: htmlToText(asString(job.description) ?? ""),
      locationRaw: [asString(job.city), asString(job.state), asString(job.country)].filter(Boolean).join(", ") || null,
      city: asString(job.city),
      region: asString(job.state),
      country: asString(job.country),
      workplaceHint: workplace,
      applyUrl,
      sourceUrl: asString(job.url),
      postedAt: parseDate(job.published_on) ?? parseDate(job.created_at),
      salary: null,
      raw: { shortcode: externalId, title },
    });
  }
  return parsed;
}

export const workableAdapter: BoardAdapter = {
  source: "workable",
  async fetchJobs(company, fetchImpl: FetchLike = fetch) {
    const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(company.slug)}?details=true`;
    const payload = await fetchJson(url, fetchImpl);
    return parseWorkable(payload, company.name);
  },
};
