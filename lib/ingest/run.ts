import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { boardEndpoints, loadCompanySeed } from "@/lib/companies";
import type { BoardSource, JobSource, NormalizedJob } from "@/lib/domain";
import { BOARD_SOURCES } from "@/lib/domain";
import { getDb } from "@/lib/db/client";
import { companies, ingestRuns, jobs } from "@/lib/db/schema";
import { dedupeKey, markDuplicates } from "@/lib/dedupe";
import { enrichJob } from "@/lib/enrich/rules";
import { maybeLlmEnrich } from "@/lib/enrich/llm";
import { getAiProvider } from "@/lib/ai/provider";
import { sha256 } from "@/lib/secret";
import { enabledOptionalAdapters } from "@/lib/sources/registry";
import { getBoardAdapter } from "@/lib/sources/registry";
import { NotFoundError } from "@/lib/sources/http";
import { employerSlug } from "@/lib/sources/optional";

export type IngestOptions = {
  sources?: BoardSource[];
  slugs?: string[];
  limitCompanies?: number;
  includeOptional?: boolean;
};

export type IngestStats = {
  companies: number;
  added: number;
  updated: number;
  staled: number;
  errors: { source: string; slug: string; message: string }[];
};

type CompanyRow = typeof companies.$inferSelect;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export async function ensureCompanies(): Promise<number> {
  const seed = loadCompanySeed();
  const db = getDb();
  for (const group of chunks(seed, 40)) {
    await db
      .insert(companies)
      .values(
        group.map((company) => {
          const urls = boardEndpoints(company.source, company.slug);
          return {
            name: company.name,
            slug: company.slug,
            source: company.source,
            careersUrl: urls.careersUrl,
            apiUrl: urls.apiUrl,
            enabled: true,
          };
        }),
      )
      .onConflictDoUpdate({
        target: [companies.source, companies.slug],
        set: {
          name: sql`excluded.name`,
          careersUrl: sql`excluded.careers_url`,
          apiUrl: sql`excluded.api_url`,
        },
      });
  }
  return seed.length;
}

async function upsertNormalized(company: CompanyRow, slugPrefix: string, normalized: NormalizedJob[]): Promise<{ added: number; updated: number; staled: number }> {
  const db = getDb();
  const provider = getAiProvider();
  const prepared = [];
  for (const job of normalized) {
    const rules = enrichJob({
      title: job.title,
      descriptionText: job.descriptionText,
      locationRaw: job.locationRaw,
      city: job.city,
      region: job.region,
      country: job.country,
      workplaceHint: job.workplaceHint,
      salary: job.salary,
    });
    const enriched = await maybeLlmEnrich(rules, job, provider);
    const externalId = `${slugPrefix}:${job.externalId}`;
    prepared.push({
      companyId: company.id,
      source: job.source,
      externalId,
      title: job.title,
      companyName: job.companyName || company.name,
      descriptionText: job.descriptionText,
      locationRaw: job.locationRaw,
      city: job.city,
      region: job.region,
      country: job.country,
      workplace: enriched.workplace,
      seniority: enriched.seniority,
      usScope: enriched.usScope,
      yoeMin: enriched.yoeMin,
      salaryMin: enriched.salary.min == null ? null : Math.round(enriched.salary.min),
      salaryMax: enriched.salary.max == null ? null : Math.round(enriched.salary.max),
      salaryCurrency: enriched.salary.currency,
      salaryInterval: enriched.salary.interval,
      w2Only: enriched.w2Only,
      c2cFriendly: enriched.c2cFriendly,
      noSponsorship: enriched.noSponsorship,
      skillTags: enriched.skillTags,
      applyUrl: job.applyUrl,
      sourceUrl: job.sourceUrl,
      postedAt: job.postedAt,
      contentHash: sha256(`${job.title}|${job.descriptionText}|${job.locationRaw ?? ""}|${job.applyUrl}`),
      dedupeKey: dedupeKey({
        companyName: job.companyName || company.name,
        title: job.title,
        locationRaw: job.locationRaw,
        workplace: enriched.workplace,
      }),
      raw: job.raw,
      lastSeenAt: new Date(),
      staleAt: null,
    });
  }

  const existing = prepared.length
    ? await db
        .select({ externalId: jobs.externalId })
        .from(jobs)
        .where(
          and(
            eq(jobs.source, company.source),
            inArray(
              jobs.externalId,
              prepared.map((job) => job.externalId),
            ),
          ),
        )
    : [];
  const existingIds = new Set(existing.map((job) => job.externalId));
  let added = 0;
  let updated = 0;
  for (const group of chunks(prepared, 20)) {
    if (group.length === 0) continue;
    await db
      .insert(jobs)
      .values(group)
      .onConflictDoUpdate({
        target: [jobs.source, jobs.externalId],
        set: {
          title: sql`excluded.title`,
          companyName: sql`excluded.company_name`,
          descriptionText: sql`CASE WHEN excluded.description_text <> '' THEN excluded.description_text ELSE jobs.description_text END`,
          locationRaw: sql`excluded.location_raw`,
          city: sql`excluded.city`,
          region: sql`excluded.region`,
          country: sql`excluded.country`,
          workplace: sql`excluded.workplace`,
          seniority: sql`excluded.seniority`,
          usScope: sql`excluded.us_scope`,
          yoeMin: sql`excluded.yoe_min`,
          salaryMin: sql`excluded.salary_min`,
          salaryMax: sql`excluded.salary_max`,
          salaryCurrency: sql`excluded.salary_currency`,
          salaryInterval: sql`excluded.salary_interval`,
          w2Only: sql`excluded.w2_only`,
          c2cFriendly: sql`excluded.c2c_friendly`,
          noSponsorship: sql`excluded.no_sponsorship`,
          skillTags: sql`excluded.skill_tags`,
          applyUrl: sql`excluded.apply_url`,
          sourceUrl: sql`excluded.source_url`,
          postedAt: sql`excluded.posted_at`,
          contentHash: sql`excluded.content_hash`,
          dedupeKey: sql`excluded.dedupe_key`,
          raw: sql`excluded.raw`,
          lastSeenAt: new Date(),
          staleAt: null,
        },
      });
  }
  for (const job of prepared) {
    if (existingIds.has(job.externalId)) updated += 1;
    else added += 1;
  }

  const seen = prepared.map((job) => job.externalId);
  const staleRows =
    seen.length === 0
      ? await db
          .update(jobs)
          .set({ staleAt: new Date() })
          .where(and(eq(jobs.companyId, company.id), isNull(jobs.staleAt)))
          .returning({ id: jobs.id })
      : await db
          .update(jobs)
          .set({ staleAt: new Date() })
          .where(and(eq(jobs.companyId, company.id), isNull(jobs.staleAt), notInArray(jobs.externalId, seen)))
          .returning({ id: jobs.id });

  const keys = [...new Set(prepared.map((job) => job.dedupeKey))];
  if (keys.length) {
    const related = await db
      .select({
        id: jobs.id,
        dedupeKey: jobs.dedupeKey,
        richness: sql<number>`length(${jobs.descriptionText})`,
        firstSeenAt: jobs.firstSeenAt,
        staleAt: jobs.staleAt,
      })
      .from(jobs)
      .where(inArray(jobs.dedupeKey, keys));
    const active = related.filter((job) => job.staleAt == null);
    const mapping = markDuplicates(
      active.map((job) => ({
        id: job.id,
        dedupeKey: job.dedupeKey,
        richness: job.richness,
        firstSeenAt: job.firstSeenAt.getTime(),
      })),
    );
    for (const [id, duplicateOf] of mapping) {
      await db.update(jobs).set({ duplicateOf }).where(eq(jobs.id, id));
    }
  }

  return { added, updated, staled: staleRows.length };
}

