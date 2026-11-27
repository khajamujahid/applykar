/**
 * Background apply pipeline (Tsenta-style): queue -> tailor resume to the JD -> open the ATS form -> fill saved answers +
 * upload the tailored PDF -> submit only when Background auto-apply is ON (otherwise stop before submit) -> proof.
 * Runs inside a Vercel function (instant, serverless Chromium) and in the GitHub worker (backup / cron).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Browser } from "playwright-core";
import { getDb } from "@/lib/db/client";
import { applications, jobDetails, jobs, companies, ownerSettings, profiles, tailoredResumes } from "@/lib/db/schema";
import type { ApplicationStatus } from "@/lib/domain";
import { fetchJobDescription } from "@/lib/jobs/details";
import { sourceFromUrl } from "@/lib/apply/hosts";
import { mailWaiter } from "@/lib/apply/mail-wait";
import { OWNER_NAME } from "@/lib/profile/defaults";
import { getAnswers, getProfile, rememberQuestions } from "@/lib/services/profiles";
import { tailorResume } from "@/lib/resume/tailor";
import { resumePdf } from "@/lib/resume/pdf";
import type { ResumeData } from "@/lib/resume/types";

export type AppEvent = { at: string; kind: string; text: string };

const now = () => new Date().toISOString();

async function addEvent(id: string, kind: string, text: string, patch: Partial<typeof applications.$inferInsert> = {}) {
  const event: AppEvent = { at: now(), kind, text };
  await getDb()
    .update(applications)
    .set({ ...patch, events: sql`${applications.events} || ${JSON.stringify([event])}::jsonb`, updatedAt: new Date() })
    .where(eq(applications.id, id));
}

export async function getSettings() {
  const rows = await getDb().select().from(ownerSettings).where(eq(ownerSettings.id, "owner")).limit(1);
  return rows[0] ?? null;
}

/** Full description (cached). Falls back to the stored excerpt. */
export async function fullDescription(jobId: string): Promise<string> {
  const db = getDb();
  const cached = await db.select().from(jobDetails).where(eq(jobDetails.jobId, jobId)).limit(1);
  if (cached[0]) return cached[0].description;
  const rows = await db
    .select({ source: jobs.source, externalId: jobs.externalId, slug: companies.slug, applyUrl: jobs.applyUrl, sourceUrl: jobs.sourceUrl, excerpt: jobs.descriptionText })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(eq(jobs.id, jobId))
    .limit(1);
  const row = rows[0];
  if (!row) return "";
  const text = await fetchJobDescription({ source: row.source, externalId: row.externalId, companySlug: row.slug, applyUrl: row.applyUrl, sourceUrl: row.sourceUrl });
  if (text.length > 200) {
    await db.insert(jobDetails).values({ jobId, description: text.slice(0, 40_000) }).onConflictDoNothing();
    return text;
  }
  return row.excerpt ?? "";
}

