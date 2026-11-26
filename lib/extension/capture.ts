import { and, eq } from "drizzle-orm";
import { dedupeKey } from "@/lib/dedupe";
import { enrichJob } from "@/lib/enrich/rules";
import { serverApplySource } from "@/lib/extension/policy";
import { getDb } from "@/lib/db/client";
import { bulkItems, bulkRuns, companies, jobs } from "@/lib/db/schema";
import { sha256 } from "@/lib/secret";
import { companySlug } from "@/lib/text";

export type CapturedJobInput = {
  url: string;
  title: string;
  company: string;
  location?: string | null;
  description?: string | null;
};

export async function captureJob(profileId: string, input: CapturedJobInput) {
  const title = input.title.trim();
  const companyName = input.company.trim();
  const url = input.url.trim();
  if (!title || !companyName || !url) throw new Error("Title, company, and URL are required.");
  const description = (input.description ?? "").trim();
  const location = input.location?.trim() || null;
  const enriched = enrichJob({
    title,
    descriptionText: description,
    locationRaw: location,
    workplaceHint: /remote/i.test(`${location ?? ""} ${title}`) ? "remote" : "unknown",
  });
  const engine = serverApplySource(url);
  const db = getDb();
  const slug = companySlug(companyName) || "captured";
  const companyRows = await db
    .insert(companies)
    .values({ name: companyName, slug, source: "captured", careersUrl: url, enabled: true })
    .onConflictDoUpdate({
      target: [companies.source, companies.slug],
      set: { name: companyName, careersUrl: url },
    })
    .returning();
  const company = companyRows[0];
  if (!company) throw new Error("Could not save the company");
  const externalId = sha256(url).slice(0, 40);
  const jobRows = await db
    .insert(jobs)
    .values({
      companyId: company.id,
      source: "captured",
      externalId,
      title,
      companyName,
      descriptionText: description,
      locationRaw: location,
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
      applyUrl: url,
      sourceUrl: url,
      contentHash: sha256(`${title}|${description}|${url}`),
      dedupeKey: dedupeKey({ companyName, title, locationRaw: location, workplace: enriched.workplace }),
      raw: { captured: true },
      staleAt: null,
    })
    .onConflictDoUpdate({
      target: [jobs.source, jobs.externalId],
      set: {
        title,
        companyName,
        descriptionText: description,
        locationRaw: location,
        applyUrl: url,
        lastSeenAt: new Date(),
        staleAt: null,
      },
    })
    .returning();
  const job = jobRows[0];
  if (!job) throw new Error("Could not save the job");

  if (!engine) {
    return {
      jobId: job.id,
      queued: false,
      message: "Saved to your feed. Applykar does not submit this site for you. Use Autofill, then submit the page yourself.",
    };
  }

  const open = await db
    .select({ id: bulkItems.id })
    .from(bulkItems)
    .where(and(eq(bulkItems.jobId, job.id), eq(bulkItems.status, "queued")))
    .limit(1);
  if (!open[0]) {
    const runs = await db.insert(bulkRuns).values({ profileId, requested: 1, status: "queued" }).returning();
    const run = runs[0];
    if (run) {
      await db.insert(bulkItems).values({
        runId: run.id,
        jobId: job.id,
        companyName,
        title,
        applyUrl: url,
        source: engine,
        status: "queued",
      });
    }
  }
  return {
    jobId: job.id,
    queued: true,
    message: "Queued on your apply worker. It will fill this form from saved answers.",
  };
}
