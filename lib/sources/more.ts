import type { NormalizedJob, Workplace } from "@/lib/domain";
import { asRecord, asString, decodeHtml, htmlToText, parseDate } from "@/lib/text";
import { fetchJson, NotFoundError } from "@/lib/sources/http";
import type { BoardAdapter, FetchLike } from "@/lib/sources/types";
import { USER_AGENT } from "@/lib/sources/types";
import { request as httpsRequest } from "node:https";

/** Workday rejects undici's fetch fingerprint with 429, so post with node:https. */
function postJson(url: string, body: unknown, attempt = 0): Promise<unknown> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: "POST",
        timeout: 30_000,
        headers: { "content-type": "application/json", accept: "application/json", "content-length": Buffer.byteLength(payload) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status === 404) return reject(new NotFoundError());
          if ((status === 429 || status >= 500) && attempt < 3) {
            setTimeout(() => postJson(url, body, attempt + 1).then(resolve, reject), 2000 * 2 ** attempt);
            return;
          }
          if (status < 200 || status >= 300) return reject(new Error(`Request failed with ${status}`));
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
    req.end(payload);
  });
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value.map(asRecord).filter(Boolean) as Record<string, unknown>[]) : [];
}

function job(partial: Omit<NormalizedJob, "salary" | "raw" | "sourceUrl"> & { sourceUrl?: string | null }): NormalizedJob {
  return { salary: null, raw: {}, sourceUrl: partial.sourceUrl ?? partial.applyUrl, ...partial };
}

export function parseRecruitee(payload: unknown, fallbackCompany: string): NormalizedJob[] {
  return list(asRecord(payload)?.offers).flatMap((offer) => {
    const title = asString(offer.title);
    const id = asString(offer.id) ?? (typeof offer.id === "number" ? String(offer.id) : null);
    const url = asString(offer.careers_url);
    if (!title || !id || !url) return [];
    const workplace: Workplace = offer.remote === true ? "remote" : offer.hybrid === true ? "hybrid" : "unknown";
    return [
      job({
        source: "recruitee",
        externalId: id,
        title,
        companyName: asString(offer.company_name) ?? fallbackCompany,
        descriptionText: htmlToText(`${asString(offer.description) ?? ""}\n${asString(offer.requirements) ?? ""}`),
        locationRaw: asString(offer.location),
        city: asString(offer.city),
        region: asString(offer.state_code) ?? asString(offer.state_name),
        country: asString(offer.country_code) ?? asString(offer.country),
        workplaceHint: workplace,
        applyUrl: asString(offer.careers_apply_url) ?? url,
        sourceUrl: url,
        postedAt: parseDate(offer.published_at) ?? parseDate(offer.created_at),
      }),
    ];
  });
}

export function parseBamboo(payload: unknown, slug: string, fallbackCompany: string): NormalizedJob[] {
  return list(asRecord(payload)?.result).flatMap((entry) => {
    const title = asString(entry.jobOpeningName);
    const id = asString(entry.id) ?? (typeof entry.id === "number" ? String(entry.id) : null);
    if (!title || !id) return [];
    const location = asRecord(entry.location);
    const ats = asRecord(entry.atsLocation);
    const city = asString(location?.city) ?? asString(ats?.city);
    const region = asString(location?.state) ?? asString(ats?.state) ?? asString(ats?.province);
    const country = asString(ats?.country);
    const url = `https://${slug}.bamboohr.com/careers/${id}`;
    return [
      job({
        source: "bamboohr",
        externalId: id,
        title,
        companyName: fallbackCompany,
        descriptionText: "",
        locationRaw: [city, region, country].filter(Boolean).join(", ") || null,
        city,
        region,
        country,
        workplaceHint: entry.isRemote === true || entry.locationType === "1" ? "remote" : entry.locationType === "2" ? "hybrid" : "unknown",
        applyUrl: url,
        postedAt: null,
      }),
    ];
  });
}

export function parseBreezy(payload: unknown, fallbackCompany: string): NormalizedJob[] {
  return list(payload).flatMap((entry) => {
    const title = asString(entry.name);
    const id = asString(entry.id);
    const url = asString(entry.url);
    if (!title || !id || !url) return [];
    const location = asRecord(entry.location);
    const country = asRecord(location?.country);
    const state = asRecord(location?.state);
    return [
      job({
        source: "breezy",
        externalId: id,
        title,
        companyName: asString(asRecord(entry.company)?.name) ?? fallbackCompany,
        descriptionText: htmlToText(asString(entry.description) ?? ""),
        locationRaw: asString(location?.name),
        city: asString(location?.city),
        region: asString(state?.id) ?? asString(state?.name),
        country: asString(country?.id) ?? asString(country?.name),
        workplaceHint: location?.is_remote === true ? "remote" : "unknown",
        applyUrl: url,
        postedAt: parseDate(entry.published_date),
      }),
    ];
  });
}