/** Queue an application instantly (status Queued). Returns the application id. */
export async function queueApply(profileId: string, jobId: string): Promise<{ id: string; status: ApplicationStatus }> {
  const db = getDb();
  const existing = await db.select().from(applications).where(and(eq(applications.profileId, profileId), eq(applications.jobId, jobId))).limit(1);
  const current = existing[0];
  if (current && !["failed", "ready_for_review", "withdrawn"].includes(current.status) && current.status !== "queued")
    return { id: current.id, status: current.status };
  const job = (await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
  if (!job) throw new Error("Job not found");
  const snapshot = {
    title: job.title,
    companyName: job.companyName,
    applyUrl: job.applyUrl,
    sourceUrl: job.sourceUrl,
    locationRaw: job.locationRaw,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryInterval: job.salaryInterval,
    postedAt: job.postedAt?.toISOString() ?? null,
    source: job.source,
  };
  const event: AppEvent = { at: now(), kind: "queued", text: "Queued for background apply" };
  const rows = await db
    .insert(applications)
    .values({ profileId, jobId, status: "queued", jobSnapshot: snapshot, events: [event] })
    .onConflictDoUpdate({
      target: [applications.profileId, applications.jobId],
      set: { status: "queued", jobSnapshot: snapshot, events: sql`${applications.events} || ${JSON.stringify([event])}::jsonb`, updatedAt: new Date() },
    })
    .returning({ id: applications.id });
  return { id: rows[0]!.id, status: "queued" };
}

/** Atomically move up to `limit` queued applications to Applying. */
export async function claimQueued(limit: number, onlyId?: string): Promise<{ id: string; profileId: string; jobId: string }[]> {
  const result = await getDb().execute(sql`
    UPDATE applications SET status = 'applying', updated_at = now()
    WHERE id IN (
      SELECT id FROM applications WHERE status = 'queued' ${onlyId ? sql`AND id = ${onlyId}::uuid` : sql``}
      ORDER BY updated_at ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
    )
    RETURNING id, profile_id, job_id`);
  const rows = ("rows" in result ? result.rows : result) as { id: string; profile_id: string; job_id: string }[];
  return rows.map((r) => ({ id: r.id, profileId: r.profile_id, jobId: r.job_id }));
}

function ownerEmail(settingsEmail: string | null | undefined): string {
  const allowed = (process.env.ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim()).filter((e) => e.includes("@"));
  return settingsEmail || allowed[0] || "";
}

/** Tailor + store the resume for one application. Returns the PDF (or null when the profile has no structured resume). */
export async function tailorForApplication(
  app: { id: string; profileId: string; jobId: string },
  browser?: Browser,
): Promise<{ pdf: Buffer; filename: string; score: number } | null> {
  const db = getDb();
  const profileRow = (await db.select({ resumeData: profiles.resumeData }).from(profiles).where(eq(profiles.id, app.profileId)).limit(1))[0];
  const base = profileRow?.resumeData as ResumeData | null;
  if (!base?.personalInformation) return null;
  const job = (await db.select().from(jobs).where(eq(jobs.id, app.jobId)).limit(1))[0];
  if (!job) return null;
  const description = await fullDescription(app.jobId);
  const tailored = await tailorResume(base, { title: job.title, companyName: job.companyName, description, skillTags: job.skillTags });
  const pdf = await resumePdf(tailored.data, browser);
  await db.insert(tailoredResumes).values({
    profileId: app.profileId,
    jobId: app.jobId,
    applicationId: app.id,
    data: tailored.data,
    changes: tailored.changes,
    keywords: tailored.matched,
    matchScore: tailored.matchScore,
    engine: tailored.engine,
    pdf,
  });
  const p = base.personalInformation;
  const filename = `${[p.firstName, p.lastName].filter(Boolean).join("_").replace(/[^\w-]+/g, "") || "Resume"}_Resume.pdf`;
  return { pdf, filename, score: tailored.matchScore };
}

export async function latestTailored(applicationId: string) {
  const rows = await getDb()
    .select()
    .from(tailoredResumes)
    .where(eq(tailoredResumes.applicationId, applicationId))
    .orderBy(desc(tailoredResumes.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Run one claimed application end to end. Never throws. */
export async function processApplication(app: { id: string; profileId: string; jobId: string }, launch: () => Promise<Browser>): Promise<ApplicationStatus> {
  let browser: Browser | null = null;
  try {
    const settings = await getSettings();
    let submit = Boolean(settings?.autoApply) && process.env.APPLY_SUBMIT !== "0";
    if (submit && (await appliedToday()) >= (settings?.dailyLimit ?? 50)) {
      submit = false;
      await addEvent(app.id, "limit", "Daily apply limit reached; the form is filled and held for review instead of submitted");
    }
    await addEvent(app.id, "applying", "Started: tailoring resume to the job description");
    browser = await launch();
    const tailored = await tailorForApplication(app, browser);
    await addEvent(app.id, "tailored", tailored ? `Tailored resume ready (match ${tailored.score}%)` : "No structured resume on this profile; using the uploaded resume");
    const job = (await getDb().select().from(jobs).where(eq(jobs.id, app.jobId)).limit(1))[0];
    const source = job ? sourceFromUrl(job.applyUrl) : null;
    if (!job || !source) {
      await addEvent(app.id, "needs_info", "This career site is not supported for background apply yet. Open the original job link to apply.", {
        status: "needs_info",
        missing: ["Unsupported application site"],
      });
      return "needs_info";
    }
    const email = ownerEmail(settings?.email);
    const profile = await getProfile(app.profileId, email);
    const answers = await getAnswers(app.profileId);
    let resumeFilePath: string | null = null;
    if (tailored) {
      const dir = path.join(os.tmpdir(), "applykar", app.id);
      await mkdir(dir, { recursive: true });
      resumeFilePath = path.join(dir, tailored.filename);
      await writeFile(resumeFilePath, tailored.pdf);
    }
    await addEvent(app.id, "form", `Opening the ${source} application form`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
    const { applyOnPage } = await import("@/lib/apply/browser");
    const result = await applyOnPage(page as never, {
      url: job.applyUrl,
      source,
      employer: job.companyName,
      answers,
      resumeText: profile?.resumeText ?? "",
      resumeFilename: profile?.resumeFilename ?? null,
      resumeFilePath,
      applicant: { name: OWNER_NAME, email, yearsExperience: profile?.yearsExperience ?? null },
      submit,
      verification: mailWaiter(app.profileId, new Date()),
    });
    const proof = result.screenshotPath ? await readFile(result.screenshotPath).catch(() => null) : null;
    const common = { answers: result.answers ?? [], proofPng: proof, proofNote: result.proofNote?.slice(0, 2000) ?? null };
    if (result.status === "applied") {
      await addEvent(app.id, "applied", "Application submitted; confirmation captured", { ...common, status: "applied", appliedAt: new Date(), missing: [] });
      return "applied";
    }
    if (result.status === "ready") {
      await addEvent(app.id, "ready", "Form filled with your answers and tailored resume. Stopped before submit (Background auto-apply is off).", {
        ...common,
        status: "ready_for_review",
        missing: [],
      });
      return "ready_for_review";
    }
    if (result.status === "skipped" && result.missing.length) {
      const saved = await rememberQuestions(app.profileId, result.missing).catch(() => 0);
      if (saved) await addEvent(app.id, "saved_questions", `Added ${saved} new question${saved > 1 ? "s" : ""} to your saved answers (Profiles) to fill once`).catch(() => undefined);
      await addEvent(app.id, "needs_info", `Needs ${result.missing.length} answer${result.missing.length > 1 ? "s" : ""} before it can be submitted`, {
        ...common,
        status: "needs_info",
        missing: result.missing.slice(0, 20),
      });
      return "needs_info";
    }
    await addEvent(app.id, "failed", result.error ?? "The form could not be completed", { ...common, status: "failed", missing: result.missing.slice(0, 20) });
    return "failed";
  } catch (error) {
    await addEvent(app.id, "failed", error instanceof Error ? error.message.slice(0, 300) : "Apply failed", { status: "failed" }).catch(() => undefined);
    return "failed";
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

/** Applications submitted today (for the daily limit). */
export async function appliedToday(): Promise<number> {
  const rows = await getDb().execute(sql`SELECT count(*)::int AS n FROM applications WHERE applied_at >= date_trunc('day', now())`);
  const list = ("rows" in rows ? rows.rows : rows) as { n: number }[];
  return Number(list[0]?.n ?? 0);
}
