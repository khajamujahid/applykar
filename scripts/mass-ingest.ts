/**
 * High-volume ingestion for GitHub Actions.
 * Seeds companies from data/boards.tsv.gz (+ optional data/boards-extra.tsv.gz), then refreshes the
 * least-recently-synced boards in parallel until the time budget runs out.
 * Stores US jobs only, compactly (short description, no raw payload), marks closed jobs stale,
 * prunes old stale rows, and keeps the database under the storage budget.
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import pg from "pg";
import type { BoardSource, NormalizedJob } from "../lib/domain";
import { BOARD_SOURCES } from "../lib/domain";
import { boardEndpoints } from "../lib/companies";
import { getBoardAdapter } from "../lib/sources/registry";
import { NotFoundError } from "../lib/sources/http";
import { enrichJob } from "../lib/enrich/rules";
import { dedupeKey } from "../lib/dedupe";
import { sha256 } from "../lib/secret";

config({ path: ".env.local" });
config({ path: ".env" });
process.env.SR_DETAILS ??= "0";

const MAX_MINUTES = Number(process.env.INGEST_MAX_MINUTES || 40);
const CONCURRENCY = Number(process.env.INGEST_CONCURRENCY || 24);
const DESC_CHARS = Number(process.env.INGEST_DESC_CHARS || 500);
const STORAGE_BUDGET_MB = Number(process.env.INGEST_STORAGE_BUDGET_MB || 760);
const STALE_PRUNE_DAYS = Number(process.env.INGEST_STALE_PRUNE_DAYS || 3);
const started = Date.now();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });

type Company = { id: string; name: string; slug: string; source: BoardSource; first_sync?: boolean };

function readBoards(): { source: string; slug: string; name: string }[] {
  const rows: { source: string; slug: string; name: string }[] = [];
  for (const file of ["data/boards.tsv.gz", "data/boards-extra.tsv.gz"]) {
    if (!existsSync(file)) continue;
    for (const line of gunzipSync(readFileSync(file)).toString("utf8").split("\n")) {
      const [source, slug, name] = line.split("\t");
      if (source && slug && (BOARD_SOURCES as readonly string[]).includes(source)) rows.push({ source, slug, name: name || slug });
    }
  }
  return rows;
}

async function seed(): Promise<number> {
  const boards = readBoards();
  const { rows } = await pool.query<{ n: string }>("SELECT count(*) n FROM companies");
  if (Number(rows[0].n) >= boards.length && !process.argv.includes("--seed")) return 0;
  let inserted = 0;
  for (let i = 0; i < boards.length; i += 2000) {
    const group = boards.slice(i, i + 2000).map((b) => {
      const urls = boardEndpoints(b.source as BoardSource, b.slug);
      return { name: b.name, slug: b.slug, source: b.source, careers_url: urls.careersUrl, api_url: urls.apiUrl };
    });
    const result = await pool.query(
      `INSERT INTO companies (name, slug, source, careers_url, api_url, enabled)
       SELECT name, slug, source::job_source, careers_url, api_url, true FROM json_to_recordset($1::json)
         AS x(name text, slug text, source text, careers_url text, api_url text)
       ON CONFLICT (source, slug) DO NOTHING`,
      [JSON.stringify(group)],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}

function keepUs(job: NormalizedJob, scope: string, workplace: string): boolean {
  if (scope === "us") return true;
  if (scope === "non_us") return false;
  return workplace === "remote" || !job.locationRaw;
}

async function upsert(company: Company, normalized: NormalizedJob[]): Promise<{ added: number; us: number }> {
  const rows = [];
  const seen = new Set<string>();
  for (const job of normalized) {
    const description = job.descriptionText.slice(0, 20_000);
    const enriched = enrichJob({
      title: job.title,
      descriptionText: description,
      locationRaw: job.locationRaw,
      city: job.city,
      region: job.region,
      country: job.country,
      workplaceHint: job.workplaceHint,
      salary: job.salary,
    });
    if (!keepUs(job, enriched.usScope, enriched.workplace)) continue;
    const externalId = `${company.slug}:${job.externalId}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    rows.push({
      company_id: company.id,
      source: job.source,
      external_id: externalId,
      title: job.title.slice(0, 300),
      company_name: (job.companyName || company.name).slice(0, 200),
      description_text: description.slice(0, DESC_CHARS),
      location_raw: job.locationRaw?.slice(0, 300) ?? null,
      city: job.city,
      region: job.region,
      country: job.country,
      workplace: enriched.workplace,
      seniority: enriched.seniority,
      us_scope: enriched.usScope,
      yoe_min: enriched.yoeMin,
      salary_min: enriched.salary.min == null ? null : Math.round(enriched.salary.min),
      salary_max: enriched.salary.max == null ? null : Math.round(enriched.salary.max),
      salary_currency: enriched.salary.currency,
      salary_interval: enriched.salary.interval,
      w2_only: enriched.w2Only,
      c2c_friendly: enriched.c2cFriendly,
      no_sponsorship: enriched.noSponsorship,
      skill_tags: enriched.skillTags.slice(0, 12),
      apply_url: job.applyUrl,
      source_url: job.sourceUrl === job.applyUrl ? null : job.sourceUrl,
      // Boards without dates: on later polls first-seen time is the posting time; on the very first sync it is unknown.
      posted_at: job.postedAt?.toISOString() ?? (company.first_sync ? null : new Date().toISOString()),
      content_hash: sha256(`${job.title}|${job.locationRaw ?? ""}|${job.applyUrl}|${description.slice(0, DESC_CHARS)}|${enriched.salary.min ?? ""}`).slice(0, 16),
      dedupe_key: dedupeKey({ companyName: job.companyName || company.name, title: job.title, locationRaw: job.locationRaw, workplace: enriched.workplace }),
    });
  }
  let added = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const result = await pool.query<{ inserted: boolean }>(
      `INSERT INTO jobs (company_id, source, external_id, title, company_name, description_text, location_raw, city, region, country,
          workplace, seniority, us_scope, yoe_min, salary_min, salary_max, salary_currency, salary_interval, w2_only, c2c_friendly,
          no_sponsorship, skill_tags, apply_url, source_url, posted_at, content_hash, dedupe_key, last_seen_at, stale_at)
       SELECT company_id, source, external_id, title, company_name, description_text, location_raw, city, region, country,
          workplace, seniority, us_scope, yoe_min, salary_min, salary_max, salary_currency, salary_interval, w2_only, c2c_friendly,
          no_sponsorship, skill_tags, apply_url, source_url, posted_at, content_hash, dedupe_key, now(), NULL
       FROM json_populate_recordset(NULL::jobs, $1::json)
       ON CONFLICT (source, external_id) DO UPDATE SET
          title = excluded.title, company_name = excluded.company_name,
          description_text = CASE WHEN excluded.description_text <> '' THEN excluded.description_text ELSE jobs.description_text END,
          location_raw = excluded.location_raw, workplace = excluded.workplace, seniority = excluded.seniority, us_scope = excluded.us_scope,
          salary_min = excluded.salary_min, salary_max = excluded.salary_max, skill_tags = excluded.skill_tags,
          apply_url = excluded.apply_url, posted_at = COALESCE(jobs.posted_at, excluded.posted_at),
          content_hash = excluded.content_hash, dedupe_key = excluded.dedupe_key, last_seen_at = now(), stale_at = NULL
       WHERE jobs.content_hash IS DISTINCT FROM excluded.content_hash OR jobs.stale_at IS NOT NULL
       RETURNING (xmax = 0) AS inserted`,
      [JSON.stringify(rows.slice(i, i + 500))],
    );
    added += result.rows.filter((row) => row.inserted).length;
  }
  await pool.query(
    `UPDATE jobs SET stale_at = now() WHERE company_id = $1 AND stale_at IS NULL AND NOT (external_id = ANY($2::text[]))`,
    [company.id, [...seen]],
  );
  await pool.query(
    `UPDATE companies SET last_synced_at = now(), last_error = NULL, fail_count = 0, open_jobs = $2, us_jobs = $3 WHERE id = $1`,
    [company.id, normalized.length, rows.length],
  );
  return { added, us: rows.length };
}

const HOT_MINUTES = Number(process.env.INGEST_HOT_MINUTES || 50);

/**
 * Freshness first: boards that are hiring in the US (us_jobs > 0) are re-polled every run once they are
 * older than HOT_MINUTES, newest-stale first. Only then does the run spend time on the long tail.
 */
