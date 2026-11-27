/**
 * Daily board discovery (GitHub Actions, khajamujahid/applykar-worker → discover.yml).
 * Finds ATS boards that are not in `companies` yet, checks each one against the ATS's public API, and adds the
 * real ones so the hourly ingest starts polling them (new boards have last_synced_at NULL, so they sync first).
 *
 * Sources, in order:
 *   postings   board links seen in ingested postings (queued by mass-ingest) + links in stored jobs
 *   lists      public board lists on GitHub (curated repos + repository search), re-read only when they change
 *   crawl      Common Crawl URL index: the newest crawl every day plus two older crawls in rotation
 *   search     Workable's public US job search → names of companies hiring right now
 *   names      every known company name tried as a slug on the other ATS (rotating window, ~200k checks/day)
 *
 * Storage: only boards (tiny rows) are written; rejects are remembered for 30 days so they aren't re-checked.
 * The jobs-table size guard stays in mass-ingest (760 MB); discovery stops adding boards above the hard cap.
 */
import { config } from "dotenv";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import pg from "pg";
import type { BoardSource } from "../lib/domain";
import { BOARD_SOURCES } from "../lib/domain";
import { boardEndpoints } from "../lib/companies";
import { extractBoards, nameSlugs, normaliseSlug, type BoardRef } from "../lib/discovery/extract";
import { parseList } from "../lib/discovery/lists";
import { probeBoard } from "../lib/discovery/probe";

config({ path: ".env.local" });
config({ path: ".env" });

const DRY = process.env.DISCOVER_DRY === "1"; // box testing: no DB, known set from data/boards.tsv.gz
const MAX_MINUTES = Number(process.env.DISCOVER_MAX_MINUTES || 45);
const CONCURRENCY = Number(process.env.DISCOVER_CONCURRENCY || 48);
const NAME_PROBES = Number(process.env.DISCOVER_NAME_PROBES || 200_000);
const HARD_CAP_MB = Number(process.env.DISCOVER_HARD_CAP_MB || 900);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const started = Date.now();
const minutesLeft = () => MAX_MINUTES - (Date.now() - started) / 60_000;
const log = (...args: unknown[]) => console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s]`, ...args);
const pool = DRY ? null : new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const q = async <T extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  pool ? (await pool.query<T>(sql, params)).rows : ([] as T[]);

const key = (source: string, slug: string) => `${source}\t${slug.toLowerCase()}`;
const known = new Set<string>();
const rejected = new Set<string>();
const candidates = new Map<string, BoardRef & { via: string }>();
const stats: Record<string, number | string> = {};
const bump = (name: string, by = 1) => (stats[name] = Number(stats[name] ?? 0) + by);

function offer(ref: BoardRef, via: string): void {
  if (!(BOARD_SOURCES as readonly string[]).includes(ref.source)) return;
  const k = key(ref.source, ref.slug);
  if (known.has(k) || rejected.has(k) || candidates.has(k)) return;
  candidates.set(k, { ...ref, via });
  bump(`candidates_${via}`);
}

async function getState<T>(name: string, fallback: T): Promise<T> {
  const rows = await q<{ value: T }>("SELECT value FROM discovery_state WHERE key = $1", [name]);
  return rows[0]?.value ?? fallback;
}
async function setState(name: string, value: unknown): Promise<void> {
  await q(
    `INSERT INTO discovery_state (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [name, JSON.stringify(value)],
  );
}

async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<{ status: number; text: string; buf?: Buffer }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "ApplykarBoardDiscovery/1.0", ...(init.headers ?? {}) } });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, text: buf.toString("utf8"), buf };
  } catch {
    return { status: 0, text: "" };
  }
}

