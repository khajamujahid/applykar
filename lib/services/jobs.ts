import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { JobFilters, JobSource, ProfileRecord, ScoredJob, Seniority, Workplace } from "@/lib/domain";
import { formatSalary } from "@/lib/domain";
import { getDb } from "@/lib/db/client";
import { applications, jobStates, jobs } from "@/lib/db/schema";
import { jobTypeOf, matchesListing } from "@/lib/feed/listing";
import { passesHardFilters, scoreJob } from "@/lib/fit/score";
import { getProfile } from "@/lib/services/profiles";

const SENIORITY_VALUES: readonly Seniority[] = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "director",
  "vp",
  "cxo",
  "unknown",
];

function asSeniority(value: string): Seniority {
  return SENIORITY_VALUES.includes(value as Seniority) ? (value as Seniority) : "unknown";
}

function asWorkplace(value: string): Workplace {
  if (value === "remote" || value === "hybrid" || value === "onsite" || value === "unknown") return value;
  return "unknown";
}

type JobRow = {
  id: string;
  title: string;
  companyName: string;
  source: JobSource;
  locationRaw: string | null;
  city: string | null;
  region: string | null;
  workplace: Workplace;
  seniority: string;
  usScope: "us" | "non_us" | "unknown";
  yoeMin: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryInterval: "year" | "hour" | null;
  w2Only: boolean;
  c2cFriendly: boolean;
  noSponsorship: boolean;
  skillTags: string[];
  applyUrl: string;
  sourceUrl: string | null;
  postedAt: Date | null;
  firstSeenAt?: Date | null;
  descriptionText?: string | null;
  saved: boolean | null;
  hidden: boolean | null;
  applicationId: string | null;
  applicationStatus: ScoredJob["applicationStatus"];
  similarity: number | null;
};

function toScored(row: JobRow, profile: ProfileRecord, withDescription: boolean): ScoredJob {
  const base = {
    id: row.id,
    title: row.title,
    companyName: row.companyName,
    source: row.source,
    locationRaw: row.locationRaw,
    city: row.city,
    region: row.region,
    workplace: asWorkplace(row.workplace),
    seniority: asSeniority(row.seniority),
    yoeMin: row.yoeMin,
    salaryLabel: formatSalary({
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      salaryInterval: row.salaryInterval,
    }),
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryInterval: row.salaryInterval,
    w2Only: row.w2Only,
    c2cFriendly: row.c2cFriendly,
    noSponsorship: row.noSponsorship,
    usScope: row.usScope,
    applyUrl: row.applyUrl,
    sourceUrl: row.sourceUrl,
    postedAt: row.postedAt ? row.postedAt.toISOString() : null,
    firstSeenAt: row.firstSeenAt ? row.firstSeenAt.toISOString() : null,
    skillTags: row.skillTags ?? [],
    saved: Boolean(row.saved),
    hidden: Boolean(row.hidden),
    applicationId: row.applicationId,
    applicationStatus: row.applicationStatus,
    description: withDescription ? (row.descriptionText ?? "") : null,
    jobType: jobTypeOf(row.title, row.descriptionText ?? ""),
    isNew: Date.now() - (row.postedAt ?? row.firstSeenAt ?? new Date(0)).getTime() < 86_400_000,
  };
  const scored = scoreJob(base, profile, row.similarity);
  return { ...base, score: scored.score, scoreNotes: scored.notes, breakdown: scored.breakdown, why: scored.why };
}