async function claim(limit: number, coldAllowed = true): Promise<Company[]> {
  const hot = await pool.query<Company>(
    `UPDATE companies SET last_synced_at = now()
     WHERE id IN (
       SELECT id FROM companies
       WHERE enabled AND us_jobs > 0 AND source = ANY($2::job_source[])
         AND last_synced_at < now() - ($3 || ' minutes')::interval
       ORDER BY last_synced_at
       LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING id, name, slug, source, (open_jobs IS NULL) AS first_sync`,
    [limit, BOARD_SOURCES, String(HOT_MINUTES)],
  );
  if (hot.rows.length || !coldAllowed) return hot.rows;
  const { rows } = await pool.query<Company>(
    `UPDATE companies SET last_synced_at = now()
     WHERE id IN (
       SELECT id FROM companies
       WHERE enabled AND source = ANY($2::job_source[])
       ORDER BY last_synced_at NULLS FIRST
       LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING id, name, slug, source, (open_jobs IS NULL) AS first_sync`,
    [limit, BOARD_SOURCES],
  );
  return rows;
}

async function processCompany(company: Company, stats: Record<string, number>) {
  try {
    const normalized = await getBoardAdapter(company.source).fetchJobs({ slug: company.slug, name: company.name });
    const result = await upsert(company, normalized);
    stats.ok += 1;
    stats.added += result.added;
    stats.us += result.us;
  } catch (error) {
    const notFound = error instanceof NotFoundError || /Request failed with (401|403|410)/.test(String(error));
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 200);
    await pool.query(
      `UPDATE companies SET last_error = $2, fail_count = fail_count + 1, enabled = CASE WHEN $3 OR fail_count >= 4 THEN false ELSE enabled END WHERE id = $1`,
      [company.id, message, notFound],
    );
    stats.failed += 1;
  }
}