// ---------- known boards ----------
async function loadKnown(): Promise<string[]> {
  const names: string[] = [];
  if (DRY) {
    for (const line of gunzipSync(readFileSync("data/boards.tsv.gz")).toString("utf8").split("\n")) {
      const [source, slug, name] = line.split("\t");
      if (source && slug) known.add(key(source, slug)), names.push(name || slug);
    }
    return names;
  }
  for (const row of await q<{ source: string; slug: string; name: string }>("SELECT source::text, slug, name FROM companies")) {
    known.add(key(row.source, row.slug));
    names.push(row.name);
  }
  for (const row of await q<{ source: string; slug: string }>(
    "SELECT source::text, slug FROM board_discovery WHERE status = 'rejected' AND checked_at > now() - interval '30 days'",
  ))
    rejected.add(key(row.source, row.slug));
  return names;
}

// ---------- source: postings ----------
async function fromPostings(): Promise<void> {
  for (const row of await q<{ source: string; slug: string }>("SELECT source::text, slug FROM board_discovery WHERE status = 'candidate' LIMIT 50000"))
    offer({ source: row.source as BoardSource, slug: row.slug }, "postings");
  const hosts = "greenhouse\\.io|lever\\.co|ashbyhq\\.com|smartrecruiters\\.com|workable\\.com|myworkdayjobs\\.com|icims\\.com|recruitee\\.com|bamboohr\\.com|breezy\\.hr|rippling\\.com|applytojob\\.com";
  const rows = await q<{ t: string }>(
    `SELECT DISTINCT substring(apply_url from '^https?://[^/?#]+(?:/[^/?#]+){0,2}') t FROM jobs WHERE apply_url ~ '(${hosts})'
     UNION
     SELECT DISTINCT substring(source_url from '^https?://[^/?#]+(?:/[^/?#]+){0,2}') FROM jobs WHERE source_url ~ '(${hosts})'
     UNION
     SELECT DISTINCT (regexp_matches(description_text, 'https?://[A-Za-z0-9.-]*(?:${hosts})[^\\s"''<>)]*', 'g'))[1] FROM jobs WHERE description_text ~ '(${hosts})'`,
  ).catch((error: unknown) => (log("postings scan failed", String(error).slice(0, 200)), []));
  for (const row of rows) for (const ref of extractBoards(row.t ?? "")) offer(ref, "postings");
}

// ---------- source: GitHub lists ----------
const CURATED = ["kalil0321/ats-scrapers", "moonie0201/ats-directory", "datakit457/ats-company-slugs", "Wordhalm/ats-job-board-finder"];
const SEARCHES = [
  "greenhouse lever ashby companies",
  "ats company slugs",
  "ats directory greenhouse",
  "job board slugs greenhouse lever",
  "myworkdayjobs companies list",
  "ats scrapers companies",
  "greenhouse boards list",
  "company career pages ats dataset",
];
const CODE_SEARCHES = ["job-boards.greenhouse.io extension:csv", "jobs.lever.co extension:csv", "jobs.ashbyhq.com extension:json", "myworkdayjobs.com extension:csv"];

async function gh(path: string): Promise<unknown> {
  const res = await fetchText(`https://api.github.com/${path}`, {
    headers: { accept: "application/vnd.github+json", ...(GITHUB_TOKEN ? { authorization: `Bearer ${GITHUB_TOKEN}` } : {}) },
  });
  if (res.status !== 200) return null;
  try {
    return JSON.parse(res.text);
  } catch {
    return null;
  }
}

