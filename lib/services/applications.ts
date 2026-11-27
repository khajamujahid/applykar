import { and, desc, eq } from "drizzle-orm";
import { buildAnswerPacket } from "@/lib/apply/packet";
import type { ApplicationStatus, ScoredJob } from "@/lib/domain";
import { getDb } from "@/lib/db/client";
import { applications } from "@/lib/db/schema";
import { getJob } from "@/lib/services/jobs";
import { getAnswers, getProfile } from "@/lib/services/profiles";

const RANK: Record<ApplicationStatus, number> = {
  queued: 0,
  failed: 0,
  needs_info: 1,
  applying: 1,
  ready_for_review: 1,
  applied: 2,
  interview: 3,
  rejected: 4,
  withdrawn: 4,
};

export type ApplicationListItem = {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  title: string;
  companyName: string;
  applyUrl: string;
  score: number;
  proofNote: string | null;
  proofUrl: string | null;
  updatedAt: string;
  appliedAt: string | null;
};

export type ApplicationDetail = ApplicationListItem & {
  job: ScoredJob;
  answerPacket: string;
  whyThisRole: string;
  notes: string | null;
};

async function packetFor(profileId: string, job: ScoredJob, why?: string) {
  const profile = await getProfile(profileId);
  const answers = await getAnswers(profileId);
  if (!profile) throw new Error("Profile not found");
  return buildAnswerPacket({
    job: {
      title: job.title,
      companyName: job.companyName,
      applyUrl: job.applyUrl,
      skillTags: job.skillTags,
      locationRaw: job.locationRaw,
    },
    profile,
    answers,
    whyThisRole: why,
  });
}

export async function queueApplication(
  profileId: string,
  jobId: string,
  status: Extract<ApplicationStatus, "queued" | "ready_for_review"> = "queued",
): Promise<ApplicationDetail> {
  const job = await getJob(profileId, jobId);
  if (!job) throw new Error("Job not found");
  const packet = await packetFor(profileId, job);
  const db = getDb();
  const existing = await db
    .select()
    .from(applications)
    .where(and(eq(applications.profileId, profileId), eq(applications.jobId, jobId)))
    .limit(1);
  const current = existing[0];
  if (current && RANK[current.status] > RANK[status]) {
    return getApplication(profileId, current.id) as Promise<ApplicationDetail>;
  }
  const rows = await db
    .insert(applications)
    .values({
      profileId,
      jobId,
      status,
      answerPacket: packet.text,
      whyThisRole: packet.whyThisRole,
    })
    .onConflictDoUpdate({
      target: [applications.profileId, applications.jobId],
      set: {
        status,
        answerPacket: packet.text,
        whyThisRole: packet.whyThisRole,
        updatedAt: new Date(),
      },
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("Could not queue the application");
  const detail = await getApplication(profileId, row.id);
  if (!detail) throw new Error("Could not load the application");
  return detail;
}

export async function listApplications(profileId: string, status?: ApplicationStatus): Promise<ApplicationListItem[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(applications)
    .where(status ? and(eq(applications.profileId, profileId), eq(applications.status, status)) : eq(applications.profileId, profileId))
    .orderBy(desc(applications.updatedAt));
  const items: ApplicationListItem[] = [];
  for (const row of rows) {
    const job = await getJob(profileId, row.jobId);
    if (!job) continue;
    items.push({
      id: row.id,
      jobId: row.jobId,
      status: row.status,
      title: job.title,
      companyName: job.companyName,
      applyUrl: job.applyUrl,
      score: job.score,
      proofNote: row.proofNote,
      proofUrl: row.proofUrl,
      updatedAt: row.updatedAt.toISOString(),
      appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    });
  }
  return items;
}

export async function getApplication(profileId: string, id: string): Promise<ApplicationDetail | null> {
  const rows = await getDb()
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.profileId, profileId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const job = await getJob(profileId, row.jobId);
  if (!job) return null;
  const packet = row.answerPacket
    ? { text: row.answerPacket, whyThisRole: row.whyThisRole ?? "" }
    : await packetFor(profileId, job, row.whyThisRole ?? undefined);
  return {
    id: row.id,
    jobId: row.jobId,
    status: row.status,
    title: job.title,
    companyName: job.companyName,
    applyUrl: job.applyUrl,
    score: job.score,
    proofNote: row.proofNote,
    proofUrl: row.proofUrl,
    updatedAt: row.updatedAt.toISOString(),
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
    job,
    answerPacket: packet.text,
    whyThisRole: packet.whyThisRole,
    notes: row.notes,
  };
}

export async function updateApplicationStatus(
  profileId: string,
  id: string,
  status: ApplicationStatus,
  proof?: { note?: string | null; url?: string | null; notes?: string | null },
): Promise<ApplicationDetail> {
  const existing = await getApplication(profileId, id);
  if (!existing) throw new Error("Application not found");
  await getDb()
    .update(applications)
    .set({
      status,
      proofNote: proof?.note === undefined ? undefined : proof.note,
      proofUrl: proof?.url === undefined ? undefined : proof.url,
      notes: proof?.notes === undefined ? undefined : proof.notes,
      appliedAt: status === "applied" ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(applications.id, id), eq(applications.profileId, profileId)));
  const detail = await getApplication(profileId, id);
  if (!detail) throw new Error("Application not found");
  return detail;
}