async function maintain(force = false) {
  await pool.query(`DELETE FROM jobs j WHERE stale_at < now() - ($1 || ' days')::interval
    AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id)
    AND NOT EXISTS (SELECT 1 FROM job_states s WHERE s.job_id = j.id)
    AND NOT EXISTS (SELECT 1 FROM bulk_items b WHERE b.job_id = j.id)`, [String(STALE_PRUNE_DAYS)]);
  await pool.query(`WITH ranked AS (
      SELECT id, first_value(id) OVER (PARTITION BY dedupe_key ORDER BY length(description_text) DESC, first_seen_at) AS keep
      FROM jobs WHERE stale_at IS NULL)
    UPDATE jobs j SET duplicate_of = NULLIF(r.keep, j.id)
    FROM ranked r WHERE r.id = j.id AND j.duplicate_of IS DISTINCT FROM NULLIF(r.keep, j.id)`);
  const { rows } = await pool.query<{ mb: string }>("SELECT pg_database_size(current_database()) / 1048576 AS mb");
  const mb = Number(rows[0].mb);
  if (force || mb > STORAGE_BUDGET_MB) {
    console.log(`storage ${mb}MB over budget, compacting`);
    // Deletes only: an UPDATE would write new row versions and grow the database before vacuum.
    await pool.query(`DELETE FROM jobs j WHERE (stale_at IS NOT NULL OR posted_at < now() - interval '60 days')
      AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.job_id = j.id)
      AND NOT EXISTS (SELECT 1 FROM job_states s WHERE s.job_id = j.id)
      AND NOT EXISTS (SELECT 1 FROM bulk_items b WHERE b.job_id = j.id)`);
    await pool.query("VACUUM jobs").catch(() => undefined);
  }
  return mb;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set; skipping.");
    return;
  }
  const seeded = await seed();
  console.log(`seeded ${seeded} new boards`);
  const stats = { ok: 0, failed: 0, added: 0, us: 0 };
  const budgetMs = MAX_MINUTES * 60_000;
  let checks = 0;
  let coldAllowed = true;
  let compacted = false;
  while (Date.now() - started < budgetMs) {
    if (++checks % 5 === 1) {
      const size = await pool.query<{ mb: string }>("SELECT pg_database_size(current_database()) / 1048576 AS mb");
      if (Number(size.rows[0].mb) > STORAGE_BUDGET_MB) {
        if (!compacted) {
          console.log(`storage ${size.rows[0].mb}MB over budget; compacting`);
          await maintain(true);
          compacted = true;
        } else if (coldAllowed) {
          console.log("still over budget; refreshing hiring boards only (no new boards this run)");
          coldAllowed = false;
        }
      }
    }
    const batch = await claim(CONCURRENCY * 4, coldAllowed);
    if (batch.length === 0) break;
    let index = 0;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (index < batch.length && Date.now() - started < budgetMs + 120_000) {
          const company = batch[index++];
          await processCompany(company, stats);
        }
      }),
    );
    console.log(`progress ok=${stats.ok} failed=${stats.failed} usJobs=${stats.us} new=${stats.added} t=${Math.round((Date.now() - started) / 1000)}s`);
  }
  const mb = await maintain();
  await pool.query("VACUUM (ANALYZE) jobs").catch(() => undefined);
  await pool.query("VACUUM (ANALYZE) companies").catch(() => undefined);
  const { rows } = await pool.query(
    `SELECT (SELECT count(*) FROM companies) AS boards, (SELECT count(*) FROM companies WHERE enabled) AS live_boards,
            (SELECT count(*) FROM companies WHERE us_jobs > 0) AS hiring_us,
            (SELECT count(DISTINCT company_id) FROM jobs WHERE stale_at IS NULL) AS companies_with_jobs,
            (SELECT count(*) FROM jobs WHERE stale_at IS NULL AND duplicate_of IS NULL) AS active_jobs`,
  );
  console.log(JSON.stringify({ ...stats, dbMb: mb, ...rows[0] }));
  await pool.end();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
