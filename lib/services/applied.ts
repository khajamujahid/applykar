import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { applications, jobs } from "@/lib/db/schema";
import type { ApplicationStatus } from "@/lib/domain";
import type { AppEvent } from "@/lib/apply/pipeline";

export type AppliedRow = {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  title: string;
  companyName: string;
  applyUrl: string;
  sourceUrl: string | null;
  locationRaw: string | null;
  missing: string[];
  hasProof: boolean;
  appliedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

type Snapshot = { title?: string; companyName?: string; applyUrl?: string; sourceUrl?: string | null; locationRaw?: string | null };

const columns = {
  id: applications.id,
  jobId: applications.jobId,
  status: applications.status,
  missing: applications.missing,
  hasProof: sql<boolean>`${applications.proofPng} IS NOT NULL`,
  appliedAt: applications.appliedAt,
  updatedAt: applications.updatedAt,
  createdAt: applications.createdAt,
  snapshot: applications.jobSnapshot,
  title: jobs.title,
  companyName: jobs.companyName,
  applyUrl: jobs.applyUrl,
  sourceUrl: jobs.sourceUrl,
  locationRaw: jobs.locationRaw,
};

function toRow(r: { [K in keyof typeof columns]: unknown }): AppliedRow {
  const snap = (r.snapshot ?? {}) as Snapshot;
  return {
    id: r.id as string,
    jobId: r.jobId as string,
    status: r.status as ApplicationStatus,
    title: (r.title as string) ?? snap.title ?? "Job",
    companyName: (r.companyName as string) ?? snap.companyName ?? "",
    applyUrl: (r.applyUrl as string) ?? snap.applyUrl ?? "",
    sourceUrl: (r.sourceUrl as string | null) ?? snap.sourceUrl ?? null,
    locationRaw: (r.locationRaw as string | null) ?? snap.locationRaw ?? null,
    missing: (r.missing as string[]) ?? [],
    hasProof: Boolean(r.hasProof),
    appliedAt: r.appliedAt ? (r.appliedAt as Date).toISOString() : null,
    updatedAt: (r.updatedAt as Date).toISOString(),
    createdAt: (r.createdAt as Date).toISOString(),
  };
}

export async function listApplied(profileId: string): Promise<AppliedRow[]> {
  const rows = await getDb()
    .select(columns)
    .from(applications)
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .where(eq(applications.profileId, profileId))
    .orderBy(desc(applications.updatedAt))
    .limit(500);
  return rows.map(toRow);
}

export async function getApplied(profileId: string, id: string) {
  const rows = await getDb()
    .select({ ...columns, events: applications.events, answers: applications.answers, proofNote: applications.proofNote, descriptionText: jobs.descriptionText, salaryLabelMin: jobs.salaryMin, salaryLabelMax: jobs.salaryMax })
    .from(applications)
    .leftJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(eq(applications.id, id), eq(applications.profileId, profileId)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    ...toRow(r),
    events: (r.events ?? []) as AppEvent[],
    answers: (r.answers ?? []) as { question: string; answer: string }[],
    proofNote: r.proofNote,
  };
}