/** Workday slug format: "<tenant>.<wdN>/<site>", e.g. "nvidia.wd5/NVIDIAExternalCareerSite". */
export function workdayParts(slug: string): { host: string; tenant: string; site: string } {
  const [hostPart, ...siteParts] = slug.split("/");
  const tenant = hostPart.split(".")[0];
  return { host: `${hostPart}.myworkdayjobs.com`, tenant, site: siteParts.join("/") };
}

function relativeDate(value: string | null): Date | null {
  if (!value) return null;
  const now = Date.now();
  if (/today/i.test(value)) return new Date(now);
  if (/yesterday/i.test(value)) return new Date(now - 86_400_000);
  const days = /(\d+)\+?\s*days?/i.exec(value);
  if (days) return new Date(now - Number(days[1]) * 86_400_000);
  return null;
}

export function parseWorkday(payload: unknown, slug: string, fallbackCompany: string): NormalizedJob[] {
  const { host, site } = workdayParts(slug);
  return list(asRecord(payload)?.jobPostings).flatMap((entry) => {
    const title = asString(entry.title);
    const path = asString(entry.externalPath);
    if (!title || !path) return [];
    let locationRaw = asString(entry.locationsText);
    if (!locationRaw || /\d+\s+locations/i.test(locationRaw)) {
      const segment = /^\/job\/([^/]+)\//.exec(path)?.[1];
      if (segment) locationRaw = decodeURIComponent(segment).replace(/-/g, " ");
    }
    const bullets = Array.isArray(entry.bulletFields) ? entry.bulletFields.map(String) : [];
    const id = bullets[0] || path.split("_").pop() || path;
    const url = `https://${host}/${site}${path}`;
    return [
      job({
        source: "workday",
        externalId: id,
        title,
        companyName: fallbackCompany,
        descriptionText: "",
        locationRaw,
        city: null,
        region: null,
        country: null,
        workplaceHint: /remote/i.test(locationRaw ?? "") ? "remote" : "unknown",
        applyUrl: url,
        postedAt: relativeDate(asString(entry.postedOn)),
      }),
    ];
  });
}