function selection(profileId: string) {
  return {
    id: jobs.id,
    title: jobs.title,
    companyName: jobs.companyName,
    source: jobs.source,
    locationRaw: jobs.locationRaw,
    city: jobs.city,
    region: jobs.region,
    workplace: jobs.workplace,
    seniority: jobs.seniority,
    usScope: jobs.usScope,
    yoeMin: jobs.yoeMin,
    salaryMin: jobs.salaryMin,
    salaryMax: jobs.salaryMax,
    salaryInterval: jobs.salaryInterval,
    w2Only: jobs.w2Only,
    c2cFriendly: jobs.c2cFriendly,
    noSponsorship: jobs.noSponsorship,
    skillTags: jobs.skillTags,
    applyUrl: jobs.applyUrl,
    sourceUrl: jobs.sourceUrl,
    postedAt: jobs.postedAt,
    firstSeenAt: jobs.firstSeenAt,
    descriptionText: jobs.descriptionText,
    saved: jobStates.saved,
    hidden: jobStates.hidden,
    applicationId: applications.id,
    applicationStatus: applications.status,
    similarity: sql<number | null>`CASE WHEN ${jobs.embedding} IS NULL OR (SELECT embedding FROM profiles WHERE id = ${profileId}::uuid) IS NULL THEN NULL ELSE 1 - (${jobs.embedding} <=> (SELECT embedding FROM profiles WHERE id = ${profileId}::uuid)) END`,
  };
}

export type JobSearchResult = { jobs: ScoredJob[]; total: number; newSinceVisit: number };

/** Hours window for the feed: explicit filter, else the 7-day retention window. */
function windowHours(filters: JobFilters): number {
  return filters.postedWithinHours ?? (filters.postedWithinDays ? filters.postedWithinDays * 24 : 168);
}

export async function searchJobs(profileId: string, filters: JobFilters = {}, options: { since?: Date | null; sinceFallbackHours?: number } = {}): Promise<JobSearchResult> {
  const seenSince = options.since ?? (options.sinceFallbackHours ? new Date(Date.now() - options.sinceFallbackHours * 3_600_000) : null);
  const profile = await getProfile(profileId);
  if (!profile) return { jobs: [], total: 0, newSinceVisit: 0 };
  const where = [
    isNull(jobs.staleAt),
    isNull(jobs.duplicateOf),
    or(isNull(jobStates.hidden), eq(jobStates.hidden, false)),
  ];
  if (filters.savedOnly) where.push(eq(jobStates.saved, true));
  if (filters.q) {
    const clean = filters.q.replace(/[%_]/g, "").trim();
    const words = clean.split(/\s+/).filter(Boolean).slice(0, 6);
    const titleAll = and(...words.map((w) => ilike(jobs.title, `%${w}%`)));
    const search = or(titleAll, ilike(jobs.companyName, `%${clean}%`));
    if (search) where.push(search);
  }
  if (filters.sources?.length) where.push(inArray(jobs.source, filters.sources));
  if (!(filters.includeNonUs ?? !profile.usaOnly)) where.push(sql`${jobs.usScope} <> 'non_us'`);
  if (!(filters.includeW2Only ?? !profile.skipW2Only)) where.push(eq(jobs.w2Only, false));
  if (filters.workplace?.length) where.push(inArray(jobs.workplace, filters.workplace));
  if (filters.yoeMax) where.push(sql`(${jobs.yoeMin} IS NULL OR ${jobs.yoeMin} <= ${filters.yoeMax})`);
  if (filters.near) {
    const term = `%${filters.near.replace(/[%_]/g, "")}%`;
    where.push(sql`(${jobs.locationRaw} ILIKE ${term} OR ${jobs.city} ILIKE ${term} OR ${jobs.region} ILIKE ${term})`);
  }
  if (!filters.savedOnly && filters.tab !== "liked" && filters.tab !== "applied") {
    // Only dated postings inside the window count as "posted" (undated boards are kept but not shown as fresh).
    const since = new Date(Date.now() - windowHours(filters) * 3_600_000);
    where.push(sql`${jobs.postedAt} >= ${since}`);
  }
  const tab = filters.tab ?? "recommended";
  if (tab === "liked") where.push(eq(jobStates.saved, true));
  if (tab === "applied") where.push(inArray(applications.status, ["applied", "interview", "rejected"]));
  if (tab === "external") where.push(eq(jobs.source, "captured"));
  const db = getDb();
  const base = () =>
    db
      .select(selection(profileId))
      .from(jobs)
      .leftJoin(jobStates, and(eq(jobStates.jobId, jobs.id), eq(jobStates.profileId, profileId)))
      .leftJoin(applications, and(eq(applications.jobId, jobs.id), eq(applications.profileId, profileId)));
  const [rows, counts] = await Promise.all([
    base()
      .where(and(...where))
      .orderBy(sql`${jobs.postedAt} DESC NULLS LAST`)
      .limit(Math.max(600, (filters.limit ?? 60) * 4)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        fresh: seenSince ? sql<number>`count(*) FILTER (WHERE ${jobs.firstSeenAt} > ${seenSince})::int` : sql<number>`0`,
      })
      .from(jobs)
      .leftJoin(jobStates, and(eq(jobStates.jobId, jobs.id), eq(jobStates.profileId, profileId)))
      .leftJoin(applications, and(eq(applications.jobId, jobs.id), eq(applications.profileId, profileId)))
      .where(and(...where)),
  ]);
  const scored = rows
    .map((row) => toScored(row as JobRow, profile, false))
    .filter((job) => (tab === "applied" ? true : passesHardFilters(job, profile, filters) && matchesListing(job, filters)))
    .sort((a, b) =>
      tab === "newest"
        ? (b.postedAt ?? "").localeCompare(a.postedAt ?? "") || b.score - a.score
        : b.score - a.score || (b.postedAt ?? "").localeCompare(a.postedAt ?? ""),
    );
  return { jobs: scored.slice(0, filters.limit ?? 60), total: Number(counts[0]?.total ?? scored.length), newSinceVisit: Number(counts[0]?.fresh ?? 0) };
}

