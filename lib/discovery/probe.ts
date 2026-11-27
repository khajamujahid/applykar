/**
 * Lightweight existence checks for candidate boards. Uses node:https (Workday rate-limits undici) and never follows
 * redirects: unknown BambooHR / JazzHR tenants redirect to marketing pages, so a redirect means "not a board".
 * Returns the open job count when the endpoint reports it cheaply, -1 when the board exists but the count is unknown,
 * or null when the board does not exist.
 */
import { request } from "node:https";
import type { BoardSource } from "@/lib/domain";
import { boardEndpoints } from "@/lib/companies";

type Res = { status: number; body: string; truncated?: boolean };

function call(url: string, method = "GET", payload?: string, timeoutMs = 15_000): Promise<Res> {
  return new Promise((resolve) => {
    const req = request(
      url,
      {
        method,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; ApplykarBoardDiscovery/1.0)",
          accept: "application/json,text/html;q=0.9,*/*;q=0.5",
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size < 4_000_000) chunks.push(chunk);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), truncated: size >= 4_000_000 }));
        res.on("error", () => resolve({ status: 0, body: "" }));
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve({ status: 0, body: "" }));
    if (payload) req.write(payload);
    req.end();
  });
}

function json(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

const len = (value: unknown) => (Array.isArray(value) ? value.length : -1);

export type ProbeResult = { ok: boolean; jobs: number; retry?: boolean; name?: string };

export async function probeBoard(source: BoardSource, slug: string): Promise<ProbeResult> {
  const e = encodeURIComponent(slug);
  let res: Res;
  switch (source) {
    case "greenhouse":
      res = await call(`https://boards-api.greenhouse.io/v1/boards/${e}/jobs`);
      break;
    case "lever":
      res = await call(`https://api.lever.co/v0/postings/${e}?mode=json`);
      break;
    case "ashby":
      res = await call(`https://api.ashbyhq.com/posting-api/job-board/${e}`);
      break;
    case "smartrecruiters":
      res = await call(`https://api.smartrecruiters.com/v1/companies/${e}/postings?limit=1`);
      break;
    case "workable":
      res = await call(`https://apply.workable.com/api/v1/widget/accounts/${e}`);
      break;
    case "workday":
      res = await call(boardEndpoints(source, slug).apiUrl, "POST", JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }));
      break;
    default:
      res = await call(boardEndpoints(source, slug).apiUrl);
  }
  if (res.status === 0 || res.status === 429 || res.status >= 500) return { ok: false, jobs: 0, retry: true };
  if (res.status !== 200) return { ok: false, jobs: 0 };
  if (res.truncated) return { ok: true, jobs: -1 };
  const data = json(res.body) as Record<string, unknown> | unknown[] | undefined;
  const obj = (data && !Array.isArray(data) ? data : {}) as Record<string, unknown>;
  switch (source) {
    case "greenhouse":
      return Array.isArray(obj.jobs) ? { ok: true, jobs: obj.jobs.length } : { ok: false, jobs: 0 };
    case "lever":
      return Array.isArray(data) ? { ok: true, jobs: data.length } : { ok: false, jobs: 0 };
    case "ashby":
      return Array.isArray(obj.jobs) ? { ok: true, jobs: obj.jobs.length } : { ok: false, jobs: 0 };
    case "smartrecruiters": {
      const total = Number(obj.totalFound ?? 0);
      return total > 0 ? { ok: true, jobs: total } : { ok: false, jobs: 0 };
    }
    case "workable":
      return obj.name || Array.isArray(obj.jobs) ? { ok: true, jobs: len(obj.jobs), name: String(obj.name ?? "") || undefined } : { ok: false, jobs: 0 };
    case "workday":
      return typeof obj.total === "number" ? { ok: true, jobs: obj.total } : { ok: false, jobs: 0 };
    case "recruitee":
      return Array.isArray(obj.offers) ? { ok: true, jobs: obj.offers.length } : { ok: false, jobs: 0 };
    case "bamboohr":
      return Array.isArray(obj.result) ? { ok: true, jobs: obj.result.length } : { ok: false, jobs: 0 };
    case "breezy":
      return Array.isArray(data) ? { ok: true, jobs: data.length } : { ok: false, jobs: 0 };
    case "rippling": {
      const items = Array.isArray(data) ? data : (obj.items ?? obj.results ?? obj.jobs);
      return data ? { ok: true, jobs: len(items) } : { ok: false, jobs: 0 };
    }
    case "icims":
      return /icims/i.test(res.body) ? { ok: true, jobs: -1 } : { ok: false, jobs: 0 };
    case "jazzhr":
      return /applytojob|resumator/i.test(res.body) ? { ok: true, jobs: (res.body.match(/\/apply\/[A-Za-z0-9]{6,}\//g) ?? []).length || -1 } : { ok: false, jobs: 0 };
  }
}