async function fromGithub(names: Set<string>): Promise<void> {
  const repos = new Map<string, string>(); // full_name -> pushed_at
  for (const repo of CURATED) {
    const meta = (await gh(`repos/${repo}`)) as { full_name?: string; pushed_at?: string } | null;
    if (meta?.full_name) repos.set(meta.full_name, meta.pushed_at ?? "");
  }
  for (const term of SEARCHES) {
    const res = (await gh(`search/repositories?q=${encodeURIComponent(term)}&sort=updated&per_page=15`)) as { items?: { full_name: string; pushed_at: string; size: number }[] } | null;
    for (const item of res?.items ?? []) if (item.size < 300_000) repos.set(item.full_name, item.pushed_at);
    await new Promise((r) => setTimeout(r, 2500));
  }
  const codeFiles: { repo: string; path: string }[] = [];
  if (GITHUB_TOKEN)
    for (const term of CODE_SEARCHES) {
      const res = (await gh(`search/code?q=${encodeURIComponent(term)}&per_page=50`)) as { items?: { path: string; repository: { full_name: string } }[] } | null;
      for (const item of res?.items ?? []) codeFiles.push({ repo: item.repository.full_name, path: item.path });
      await new Promise((r) => setTimeout(r, 7000));
    }
  stats.github_repos = repos.size;
  const seen = await getState<Record<string, string>>("github_repos", {});
  let bytes = 0;
  const readFile = async (repo: string, path: string) => {
    const res = await fetchText(`https://raw.githubusercontent.com/${repo}/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`);
    if (res.status !== 200 || !res.buf) return;
    let text = res.text;
    if (path.endsWith(".gz")) {
      try {
        text = gunzipSync(res.buf).toString("utf8");
      } catch {
        return;
      }
    }
    bytes += text.length;
    const parsed = parseList(text, path);
    parsed.refs.forEach((ref) => offer(ref, "lists"));
    parsed.names.forEach((name) => names.add(name));
    bump("github_files");
  };
  for (const [repo, pushed] of repos) {
    if (minutesLeft() < MAX_MINUTES * 0.75 || bytes > 400_000_000) break;
    if (seen[repo] === pushed && !process.argv.includes("--relists")) continue;
    const tree = (await gh(`repos/${repo}/git/trees/HEAD?recursive=1`)) as { tree?: { path: string; type: string; size?: number }[] } | null;
    const files = (tree?.tree ?? [])
      .filter((f) => f.type === "blob" && /\.(csv|tsv|json|jsonl|ndjson|md|txt|ya?ml)(\.gz)?$/i.test(f.path) && (f.size ?? 0) > 100 && (f.size ?? 0) < 40_000_000)
      .filter((f) => !/(^|\/)(node_modules|package(-lock)?\.json|tsconfig|\.github)/.test(f.path))
      .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
      .slice(0, 40);
    for (const file of files) await readFile(repo, file.path);
    seen[repo] = pushed;
  }
  for (const file of codeFiles.slice(0, 150)) await readFile(file.repo, file.path);
  await setState("github_repos", seen);
}

// ---------- source: Common Crawl ----------
const CC_QUERIES: [string, string][] = [
  ["boards.greenhouse.io/*", "prefix"], ["job-boards.greenhouse.io/*", "prefix"], ["boards.eu.greenhouse.io/*", "prefix"],
  ["jobs.lever.co/*", "prefix"], ["jobs.eu.lever.co/*", "prefix"], ["jobs.ashbyhq.com/*", "prefix"],
  ["jobs.smartrecruiters.com/*", "prefix"], ["apply.workable.com/*", "prefix"], ["ats.rippling.com/*", "prefix"],
  ["myworkdayjobs.com", "domain"], ["icims.com", "domain"], ["recruitee.com", "domain"], ["bamboohr.com", "domain"],
  ["breezy.hr", "domain"], ["applytojob.com", "domain"],
];