export async function getJob(profileId: string, jobId: string): Promise<ScoredJob | null> {
  const profile = await getProfile(profileId);
  if (!profile) return null;
  const rows = await getDb()
    .select(selection(profileId))
    .from(jobs)
    .leftJoin(jobStates, and(eq(jobStates.jobId, jobs.id), eq(jobStates.profileId, profileId)))
    .leftJoin(applications, and(eq(applications.jobId, jobs.id), eq(applications.profileId, profileId)))
    .where(eq(jobs.id, jobId))
    .limit(1);
  const row = rows[0];
  return row ? toScored(row as JobRow, profile, true) : null;
}

async function upsertState(profileId: string, jobId: string, saved: boolean, hidden: boolean): Promise<void> {
  await getDb()
    .insert(jobStates)
    .values({ profileId, jobId, saved, hidden })
    .onConflictDoUpdate({
      target: [jobStates.profileId, jobStates.jobId],
      set: { saved, hidden, updatedAt: new Date() },
    });
}

export async function saveJob(profileId: string, jobId: string, saved = true): Promise<void> {
  const current = await getDb()
    .select()
    .from(jobStates)
    .where(and(eq(jobStates.profileId, profileId), eq(jobStates.jobId, jobId)))
    .limit(1);
  await upsertState(profileId, jobId, saved, current[0]?.hidden ?? false);
}

export async function hideJob(profileId: string, jobId: string, hidden = true): Promise<void> {
  const current = await getDb()
    .select()
    .from(jobStates)
    .where(and(eq(jobStates.profileId, profileId), eq(jobStates.jobId, jobId)))
    .limit(1);
  await upsertState(profileId, jobId, hidden ? false : (current[0]?.saved ?? false), hidden);
}

export async function listSaved(profileId: string): Promise<ScoredJob[]> {
  const result = await searchJobs(profileId, { savedOnly: true, includeLeadership: true, includeNonUs: true, includeW2Only: true });
  return result.jobs;
}

/**
 * Remember when the Jobs page was last opened. Returns the previous visit (used for "N new since last visit");
 * visits within 30 minutes of each other count as one.
 */
export async function markFeedVisit(profileId: string): Promise<Date | null> {
  const result = await getDb().execute(sql`
    UPDATE profiles SET
      feed_prev_seen_at = CASE WHEN feed_seen_at IS NULL OR feed_seen_at < now() - interval '30 minutes' THEN feed_seen_at ELSE feed_prev_seen_at END,
      feed_seen_at = now()
    WHERE id = ${profileId}::uuid
    RETURNING feed_prev_seen_at`);
  const rows = ("rows" in result ? result.rows : result) as { feed_prev_seen_at: Date | string | null }[];
  const value = rows[0]?.feed_prev_seen_at;
  return value ? new Date(value) : null;
}
