import { desc, eq, sql } from "drizzle-orm";
import type { ApplySource } from "@/lib/apply/hosts";
import { sourceFromUrl } from "@/lib/apply/hosts";
import { getDb } from "@/lib/db/client";
import { bulkItems, bulkRuns } from "@/lib/db/schema";
import { searchJobs } from "@/lib/services/jobs";

export async function createBulkRun(profileId: string, count: number) {
  const size = Math.min(50, Math.max(5, count));
  const db = getDb();
  const feed = await searchJobs(profileId, { sources: ["greenhouse", "lever", "ashby", "workday", "icims"] });
  const already = await db
    .select({ jobId: bulkItems.jobId })
    .from(bulkItems)
    .innerJoin(bulkRuns, eq(bulkRuns.id, bulkItems.runId))
    .where(eq(bulkRuns.profileId, profileId));
  const seen = new Set(already.map((row) => row.jobId));
  const picked = feed.jobs.filter((job) => sourceFromUrl(job.applyUrl) && !seen.has(job.id)).slice(0, size);
  const runs = await db.insert(bulkRuns).values({ profileId, requested: size, status: "queued" }).returning();
  const run = runs[0];
  if (!run) throw new Error("Could not start the apply run");
  if (picked.length) {
    await db.insert(bulkItems).values(
      picked.map((job) => ({
        runId: run.id,
        jobId: job.id,
        companyName: job.companyName,
        title: job.title,
        applyUrl: job.applyUrl,
        source: sourceFromUrl(job.applyUrl) as ApplySource,
        status: "queued",
      })),
    );
  } else {
    await db.update(bulkRuns).set({ status: "finished", finishedAt: new Date() }).where(eq(bulkRuns.id, run.id));
  }
  return getBulkRun(run.id);
}

export async function getBulkRun(id: string) {
  const db = getDb();
  const runs = await db.select().from(bulkRuns).where(eq(bulkRuns.id, id)).limit(1);
  const run = runs[0];
  if (!run) return null;
  const items = await db.select().from(bulkItems).where(eq(bulkItems.runId, id));
  return { ...run, items };
}

export async function latestBulkRun(profileId: string) {
  const runs = await getDb().select().from(bulkRuns).where(eq(bulkRuns.profileId, profileId)).orderBy(desc(bulkRuns.createdAt)).limit(1);
  const run = runs[0];
  return run ? getBulkRun(run.id) : null;
}

export async function claimQueuedItems(limit = 3) {
  const result = await getDb().execute(sql`
    UPDATE bulk_items AS item
    SET status = 'running', updated_at = now()
    WHERE item.id IN (
      SELECT id FROM bulk_items
      WHERE status = 'queued'
      ORDER BY updated_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING item.id, item.run_id, item.job_id, item.company_name, item.title, item.apply_url, item.source
  `);
  const rows = "rows" in result ? result.rows : result;
  return (rows as Array<{
    id: string;
    run_id: string;
    job_id: string;
    company_name: string;
    title: string;
    apply_url: string;
    source: string;
  }>).map((row) => ({
    id: row.id,
    runId: row.run_id,
    jobId: row.job_id,
    companyName: row.company_name,
    title: row.title,
    applyUrl: row.apply_url,
    source: row.source,
  }));
}

export async function finishBulkItem(
  id: string,
  result: { status: string; detail: string | null; proofNote: string | null; missing: string[] },
) {
  await getDb()
    .update(bulkItems)
    .set({
      status: result.status,
      detail: result.detail,
      proofNote: result.proofNote,
      missingQuestions: result.missing,
      updatedAt: new Date(),
    })
    .where(eq(bulkItems.id, id));
  const item = await getDb().select().from(bulkItems).where(eq(bulkItems.id, id)).limit(1);
  const runId = item[0]?.runId;
  if (!runId) return;
  const siblings = await getDb().select().from(bulkItems).where(eq(bulkItems.runId, runId));
  if (siblings.every((sibling) => sibling.status !== "queued" && sibling.status !== "running")) {
    await getDb().update(bulkRuns).set({ status: "finished", finishedAt: new Date() }).where(eq(bulkRuns.id, runId));
  } else {
    await getDb().update(bulkRuns).set({ status: "running" }).where(eq(bulkRuns.id, runId));
  }
}