export function parseIcims(html: string, fallbackCompany: string): NormalizedJob[] {
  const results: NormalizedJob[] = [];
  for (const block of html.split(/<li class="iCIMS_JobCardItem/).slice(1)) {
    const link = /href="(https:\/\/[^"]+\/jobs\/(\d+)\/[^"]+)"/.exec(block);
    const title = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(block)?.[1];
    if (!link || !title) continue;
    const loc = /Job Locations<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/.exec(block)?.[1];
    const description = /class="col-xs-12 description">([\s\S]*?)<\/div>/.exec(block)?.[1] ?? "";
    let locationRaw = loc ? decodeHtml(loc).trim() : null;
    let country: string | null = null;
    if (locationRaw && /^US-/.test(locationRaw)) {
      country = "US";
      locationRaw = locationRaw.replace(/^US-([A-Z]{2})-(.+)$/, "$2, $1");
    }
    const url = link[1].replace(/([?&])in_iframe=1&?/, "$1").replace(/[?&]$/, "");
    results.push(
      job({
        source: "icims",
        externalId: link[2],
        title: decodeHtml(title).trim(),
        companyName: fallbackCompany,
        descriptionText: htmlToText(description),
        locationRaw,
        city: null,
        region: null,
        country,
        workplaceHint: /remote/i.test(locationRaw ?? "") ? "remote" : "unknown",
        applyUrl: url,
        postedAt: null,
      }),
    );
  }
  return results;
}

async function fetchText(url: string, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (response.status === 404) throw new NotFoundError();
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return response.text();
}

export const recruiteeAdapter: BoardAdapter = {
  source: "recruitee",
  async fetchJobs(company, fetchImpl: FetchLike = fetch) {
    return parseRecruitee(await fetchJson(`https://${company.slug}.recruitee.com/api/offers/`, fetchImpl), company.name);
  },
};

export const bamboohrAdapter: BoardAdapter = {
  source: "bamboohr",
  async fetchJobs(company, fetchImpl: FetchLike = fetch) {
    return parseBamboo(await fetchJson(`https://${company.slug}.bamboohr.com/careers/list`, fetchImpl), company.slug, company.name);
  },
};

export const breezyAdapter: BoardAdapter = {
  source: "breezy",
  async fetchJobs(company, fetchImpl: FetchLike = fetch) {
    return parseBreezy(await fetchJson(`https://${company.slug}.breezy.hr/json`, fetchImpl), company.name);
  },
};

export const workdayAdapter: BoardAdapter = {
  source: "workday",
  async fetchJobs(company) {
    const { host, tenant, site } = workdayParts(company.slug);
    const url = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
    const all: NormalizedJob[] = [];
    const maxPages = Number(process.env.WORKDAY_MAX_PAGES || 15);
    for (let page = 0; page < maxPages; page += 1) {
      const payload = await postJson(url, { limit: 20, offset: page * 20, appliedFacets: {}, searchText: "" });
      const parsed = parseWorkday(payload, company.slug, company.name);
      all.push(...parsed);
      const total = Number(asRecord(payload)?.total ?? 0);
      if (parsed.length < 20 || (total && (page + 1) * 20 >= total)) break;
    }
    return all;
  },
};

export const icimsAdapter: BoardAdapter = {
  source: "icims",
  async fetchJobs(company, fetchImpl: FetchLike = fetch) {
    const all: NormalizedJob[] = [];
    for (let page = 0; page < Number(process.env.ICIMS_MAX_PAGES || 5); page += 1) {
      const html = await fetchText(`https://careers-${company.slug}.icims.com/jobs/search?ss=1&in_iframe=1&pr=${page}`, fetchImpl);
      const parsed = parseIcims(html, company.name).filter((item) => !all.some((seen) => seen.externalId === item.externalId));
      if (parsed.length === 0) break;
      all.push(...parsed);
    }
    return all;
  },
};

export function parseRippling(payload: unknown, fallbackCompany: string): NormalizedJob[] {
  return list(asRecord(payload)?.items).flatMap((entry) => {
    const title = asString(entry.name);
    const id = asString(entry.id);
    const url = asString(entry.url);
    if (!title || !id || !url) return [];
    const location = list(entry.locations)[0];
    const type = asString(location?.workplaceType) ?? "";
    return [
      job({
        source: "rippling",
        externalId: id,
        title,
        companyName: fallbackCompany,
        descriptionText: "",
        locationRaw: asString(location?.name),
        city: asString(location?.city),
        region: asString(location?.stateCode),
        country: asString(location?.countryCode) ?? asString(location?.country),
        workplaceHint: type === "REMOTE" ? "remote" : type === "HYBRID" ? "hybrid" : type === "ON_SITE" ? "onsite" : "unknown",
        applyUrl: url,
        postedAt: null,
      }),
    ];
  });
}

export function parseJazz(html: string, fallbackCompany: string): NormalizedJob[] {
  const results: NormalizedJob[] = [];
  for (const block of html.split(/<li class="list-group-item">/).slice(1)) {
    const link = /<a href="(https:\/\/[^"]+\.applytojob\.com\/apply\/([A-Za-z0-9]+)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!link) continue;
    const loc = /fa-map-marker'><\/i>([^<]*)</.exec(block)?.[1]?.trim() || null;
    results.push(
      job({
        source: "jazzhr",
        externalId: link[2],
        title: decodeHtml(link[3]).trim(),
        companyName: fallbackCompany,
        descriptionText: "",
        locationRaw: loc ? decodeHtml(loc) : null,
        city: null,
        region: null,
        country: null,
        workplaceHint: /remote/i.test(loc ?? "") ? "remote" : "unknown",
        applyUrl: link[1],
        postedAt: null,
      }),
    );
  }
  return results;
}

export const ripplingAdapter: BoardAdapter = {
  source: "rippling",
  async fetchJobs(company, fetchImpl: FetchLike = fetch) {
    const all: NormalizedJob[] = [];
    for (let page = 0; page < 10; page += 1) {
      const payload = await fetchJson(`https://ats.rippling.com/api/v2/board/${company.slug}/jobs?page=${page}`, fetchImpl);
      all.push(...parseRippling(payload, company.name));
      const pages = Number(asRecord(payload)?.totalPages ?? 0);
      if (page + 1 >= pages) break;
    }
    return all;
  },
};

export const jazzhrAdapter: BoardAdapter = {
  source: "jazzhr",
  async fetchJobs(company, fetchImpl: FetchLike = fetch) {
    return parseJazz(await fetchText(`https://${company.slug}.applytojob.com/apply`, fetchImpl), company.name);
  },
};