async function fromCommonCrawl(): Promise<void> {
  const info = await fetchText("https://index.commoncrawl.org/collinfo.json");
  let crawls: string[] = [];
  try {
    crawls = (JSON.parse(info.text) as { id: string }[]).map((c) => c.id);
  } catch {
    return;
  }
  if (!crawls.length) return;
  const cursor = await getState<number>("cc_cursor", 1);
  const picks = [crawls[0], crawls[1 + (cursor % (crawls.length - 1))], crawls[1 + ((cursor + 1) % (crawls.length - 1))]];
  stats.cc_crawls = picks.join(",");
  const jobs: [string, string, string][] = picks.flatMap((crawl) => CC_QUERIES.map(([url, match]) => [crawl, url, match] as [string, string, string]));
  const worker = async () => {
    while (jobs.length && minutesLeft() > MAX_MINUTES * 0.45) {
      const [crawl, url, match] = jobs.shift()!;
      for (let page = 0; page < 30 && minutesLeft() > MAX_MINUTES * 0.45; page++) {
        const qs = new URLSearchParams({ url, matchType: match, output: "json", fl: "url", page: String(page), filter: "status:200" });
        const res = await fetchText(`https://index.commoncrawl.org/${crawl}-index?${qs}`, {}, 120_000);
        if (res.status !== 200) break;
        for (const line of res.text.split("\n")) {
          const m = line.match(/"url":\s*"([^"]+)"/);
          if (m) for (const ref of extractBoards(m[1])) offer(ref, "crawl");
        }
        bump("cc_pages");
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  await setState("cc_cursor", cursor + 2);
}

// ---------- source: Workable public job search (companies hiring in the US right now) ----------
const SEARCH_TERMS = ["engineer", "software", "sales", "marketing", "nurse", "manager", "analyst", "designer", "customer", "operations", "accountant", "developer", "data", "product", "technician", "assistant", "driver", "teacher", "finance", "hr", "intern", "remote"];
async function fromWorkableSearch(fresh: Set<string>): Promise<void> {
  for (const term of SEARCH_TERMS) {
    let token = "";
    for (let page = 0; page < 25 && minutesLeft() > MAX_MINUTES * 0.4; page++) {
      const qs = new URLSearchParams({ query: term, location: "United States", ...(token ? { pageToken: token } : {}) });
      const res = await fetchText(`https://jobs.workable.com/api/v1/jobs?${qs}`, {}, 30_000);
      if (res.status !== 200) break;
      let data: { nextPageToken?: string; jobs?: { company?: { title?: string }; description?: string }[] };
      try {
        data = JSON.parse(res.text);
      } catch {
        break;
      }
      for (const job of data.jobs ?? []) {
        if (job.company?.title) fresh.add(job.company.title);
        for (const ref of extractBoards(job.description ?? "")) offer(ref, "search");
      }
      bump("search_pages");
      if (!data.nextPageToken) break;
      token = data.nextPageToken;
    }
  }
  stats.search_companies = fresh.size;
}

// ---------- probing ----------
type Found = BoardRef & { via: string; jobs: number };
const found: Found[] = [];
const rejects: (BoardRef & { via: string })[] = [];
let probes = 0;

async function runProbes(items: (BoardRef & { via: string })[], record: boolean, stopAtMinutes = 3): Promise<void> {
  // interleave sources so no single ATS API gets all the concurrent requests
  const groups = new Map<string, (BoardRef & { via: string })[]>();
  for (const item of items) {
    if (!groups.has(item.source)) groups.set(item.source, []);
    groups.get(item.source)!.push(item);
  }
  const queue: (BoardRef & { via: string })[] = [];
  for (let i = 0; queue.length < items.length; i++) for (const group of groups.values()) if (group[i]) queue.push(group[i]);
  let index = 0;
  const worker = async () => {
    while (index < queue.length && minutesLeft() > stopAtMinutes) {
      const item = queue[index++];
      let result = await probeBoard(item.source, item.slug);
      if (result.retry) {
        await new Promise((r) => setTimeout(r, 1500));
        result = await probeBoard(item.source, item.slug);
      }
      probes++;
      const k = key(item.source, item.slug);
      if (result.ok && !known.has(k)) {
        known.add(k);
        found.push({ ...item, name: result.name || item.name, jobs: result.jobs });
        if (found.length % 250 === 0) await flush();
      } else if (!result.ok && !result.retry && record) rejects.push(item);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

let flushed = 0;
let blocked = false;
async function flush(): Promise<void> {
  const batch = found.slice(flushed);
  flushed = found.length;
  if (!batch.length || DRY || blocked) return;
  const rows = batch.map((b) => {
    const urls = boardEndpoints(b.source, b.slug);
    const pretty = b.name || (b.source === "workday" ? b.slug.split(".")[0] : b.slug).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return { name: pretty.slice(0, 200), slug: b.slug, source: b.source, careers_url: urls.careersUrl, api_url: urls.apiUrl, via: b.via, jobs: b.jobs };
  });
  const inserted = await q(
    `INSERT INTO companies (name, slug, source, careers_url, api_url, enabled, discovered_via, discovered_at)
     SELECT name, slug, source::job_source, careers_url, api_url, true, via, now() FROM json_to_recordset($1::json)
       AS x(name text, slug text, source text, careers_url text, api_url text, via text)
     ON CONFLICT (source, slug) DO NOTHING RETURNING 1`,
    [JSON.stringify(rows)],
  );
  bump("boards_added", inserted.length);
  await q(
    `INSERT INTO board_discovery (source, slug, via, status, jobs, checked_at)
     SELECT source::job_source, slug, via, 'added', jobs, now() FROM json_to_recordset($1::json) AS x(source text, slug text, via text, jobs int)
     ON CONFLICT (source, slug) DO UPDATE SET status = 'added', jobs = EXCLUDED.jobs, checked_at = now()`,
    [JSON.stringify(rows)],
  );
}

async function saveRejects(): Promise<void> {
  if (DRY) return;
  for (let i = 0; i < rejects.length; i += 5000) {
    const rows = rejects.slice(i, i + 5000).map((r) => ({ source: r.source, slug: r.slug, via: r.via }));
    await q(
      `INSERT INTO board_discovery (source, slug, via, status, checked_at)
       SELECT source::job_source, slug, via, 'rejected', now() FROM json_to_recordset($1::json) AS x(source text, slug text, via text)
       ON CONFLICT (source, slug) DO UPDATE SET status = 'rejected', checked_at = now()`,
      [JSON.stringify(rows)],
    );
  }
  await q("DELETE FROM board_discovery WHERE status = 'rejected' AND checked_at < now() - interval '30 days'");
}

const NAME_TARGETS: BoardSource[] = ["greenhouse", "lever", "ashby", "workable", "recruitee", "breezy", "bamboohr", "jazzhr"];
function nameCandidates(names: Iterable<string>, via: string): (BoardRef & { via: string })[] {
  const out: (BoardRef & { via: string })[] = [];
  const local = new Set<string>();
  for (const name of names)
    for (const raw of nameSlugs(name))
      for (const source of NAME_TARGETS) {
        if (raw.includes("-") && ["bamboohr", "jazzhr", "ashby"].includes(source)) continue;
        const slug = normaliseSlug(source, raw);
        if (!slug) continue;
        const k = key(source, slug);
        if (known.has(k) || rejected.has(k) || candidates.has(k) || local.has(k)) continue;
        local.add(k);
        out.push({ source, slug, name, via });
      }
  return out;
}

async function totals(): Promise<Record<string, string>> {
  const rows = await q<Record<string, string>>(
    `SELECT (SELECT count(*) FROM companies) boards,
            (SELECT count(*) FROM companies WHERE last_synced_at IS NOT NULL) checked,
            (SELECT count(*) FROM companies WHERE us_jobs > 0) hiring_us,
            (SELECT count(*) FROM jobs WHERE stale_at IS NULL AND duplicate_of IS NULL) active_us_jobs,
            pg_size_pretty(pg_database_size(current_database())) db_size,
            (pg_database_size(current_database()) / 1048576)::int db_mb`,
  );
  return rows[0] ?? {};
}

async function main() {
  const runId = (await q<{ id: number }>("INSERT INTO discovery_runs DEFAULT VALUES RETURNING id"))[0]?.id;
  const before = await totals();
  if (Number(before.db_mb ?? 0) > HARD_CAP_MB) {
    blocked = true;
    log(`database is ${before.db_size}, above the ${HARD_CAP_MB} MB hard cap: checking only, not adding boards`);
  }
  const names = await loadKnown();
  log("known boards", known.size, "recent rejects", rejected.size);
  const listNames = new Set<string>();
  const fresh = new Set<string>();

  const steps: [string, () => Promise<void>][] = [
    ["postings", fromPostings],
    ["lists", () => fromGithub(listNames)],
    ["crawl", fromCommonCrawl],
    ["search", () => fromWorkableSearch(fresh)],
  ];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      log(name, "failed", String(error).slice(0, 300));
    }
    log(`after ${name}: ${candidates.size} candidates`);
  }

  // 1. direct candidates (links, lists, crawl)
  const direct = [...candidates.values()];
  stats.direct_candidates = direct.length;
  await runProbes(direct, true, MAX_MINUTES * 0.35);
  log(`direct: probed ${probes}, found ${found.length}`);
  await flush();

  // 2. names of companies hiring now (Workable search) + names from public lists, then the rotating window of known names
  const priority = nameCandidates(fresh, "names");
  const all = [...new Set([...names, ...listNames])].sort();
  const offset = await getState<number>("name_offset", 0);
  const perName = 2.4 * NAME_TARGETS.length;
  const windowSize = Math.max(500, Math.round(Math.max(0, NAME_PROBES - priority.length) / perName));
  const start = offset % Math.max(1, all.length);
  const slice = all.slice(start, start + windowSize);
  const rotating = nameCandidates(slice, "names");
  stats.name_candidates = priority.length + rotating.length;
  const before2 = probes;
  await runProbes([...priority, ...rotating].slice(0, NAME_PROBES), false, 2);
  stats.name_probes = probes - before2;
  stats.name_pool = all.length;
  stats.name_window = `${start}-${start + slice.length}`;
  await setState("name_offset", (start + slice.length) % Math.max(1, all.length));
  await flush();
  await saveRejects();
  await q("UPDATE board_discovery SET status = 'rejected', checked_at = now() WHERE status = 'candidate' AND first_seen_at < now() - interval '3 days'");

  stats.probes = probes;
  stats.boards_found = found.length;
  stats.found_with_jobs = found.filter((f) => f.jobs !== 0).length;
  const bySource: Record<string, number> = {};
  const byVia: Record<string, number> = {};
  for (const f of found) (bySource[f.source] = (bySource[f.source] ?? 0) + 1), (byVia[f.via] = (byVia[f.via] ?? 0) + 1);
  const after = await totals();
  const report = { stats, found_by_source: bySource, found_by_via: byVia, before, after, minutes: ((Date.now() - started) / 60_000).toFixed(1), sample: found.slice(0, 15).map((f) => `${f.source}:${f.slug} (${f.jobs} jobs, via ${f.via})`) };
  console.log(JSON.stringify(report, null, 2));
  if (runId) await q("UPDATE discovery_runs SET finished_at = now(), stats = $2::jsonb WHERE id = $1", [runId, JSON.stringify(report)]);
  if (process.env.GITHUB_STEP_SUMMARY && existsSync(process.env.GITHUB_STEP_SUMMARY))
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Board discovery\n\nNew boards found: **${found.length}** (${stats.found_with_jobs} with open jobs) from ${probes} checks.\n\n` +
        `| | before | after |\n|---|---|---|\n` +
        ["boards", "checked", "hiring_us", "active_us_jobs", "db_size"].map((k) => `| ${k} | ${before[k] ?? ""} | ${after[k] ?? ""} |`).join("\n") +
        `\n\nBy source: ${JSON.stringify(bySource)}\n\nBy discovery path: ${JSON.stringify(byVia)}\n`,
    );
  await pool?.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool?.end();
  process.exit(1);
});
