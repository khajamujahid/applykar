import type { NormalizedJob, Salary, Workplace } from "@/lib/domain";
import { htmlToText, asRecord, asString, parseDate } from "@/lib/text";
import { fetchJson } from "@/lib/sources/http";
import type { BoardAdapter, FetchLike } from "@/lib/sources/types";

function workplace(value: string | null): Workplace {
  if (!value) return "unknown";
  const normalized = value.toLowerCase();
  if (normalized.includes("hybrid")) return "hybrid";
  if (normalized.includes("remote")) return "remote";
  if (normalized.includes("on")) return "onsite";
  return "unknown";
}

function salary(value: unknown): Salary | null {
  const record = asRecord(value);
  if (!record) return null;
  const min = typeof record.min === "number" ? record.min : null;
  const max = typeof record.max === "number" ? record.max : null;
  if (min == null && max == null) return null;
  const intervalRaw = asString(record.interval)?.toLowerCase() ?? "";
  return {
    min,
    max,
    currency: asString(record.currency) ?? "USD",
    interval: intervalRaw.includes("hour") ? "hour" : "year",
  };
}

export function parseLever(payload: unknown, fallbackCompany: string): NormalizedJob[] {
  if (!Array.isArray(payload)) return [];
  const parsed: NormalizedJob[] = [];
  for (const entry of payload) {
    const job = asRecord(entry);
    if (!job) continue;
    const title = asString(job.text);
    const externalId = asString(job.id);
    const applyUrl = asString(job.applyUrl) ?? asString(job.hostedUrl);
    if (!title || !externalId || !applyUrl) continue;
    const categories = asRecord(job.categories);
    const lists = Array.isArray(job.lists) ? job.lists : [];
    const listText = lists
      .map((item) => {
        const record = asRecord(item);
        if (!record) return "";
        return `${asString(record.text) ?? ""}\n${htmlToText(asString(record.content) ?? "")}`;
      })
      .join("\n");
    const description = [
      asString(job.descriptionPlain) ?? htmlToText(asString(job.description) ?? ""),
      asString(job.openingPlain) ?? "",
      asString(job.additionalPlain) ?? "",
      listText,
    ]
      .filter(Boolean)
      .join("\n\n");
    parsed.push({
      source: "lever",
      externalId,
      title,
      companyName: fallbackCompany,
      descriptionText: description,
      locationRaw: asString(categories?.location),
      city: null,
      region: null,
      country: asString(job.country),
      workplaceHint: workplace(asString(job.workplaceType)),
      applyUrl,
      sourceUrl: asString(job.hostedUrl),
      postedAt: parseDate(job.createdAt),
      salary: salary(job.salaryRange),
      raw: { id: externalId, text: title },
    });
  }
  return parsed;
}

export const leverAdapter: BoardAdapter = {
  source: "lever",
  async fetchJobs(company, fetchImpl: FetchLike = fetch) {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company.slug)}?mode=json`;
    const payload = await fetchJson(url, fetchImpl);
    return parseLever(payload, company.name);
  },
};
