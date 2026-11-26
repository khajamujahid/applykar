import type { NormalizedJob, Workplace } from "@/lib/domain";
import { htmlToText, asRecord, asString, parseDate } from "@/lib/text";
import { fetchJson, NotFoundError } from "@/lib/sources/http";
import type { BoardAdapter, FetchLike } from "@/lib/sources/types";

function workplace(location: Record<string, unknown> | null): Workplace {
  if (!location) return "unknown";
  if (location.hybrid === true) return "hybrid";
  if (location.remote === true) return "remote";
  if (asString(location.city)) return "onsite";
  return "unknown";
}

function descriptionFromDetail(detail: Record<string, unknown> | undefined): string {
  const sections = asRecord(asRecord(detail?.jobAd)?.sections);
  if (!sections) return "";
  return Object.values(sections)
    .map((section) => {
      const record = asRecord(section);
      if (!record) return "";
      const title = asString(record.title) ?? "";
      const text = htmlToText(asString(record.text) ?? "");
      return [title, text].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

export function parseSmartRecruiters(
  payload: unknown,
  fallbackCompany: string,
  details: Record<string, unknown> = {},
): NormalizedJob[] {
  const root = asRecord(payload);
  const content = root?.content ?? (Array.isArray(payload) ? payload : null);
  if (!Array.isArray(content)) return [];
  const parsed: NormalizedJob[] = [];
  for (const entry of content) {
    const job = asRecord(entry);
    if (!job) continue;
    const title = asString(job.name);
    const externalId = asString(job.id) ?? asString(job.uuid);
    if (!title || !externalId) continue;
    const company = asRecord(job.company);
    const location = asRecord(job.location);
    const detail = asRecord(details[externalId]);
    const applyUrl = asString(detail?.applyUrl) ?? asString(job.ref) ?? asString(detail?.postingUrl);
    if (!applyUrl) continue;
    const city = asString(location?.city);
    const region = asString(location?.region);
    const country = asString(location?.country);
    parsed.push({
      source: "smartrecruiters",
      externalId,
      title,
      companyName: asString(company?.name) ?? fallbackCompany,
      descriptionText: descriptionFromDetail(detail ?? undefined),
      locationRaw: asString(location?.fullLocation) ?? [city, region, country].filter(Boolean).join(", "),
      city,
      region,
      country,
      workplaceHint: workplace(location),
      applyUrl,
      sourceUrl: asString(detail?.postingUrl) ?? applyUrl,
      postedAt: parseDate(job.releasedDate),
      salary: null,
      raw: { id: externalId, name: title },
    });
  }
  return parsed;
}

async function fetchDetail(companySlug: string, id: string, fetchImpl: FetchLike): Promise<Record<string, unknown> | null> {
  const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(companySlug)}/postings/${encodeURIComponent(id)}`;
  try {
    return asRecord(await fetchJson(url, fetchImpl));
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    return null;
  }
}

export const smartrecruitersAdapter: BoardAdapter = {
  source: "smartrecruiters",
  async fetchJobs(company, fetchImpl: FetchLike = fetch) {
    const listings: Record<string, unknown>[] = [];
    let offset = 0;
    const limit = 100;
    for (let page = 0; page < 20; page += 1) {
      const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company.slug)}/postings?limit=${limit}&offset=${offset}`;
      const payload = asRecord(await fetchJson(url, fetchImpl));
      if (!payload) break;
      const content = Array.isArray(payload.content) ? payload.content : [];
      for (const item of content) {
        const record = asRecord(item);
        if (record) listings.push(record);
      }
      const total = typeof payload.totalFound === "number" ? payload.totalFound : listings.length;
      offset += limit;
      if (content.length === 0 || offset >= total) break;
    }
    const details: Record<string, unknown> = {};
    const newest = listings.slice(0, 25);
    await mapPool(newest, 4, async (job) => {
      const id = asString(job.id);
      if (!id) return;
      const detail = await fetchDetail(company.slug, id, fetchImpl);
      if (detail) details[id] = detail;
    });
    return parseSmartRecruiters({ content: listings }, company.name, details);
  },
};

export async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      const item = items[current];
      if (item !== undefined) await fn(item);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
}
