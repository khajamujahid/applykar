import { config } from "dotenv";
import { chromium } from "playwright";
import { applyOnPage } from "../lib/apply/browser";
import type { ApplySource } from "../lib/apply/hosts";
import { claimQueuedItems, finishBulkItem } from "../lib/apply/bulk";
import { mailWaiter } from "../lib/apply/mail-wait";
import { getAnswers, getProfile } from "../lib/services/profiles";
import { updateApplicationStatus, queueApplication } from "../lib/services/applications";
import { getDb } from "../lib/db/client";
import { bulkRuns, ownerSettings } from "../lib/db/schema";
import { OWNER_NAME } from "../lib/profile/defaults";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });
config({ path: ".env" });

const submit = process.env.APPLY_SUBMIT !== "0";
const concurrency = Math.min(6, Math.max(1, Number(process.env.APPLY_CONCURRENCY || 3)));

async function runOne(item: {
  id: string;
  runId: string;
  jobId: string;
  companyName: string;
  title: string;
  applyUrl: string;
  source: string;
}) {
  const runs = await getDb().select().from(bulkRuns).where(eq(bulkRuns.id, item.runId)).limit(1);
  const profileId = runs[0]?.profileId;
  if (!profileId) {
    await finishBulkItem(item.id, { status: "failed", detail: "Profile missing", proofNote: null, missing: [] });
    return;
  }
  const settings = await getDb().select().from(ownerSettings).where(eq(ownerSettings.id, "owner")).limit(1);
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.includes("@"));
  const email = settings[0]?.email || (allowed.length === 1 ? allowed[0] : "");
  const profile = await getProfile(profileId, email);
  const answers = await getAnswers(profileId);
  if (!profile) {
    await finishBulkItem(item.id, { status: "failed", detail: "Profile missing", proofNote: null, missing: [] });
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    const result = await applyOnPage(page, {
      url: item.applyUrl,
      source: item.source as ApplySource,
      employer: item.companyName,
      answers,
      resumeText: profile.resumeText,
      resumeFilename: profile.resumeFilename,
      applicant: { name: OWNER_NAME, email },
      submit,
      verification: mailWaiter(profileId, new Date()),
    });
    if (result.status === "applied") {
      const application = await queueApplication(profileId, item.jobId, "ready_for_review");
      await updateApplicationStatus(profileId, application.id, "applied", {
        note: result.proofNote,
        url: result.screenshotPath,
      });
    }
    await finishBulkItem(item.id, {
      status: result.status,
      detail: result.error ?? result.proofNote,
      proofNote: result.proofNote,
      missing: result.missing,
    });
  } catch (error) {
    await finishBulkItem(item.id, {
      status: "failed",
      detail: error instanceof Error ? error.message : "Apply failed",
      proofNote: null,
      missing: [],
    });
  } finally {
    await browser.close();
  }
}

async function tick() {
  const items = await claimQueuedItems(concurrency);
  await Promise.all(items.map((item) => runOne(item)));
  return items.length;
}

async function main() {
  const once = process.argv.includes("--once");
  do {
    const count = await tick();
    if (once) break;
    if (count === 0) await new Promise((resolve) => setTimeout(resolve, 2000));
  } while (!once);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
