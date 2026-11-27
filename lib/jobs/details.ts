/**
 * Full job descriptions, fetched on demand from the source ATS (the feed keeps a 500-char excerpt to stay inside the
 * free database). Results are cached in job_details. Output is plain text with "• " list items and heading lines.
 */
import { USER_AGENT } from "@/lib/sources/types";
import { workdayParts } from "@/lib/sources/more";

export type DetailRef = { source: string; externalId: string; companySlug: string; applyUrl: string; sourceUrl: string | null };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "-", mdash: "-", bull: "•", hellip: "..." };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  let s = html;
  if (/&lt;\s*(p|div|li|ul|br|strong|h\d)/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|tr|section)>/gi, "\n")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<h[1-6][^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((l, i, arr) => l && !(l === "•" && arr[i + 1]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function get(url: string, accept = "application/json"): Promise<Response> {
  return fetch(url, { headers: { accept, "user-agent": USER_AGENT }, signal: AbortSignal.timeout(15_000), redirect: "follow" });
}
async function json(url: string): Promise<Record<string, unknown> | null> {
  const r = await get(url);
  return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
}
const str = (v: unknown) => (typeof v === "string" ? v : "");

function jsonLdDescription(html: string): string {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]) as unknown;
      const nodes = (Array.isArray(data) ? data : [data, ...((data as { "@graph"?: unknown[] })?.["@graph"] ?? [])]) as Record<string, unknown>[];
      const posting = nodes.find((n) => n && n["@type"] === "JobPosting");
      if (posting && str(posting.description)) return htmlToText(str(posting.description));
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return "";
}

async function fromHtmlPage(url: string): Promise<string> {
  const r = await get(url, "text/html");
  if (!r.ok) return "";
  const html = await r.text();
  const ld = jsonLdDescription(html);
  if (ld.length > 200) return ld;
  const meta = /<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']+)/i.exec(html)?.[1];
  const main = /<(main|article)[^>]*>([\s\S]*?)<\/\1>/i.exec(html)?.[2];
  const text = main ? htmlToText(main) : "";
  return text.length > 200 ? text : meta ? decodeEntities(meta) : "";
}

export async function fetchJobDescription(ref: DetailRef): Promise<string> {
  const id = ref.externalId.slice(ref.externalId.indexOf(":") + 1);
  const slug = ref.companySlug;
  try {
    switch (ref.source) {
      case "greenhouse": {
        const d = await json(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs/${id}?pay_transparency=true`);
        if (d) return htmlToText(str(d.content));
        break;
      }
      case "lever": {
        const d = await json(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}/${id}`);
        if (d) {
          const lists = ((d.lists as { text?: string; content?: string }[]) ?? []).map((l) => `${l.text ?? ""}\n${htmlToText(l.content ?? "")}`);
          return [htmlToText(str(d.description)), ...lists, htmlToText(str(d.additional))].filter(Boolean).join("\n\n");
        }
        break;
      }
      case "ashby": {
        const d = await json(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`);
        const job = ((d?.jobs as Record<string, unknown>[]) ?? []).find((j) => j.id === id);
        if (job) return htmlToText(str(job.descriptionHtml)) || str(job.descriptionPlain);
        break;
      }
      case "smartrecruiters": {
        const d = await json(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings/${id}`);
        const sections = (d?.jobAd as { sections?: Record<string, { title?: string; text?: string }> })?.sections;
        if (sections)
          return ["companyDescription", "jobDescription", "qualifications", "additionalInformation"]
            .map((k) => sections[k])
            .filter((s) => s?.text)
            .map((s) => `${s!.title ?? ""}\n${htmlToText(s!.text!)}`)
            .join("\n\n");
        break;
      }
      case "workable": {
        const d = await json(`https://apply.workable.com/api/v2/accounts/${encodeURIComponent(slug)}/jobs/${id}`);
        if (d)
          return [htmlToText(str(d.description)), d.requirements ? `Requirements\n${htmlToText(str(d.requirements))}` : "", d.benefits ? `Benefits\n${htmlToText(str(d.benefits))}` : ""]
            .filter(Boolean)
            .join("\n\n");
        break;
      }
      case "workday": {
        const { host, tenant, site } = workdayParts(slug);
        const path = new URL(ref.applyUrl).pathname.split("/job/")[1];
        if (path) {
          const d = await json(`https://${host}/wday/cxs/${tenant}/${site}/job/${path}`);
          const info = d?.jobPostingInfo as Record<string, unknown> | undefined;
          if (info) return htmlToText(str(info.jobDescription));
        }
        break;
      }
      case "recruitee": {
        const d = await json(`https://${slug}.recruitee.com/api/offers/${id}`);
        const offer = d?.offer as Record<string, unknown> | undefined;
        if (offer) return [htmlToText(str(offer.description)), offer.requirements ? `Requirements\n${htmlToText(str(offer.requirements))}` : ""].filter(Boolean).join("\n\n");
        break;
      }
      case "bamboohr": {
        const d = await json(`https://${slug}.bamboohr.com/careers/${id}/detail`);
        const opening = (d?.result as { jobOpening?: Record<string, unknown> })?.jobOpening;
        if (opening) return htmlToText(str(opening.description));
        break;
      }
      case "icims":
        return fromHtmlPage(`${ref.applyUrl.split("?")[0]}?in_iframe=1`);
    }
    return await fromHtmlPage(ref.sourceUrl || ref.applyUrl);
  } catch {
    return "";
  }
}

export type JobSections = { about: string[]; responsibilities: string[]; qualifications: string[]; benefits: string[]; pay: string[] };

const HEADINGS: [keyof JobSections, RegExp][] = [
  ["responsibilities", /^(key |your |primary |core |essential )?(responsibilities|duties|what you('| wi)ll do|what you will be doing|the role|role overview|in this role|day[- ]to[- ]day|job duties)/i],
  ["qualifications", /^(minimum |basic |preferred |required |desired )?(qualifications|requirements|what you('| wi)ll (need|bring)|what we('re| are) looking for|skills|about you|who you are|who we are looking for|what you bring|you have|experience|education|must have|nice to have)/i],
  ["benefits", /^(benefits|perks|what we offer|why (join|work)|our benefits|we offer|compensation (&|and) benefits|total rewards)/i],
  ["pay", /^(pay|salary|compensation|base pay|pay range|pay transparency)/i],
];

/** Split a description into the sections the job detail panel shows. */
export function splitSections(text: string): JobSections {
  const out: JobSections = { about: [], responsibilities: [], qualifications: [], benefits: [], pay: [] };
  let current: keyof JobSections = "about";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = !line.startsWith("•") && line.length < 70 && !/[.!?]$/.test(line.replace(/:$/, "")) ? HEADINGS.find(([, re]) => re.test(line.replace(/^#+\s*/, ""))) : undefined;
    if (heading) {
      current = heading[0];
      continue;
    }
    const money = /\$\s?\d|per hour|hourly|annual(ly)? salary/i.test(line);
    if (current === "pay" && !money) {
      out.about.push(line.replace(/^•\s*/, ""));
      continue;
    }
    out[current].push(line.replace(/^•\s*/, ""));
    if (/\$\s?\d[\d,.]*\s*[kK]?\s*(-|–|to)\s*\$?\s?\d/.test(line) && current !== "pay") out.pay.push(line.replace(/^•\s*/, ""));
  }
  return out;
}