async function recordRun(company: CompanyRow | null, source: string, result: { added: number; updated: number; staled: number; error?: string }) {
  await getDb().insert(ingestRuns).values({
    companyId: company?.id,
    source,
    status: result.error ? "error" : "ok",
    added: result.added,
    updated: result.updated,
    staled: result.staled,
    error: result.error,
    finishedAt: new Date(),
  });
}

export async function ingestBatch(options: IngestOptions = {}): Promise<IngestStats> {
  await ensureCompanies();
  const db = getDb();
  const sources = options.sources?.length ? options.sources : [...BOARD_SOURCES];
  const filters = [eq(companies.enabled, true), inArray(companies.source, sources)];
  if (options.slugs?.length) filters.push(inArray(companies.slug, options.slugs));
  const selected = await db
    .select()
    .from(companies)
    .where(and(...filters))
    .orderBy(sql`${companies.lastSyncedAt} ASC NULLS FIRST`, asc(companies.name))
    .limit(options.limitCompanies ?? 8);

  const stats: IngestStats = { companies: 0, added: 0, updated: 0, staled: 0, errors: [] };
  for (const company of selected) {
    if (!BOARD_SOURCES.includes(company.source as BoardSource)) continue;
    const adapter = getBoardAdapter(company.source as BoardSource);
    try {
      const normalized = await adapter.fetchJobs({ slug: company.slug, name: company.name });
      const result = await upsertNormalized(company, company.slug, normalized);
      stats.companies += 1;
      stats.added += result.added;
      stats.updated += result.updated;
      stats.staled += result.staled;
      await db.update(companies).set({ lastSyncedAt: new Date(), lastError: null }).where(eq(companies.id, company.id));
      await recordRun(company, company.source, result);
    } catch (error) {
      const message = error instanceof NotFoundError ? "Board was not found" : error instanceof Error ? error.message : "Ingest failed";
      stats.errors.push({ source: company.source, slug: company.slug, message });
      await db.update(companies).set({ lastSyncedAt: new Date(), lastError: message }).where(eq(companies.id, company.id));
      await recordRun(company, company.source, { added: 0, updated: 0, staled: 0, error: message });
    }
  }

  if (options.includeOptional) {
    for (const adapter of enabledOptionalAdapters()) {
      try {
        const normalized = await adapter.fetchJobs();
        const groups = new Map<string, NormalizedJob[]>();
        for (const job of normalized) {
          const key = job.companyName;
          groups.set(key, [...(groups.get(key) ?? []), job]);
        }
        for (const [name, group] of groups) {
          const slug = employerSlug(name);
          const rows = await db
            .insert(companies)
            .values({ name, slug, source: adapter.source, careersUrl: group[0]?.applyUrl ?? null, enabled: true })
            .onConflictDoUpdate({
              target: [companies.source, companies.slug],
              set: { name: sql`excluded.name`, lastSyncedAt: new Date() },
            })
            .returning();
          const company = rows[0];
          if (!company) continue;
          const result = await upsertNormalized(company, slug, group);
          stats.companies += 1;
          stats.added += result.added;
          stats.updated += result.updated;
          stats.staled += result.staled;
        }
      } catch (error) {
        stats.errors.push({
          source: adapter.source,
          slug: "*",
          message: error instanceof Error ? error.message : "Optional source failed",
        });
      }
    }
  }

  return stats;
}

export function isBoardSource(value: string): value is BoardSource {
  return (BOARD_SOURCES as readonly string[]).includes(value);
}

export function isJobSource(value: string): value is JobSource {
  return isBoardSource(value) || value === "adzuna" || value === "usajobs" || value === "jsearch";
}
