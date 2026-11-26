import type { NormalizedJob, Salary, Workplace } from "@/lib/domain";
import { htmlToText, asRecord, asString, parseDate, slugify } from "@/lib/text";
import { fetchJson } from "@/lib/sources/http";
import type { FetchLike, OptionalAdapter } from "@/lib/sources/types";

function yearly(min: unknown, max: unknown, period: string | null): Salary | null {
  const low = typeof min === "number" ? min : null;
  const high = typeof max === "number" ? max : null;
  if (low == null && high == null) return null;
  const hour = (period ?? "").toLowerCase().includes("hour");
  return { min: low, max: high, currency: "USD", interval: hour ? "hour" : "year" };
}

export function parseAdzuna(payload: unknown): NormalizedJob[] {
  const results = asRecord(payload)?.results;
  if (!Array.isArray(results)) return [];
  const parsed: NormalizedJob[] = [];
  for (const entry of results) {
    const job = asRecord(entry);
    if (!job) continue;
    const title = asString(job.title);
    const externalId = asString(job.id);
    const applyUrl = asString(job.redirect_url);
    const company = asRecord(job.company);
    const companyName = asString(company?.display_name);
    if (!title || !externalId || !applyUrl || !companyName) continue;
    const location = asRecord(job.location);
    parsed.push({
      source: "adzuna",
      externalId,
      title: htmlToText(title),
      companyName,
      descriptionText: htmlToText(asString(job.description) ?? ""),
      locationRaw: asString(location?.display_name),
      city: null,
      region: null,
      country: "US",
      workplaceHint: /\bremote\b/i.test(`${title} ${asString(location?.display_name) ?? ""}`) ? "remote" : "unknown",
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: parseDate(job.created),
      salary: yearly(job.salary_min, job.salary_max, null),
      raw: { id: externalId },
    });
  }
  return parsed;
}

export function parseUsajobs(payload: unknown): NormalizedJob[] {
  const items = asRecord(asRecord(payload)?.SearchResult)?.SearchResultItems;
  if (!Array.isArray(items)) return [];
  const parsed: NormalizedJob[] = [];
  for (const entry of items) {
    const wrapper = asRecord(entry);
    const job = asRecord(wrapper?.MatchedObjectDescriptor);
    if (!job) continue;
    const title = asString(job.PositionTitle);
    const externalId = asString(wrapper?.MatchedObjectId);
    const applyList = Array.isArray(job.ApplyURI) ? job.ApplyURI : [];
    const applyUrl = asString(applyList[0]) ?? asString(job.PositionURI);
    const companyName = asString(job.OrganizationName) ?? asString(job.DepartmentName) ?? "USAJobs";
    if (!title || !externalId || !applyUrl) continue;
    const locations = Array.isArray(job.PositionLocation) ? job.PositionLocation : [];
    const location = asRecord(locations[0]);
    const payList = Array.isArray(job.PositionRemuneration) ? job.PositionRemuneration : [];
    const pay = asRecord(payList[0]);
    const min = pay ? Number(pay.MinimumRange) : Number.NaN;
    const max = pay ? Number(pay.MaximumRange) : Number.NaN;
    const details = asRecord(asRecord(job.UserArea)?.Details);
    const workplace: Workplace = /\bremote\b/i.test(asString(job.PositionLocationDisplay) ?? "") ? "remote" : "unknown";
    parsed.push({
      source: "usajobs",
      externalId,
      title,
      companyName,
      descriptionText: htmlToText(asString(job.QualificationSummary) ?? asString(details?.JobSummary) ?? ""),
      locationRaw: asString(job.PositionLocationDisplay),
      city: asString(location?.CityName),
      region: asString(location?.CountrySubDivisionCode),
      country: asString(location?.CountryCode) ?? "United States",
      workplaceHint: workplace,
      applyUrl,
      sourceUrl: asString(job.PositionURI),
      postedAt: parseDate(job.PublicationStartDate),
      salary: yearly(Number.isFinite(min) ? min : null, Number.isFinite(max) ? max : null, asString(pay?.RateIntervalCode)),
      raw: { id: externalId },
    });
  }
  return parsed;
}

export function parseJsearch(payload: unknown): NormalizedJob[] {
  const data = asRecord(payload)?.data;
  if (!Array.isArray(data)) return [];
  const parsed: NormalizedJob[] = [];
  for (const entry of data) {
    const job = asRecord(entry);
    if (!job) continue;
    const title = asString(job.job_title);
    const externalId = asString(job.job_id);
    const applyUrl = asString(job.job_apply_link);
    const companyName = asString(job.employer_name);
    if (!title || !externalId || !applyUrl || !companyName) continue;
    const city = asString(job.job_city);
    const region = asString(job.job_state);
    const country = asString(job.job_country);
    parsed.push({
      source: "jsearch",
      externalId,
      title,
      companyName,
      descriptionText: htmlToText(asString(job.job_description) ?? ""),
      locationRaw: [city, region, country].filter(Boolean).join(", ") || null,
      city,
      region,
      country,
      workplaceHint: job.job_is_remote === true ? "remote" : "unknown",
      applyUrl,
      sourceUrl: applyUrl,
      postedAt: parseDate(job.job_posted_at_datetime_utc),
      salary: yearly(job.job_min_salary, job.job_max_salary, asString(job.job_salary_period)),
      raw: { id: externalId },
    });
  }
  return parsed;
}

export function employerSlug(name: string): string {
  return slugify(name) || "employer";
}

export const adzunaAdapter: OptionalAdapter = {
  source: "adzuna",
  enabled: () => Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
  async fetchJobs(fetchImpl: FetchLike = fetch) {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) return [];
    const what = encodeURIComponent(process.env.ADZUNA_QUERY || "software engineer");
    const url = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}&results_per_page=50&what=${what}&content-type=application/json`;
    const payload = await fetchJson(url, fetchImpl);
    return parseAdzuna(payload);
  },
};

export const usajobsAdapter: OptionalAdapter = {
  source: "usajobs",
  enabled: () => Boolean(process.env.USAJOBS_API_KEY),
  async fetchJobs(fetchImpl: FetchLike = fetch) {
    const key = process.env.USAJOBS_API_KEY;
    if (!key) return [];
    const query = encodeURIComponent(process.env.USAJOBS_QUERY || "software engineer");
    const url = `https://data.usajobs.gov/api/search?Keyword=${query}&ResultsPerPage=50`;
    const payload = await fetchJson(url, fetchImpl, {
      headers: {
        "authorization-key": key,
        "user-agent": process.env.USAJOBS_USER_AGENT || "applykar@localhost",
      },
    });
    return parseUsajobs(payload);
  },
};

export const jsearchAdapter: OptionalAdapter = {
  source: "jsearch",
  enabled: () => Boolean(process.env.JSEARCH_API_KEY),
  async fetchJobs(fetchImpl: FetchLike = fetch) {
    const key = process.env.JSEARCH_API_KEY;
    if (!key) return [];
    const host = process.env.JSEARCH_API_HOST || "jsearch.p.rapidapi.com";
    const query = encodeURIComponent(process.env.JSEARCH_QUERY || "software engineer in united states");
    const url = `https://${host}/search?query=${query}&page=1&num_pages=1`;
    const payload = await fetchJson(url, fetchImpl, {
      headers: {
        "x-rapidapi-key": key,
        "x-rapidapi-host": host,
      },
    });
    return parseJsearch(payload);
  },
};

export const optionalAdapters = [adzunaAdapter, usajobsAdapter, jsearchAdapter];
