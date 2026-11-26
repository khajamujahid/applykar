import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { JobFilters, JobSource, ProfileRecord, ScoredJob, Seniority, Workplace } from "@/lib/domain";
import { formatSalary } from "@/lib/domain";
import { getDb } from "@/lib/db/client";
import { applications, jobStates, jobs } from "@/lib/db/schema";
import { matchesListing } from "@/lib/feed/listing";
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
    skillTags: row.skillTags ?? [],
    saved: Boolean(row.saved),
    hidden: Boolean(row.hidden),
    applicationId: row.applicationId,
    applicationStatus: row.applicationStatus,
    description: withDescription ? (row.descriptionText ?? "") : null,
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
    descriptionText: jobs.descriptionText,
    saved: jobStates.saved,
    hidden: jobStates.hidden,
    applicationId: applications.id,
    applicationStatus: applications.status,
    similarity: sql<number | null>`CASE WHEN ${jobs.embedding} IS NULL OR (SELECT embedding FROM profiles WHERE id = ${profileId}::uuid) IS NULL THEN NULL ELSE 1 - (${jobs.embedding} <=> (SELECT embedding FROM profiles WHERE id = ${profileId}::uuid)) END`,
  };
}

export async function searchJobs(profileId: string, filters: JobFilters = {}): Promise<{ jobs: ScoredJob[]; total: number }> {
  const profile = await getProfile(profileId);
  if (!profile) return { jobs: [], total: 0 };
  const where = [
    isNull(jobs.staleAt),
    isNull(jobs.duplicateOf),
    or(isNull(jobStates.hidden), eq(jobStates.hidden, false)),
  ];
  if (filters.savedOnly) where.push(eq(jobStates.saved, true));
  if (filters.q) {
    const term = `%${filters.q.replace(/[%_]/g, "")}%`;
    const search = or(ilike(jobs.title, term), ilike(jobs.companyName, term));
    if (search) where.push(search);
  }
  if (filters.sources?.length) where.push(inArray(jobs.source, filters.sources));
  if (!filters.includeNonUs) where.push(sql`${jobs.usScope} <> 'non_us'`);
  if (filters.workplace?.length) where.push(inArray(jobs.workplace, filters.workplace));
  if (filters.postedWithinDays) {
    const since = new Date(Date.now() - filters.postedWithinDays * 86_400_000);
    const posted = or(sql`${jobs.postedAt} >= ${since}`, sql`${jobs.postedAt} IS NULL AND ${jobs.firstSeenAt} >= ${since}`);
    if (posted) where.push(posted);
  }
  const tab = filters.tab ?? "recommended";
  if (tab === "liked") where.push(eq(jobStates.saved, true));
  if (tab === "applied") where.push(inArray(applications.status, ["applied", "interview", "rejected"]));
  if (tab === "external") where.push(eq(jobs.source, "captured"));
  if (tab === "recommended") {
    const open = or(isNull(applications.status), inArray(applications.status, ["queued", "ready_for_review"]));
    if (open) where.push(open);
  }
  const rows = await getDb()
    .select(selection(profileId))
    .from(jobs)
    .leftJoin(jobStates, and(eq(jobStates.jobId, jobs.id), eq(jobStates.profileId, profileId)))
    .leftJoin(applications, and(eq(applications.jobId, jobs.id), eq(applications.profileId, profileId)))
    .where(and(...where))
    .orderBy(sql`${jobs.postedAt} DESC NULLS LAST`)
    .limit(600);
  const scored = rows
    .map((row) => toScored(row as JobRow, profile, false))
    .filter((job) => (tab === "applied" ? true : passesHardFilters(job, profile, filters) && matchesListing(job, filters)))
    .sort((a, b) => b.score - a.score || (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
  return { jobs: scored.slice(0, 80), total: scored.length };
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
