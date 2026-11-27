"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import type { ApplicationStatus } from "@/lib/domain";
import { PROFILE_COOKIE, currentProfile } from "@/lib/current";
import { createBulkRun } from "@/lib/apply/bulk";
import { createExtensionToken } from "@/lib/extension/auth";
import { savePreset } from "@/lib/feed/presets";
import { saveImapConnection } from "@/lib/inbox/connections";
import { syncGmail } from "@/lib/inbox/gmail";
import { pollImapInbox } from "@/lib/inbox/poll";
import { ingestBatch } from "@/lib/ingest/run";
import { extractResumeText } from "@/lib/profile/resume-file";
import { parseResume } from "@/lib/profile/parse-resume";
import { queueApplication, updateApplicationStatus } from "@/lib/services/applications";
import { hideJob, saveJob } from "@/lib/services/jobs";
import {
  createProfile,
  setActiveProfile,
  updateAnswers,
  updateProfile,
} from "@/lib/services/profiles";
import { defaultAnswers } from "@/lib/profile/defaults";

async function remember(profileId: string) {
  const jar = await cookies();
  jar.set(PROFILE_COOKIE, profileId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function queueJobAction(jobId: string) {
  const { profile } = await currentProfile();
  await queueApplication(profile.id, jobId, "queued");
}

export async function prepareJobAction(jobId: string) {
  const { profile } = await currentProfile();
  const application = await queueApplication(profile.id, jobId, "ready_for_review");
  redirect(`/applications/${application.id}`);
}

export async function saveJobAction(jobId: string, saved: boolean) {
  const { profile } = await currentProfile();
  await saveJob(profile.id, jobId, saved);
}

export async function hideJobAction(jobId: string) {
  const { profile } = await currentProfile();
  await hideJob(profile.id, jobId, true);
}

export async function markAppliedAction(applicationId: string, formData: FormData) {
  const { profile } = await currentProfile();
  await updateApplicationStatus(profile.id, applicationId, "applied", {
    note: String(formData.get("proofNote") ?? ""),
    url: String(formData.get("proofUrl") ?? ""),
  });
}

export async function setStatusAction(applicationId: string, status: ApplicationStatus) {
  const { profile } = await currentProfile();
  await updateApplicationStatus(profile.id, applicationId, status);
}

export async function switchProfileAction(profileId: string) {
  const { email } = await currentProfile();
  await setActiveProfile(profileId, email);
  await remember(profileId);
}

export async function createProfileAction(name: string) {
  const { email } = await currentProfile();
  const profile = await createProfile({ name: name.trim() || "New profile", email });
  await setActiveProfile(profile.id, email);
  await remember(profile.id);
  redirect("/onboarding");
}

export async function ingestAction() {
  await currentProfile();
  await ingestBatch({ limitCompanies: 4 });
}

export async function startBulkApplyAction(count: number) {
  const { profile } = await currentProfile();
  await createBulkRun(profile.id, count);
}

export async function savePresetAction(formData: FormData) {
  const { profile } = await currentProfile();
  const name = String(formData.get("name") ?? "").trim();
  const query = String(formData.get("query") ?? "");
  if (name) await savePreset(profile.id, name, query);
}

export async function syncMailAction() {
  await currentProfile();
  await syncGmail();
  try {
    await pollImapInbox();
  } catch {
    return;
  }
}

export async function saveImapAction(formData: FormData) {
  await currentProfile();
  await saveImapConnection({
    host: String(formData.get("host") ?? ""),
    port: Number(formData.get("port") ?? 993),
    user: String(formData.get("user") ?? ""),
    password: String(formData.get("password") ?? ""),
    tls: formData.get("tls") === "on",
  });
}

export async function createExtensionTokenAction() {
  const { email } = await currentProfile();
  return createExtensionToken(email);
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

function checked(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((value) => String(value))
    .filter(Boolean);
}

export async function completeOnboardingAction(formData: FormData) {
  const { profile } = await currentProfile();
  const file = formData.get("resume");
  let resumeText = profile.resumeText;
  let resumeFilename = profile.resumeFilename;
  let parsed = parseResume(resumeText);
  if (file instanceof File && file.size > 0) {
    if (file.size > 5_000_000) throw new Error("Resume must be 5 MB or smaller.");
    resumeText = await extractResumeText(file.name, new Uint8Array(await file.arrayBuffer()));
    resumeFilename = file.name;
    parsed = parseResume(resumeText);
  }
  const interests = checked(formData, "interests");
  const locations = checked(formData, "locations");
  const skills = String(formData.get("skills") ?? "")
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
  const titles = String(formData.get("titles") ?? "")
    .split(",")
    .map((title) => title.trim())
    .filter(Boolean);
  await updateProfile(profile.id, {
    name: String(formData.get("name") ?? profile.name).trim() || profile.name,
    headline: parsed.headline || profile.headline,
    resumeText,
    resumeFilename,
    skills: skills.length ? skills : parsed.skills,
    targetTitles: titles.length ? titles : parsed.targetTitles,
    interests,
    locations: locations.length ? locations : profile.locations,
    yearsExperience: parsed.yearsExperience ?? profile.yearsExperience,
    onboardingComplete: true,
  });
  const answers = defaultAnswers();
  await updateAnswers(profile.id, answers);
  redirect("/feed");
}

export async function saveProfileAction(formData: FormData) {
  const { profile } = await currentProfile();
  const file = formData.get("resume");
  let resumeText = profile.resumeText;
  let resumeFilename = profile.resumeFilename;
  if (file instanceof File && file.size > 0) {
    if (file.size > 5_000_000) throw new Error("Resume must be 5 MB or smaller.");
    resumeText = await extractResumeText(file.name, new Uint8Array(await file.arrayBuffer()));
    resumeFilename = file.name;
  }
  const list = (name: string) =>
    String(formData.get(name) ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  await updateProfile(profile.id, {
    name: String(formData.get("name") ?? profile.name),
    headline: String(formData.get("headline") ?? ""),
    skills: list("skills"),
    targetTitles: list("titles"),
    locations: list("locations"),
    interests: list("interests"),
    yearsExperience: Number(formData.get("years")) || null,
    yoeMax: Number(formData.get("yoeMax")) || null,
    salaryMin: Number(formData.get("salaryMin")) || profile.salaryMin,
    salaryMax: Number(formData.get("salaryMax")) || profile.salaryMax,
    c2cMinHourly: Number(formData.get("c2c")) || profile.c2cMinHourly,
    skipW2Only: formData.get("skipW2") === "on",
    prefersC2c: formData.get("prefersC2c") === "on",
    usaOnly: formData.get("usaOnly") === "on",
    includeLeadership: formData.get("leadership") === "on",
    openToRelocate: formData.get("relocate") === "on",
    resumeText,
    resumeFilename,
    onboardingComplete: true,
  });
  const answers = defaultAnswers().map((answer) => ({
    ...answer,
    answer: String(formData.get(`answer:${answer.key}`) ?? answer.answer),
  }));
  await updateAnswers(profile.id, answers);
}

// ---- Applykar v2 (approved designs) ----

export async function markInterviewAction(applicationId: string) {
  const { profile } = await currentProfile();
  await updateApplicationStatus(profile.id, applicationId, "interview");
  revalidatePath(`/applications/${applicationId}`);
}

export async function withdrawAction(applicationId: string) {
  const { profile } = await currentProfile();
  await updateApplicationStatus(profile.id, applicationId, "withdrawn");
  revalidatePath(`/applications/${applicationId}`);
}

export async function tailorNowAction(applicationId: string) {
  const { profile } = await currentProfile();
  const { tailorForApplication } = await import("@/lib/apply/pipeline");
  const { getDb } = await import("@/lib/db/client");
  const { applications } = await import("@/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await getDb()
    .select({ id: applications.id, jobId: applications.jobId })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.profileId, profile.id)))
    .limit(1);
  if (!rows[0]) return { ok: false, error: "Application not found" };
  const { launchChromium } = await import("@/lib/resume/pdf");
  const browser = await launchChromium();
  try {
    const result = await tailorForApplication({ id: rows[0].id, profileId: profile.id, jobId: rows[0].jobId }, browser);
    revalidatePath(`/applications/${applicationId}`);
    return result ? { ok: true } : { ok: false, error: "Add a structured resume to this profile first (Profiles → Resume)." };
  } finally {
    await browser.close();
  }
}

async function answerKey(question: string, profileId: string) {
  const { matchAnswerKey, customAnswerKey } = await import("@/lib/profile/answer-catalog");
  const { getAnswers } = await import("@/lib/services/profiles");
  return matchAnswerKey(question, await getAnswers(profileId)) ?? customAnswerKey(question);
}

/** Save answers for the questions an application was missing, then queue it again. */
export async function answerAndRetryAction(applicationId: string, formData: FormData) {
  const { profile } = await currentProfile();
  const pairs = [...formData.entries()].filter(([k, v]) => k.startsWith("q:") && String(v).trim());
  if (pairs.length) {
    const { catalogEntry, cleanQuestion } = await import("@/lib/profile/answer-catalog");
    const items = [];
    for (const [k, v] of pairs) {
      const question = cleanQuestion(k.slice(2));
      const key = await answerKey(question, profile.id);
      items.push({ key, question: catalogEntry(key)?.question ?? question, answer: String(v).trim() });
    }
    await updateAnswers(profile.id, items);
  }
  const { getDb } = await import("@/lib/db/client");
  const { applications } = await import("@/lib/db/schema");
  const { and, eq } = await import("drizzle-orm");
  const rows = await getDb().select({ jobId: applications.jobId }).from(applications).where(and(eq(applications.id, applicationId), eq(applications.profileId, profile.id))).limit(1);
  if (rows[0]) {
    const { queueApply } = await import("@/lib/apply/pipeline");
    await queueApply(profile.id, rows[0].jobId);
  }
  revalidatePath(`/applications/${applicationId}`);
}

async function targetProfileId(profileId?: string) {
  const { profile, email } = await currentProfile();
  if (!profileId || profileId === profile.id) return profile.id;
  const { getProfile } = await import("@/lib/services/profiles");
  return (await getProfile(profileId, email))?.id ?? profile.id;
}

export async function saveAnswerAction(key: string, question: string, answer: string, profileId?: string) {
  const id = await targetProfileId(profileId);
  await updateAnswers(id, [{ key, question, answer: answer.trim() }]);
  revalidatePath("/profiles");
}

/** Add a custom saved answer (any question the owner wants the bot to answer). */
export async function addCustomAnswerAction(question: string, answer: string, profileId?: string) {
  const { cleanQuestion, customAnswerKey } = await import("@/lib/profile/answer-catalog");
  const q = cleanQuestion(question).slice(0, 300);
  if (!q) return { ok: false as const, error: "Question required" };
  const id = await targetProfileId(profileId);
  await updateAnswers(id, [{ key: customAnswerKey(q), question: q, answer: answer.trim() }]);
  revalidatePath("/profiles");
  return { ok: true as const };
}

export async function deleteCustomAnswerAction(key: string, profileId?: string) {
  const { CATALOG_KEYS } = await import("@/lib/profile/answer-catalog");
  if (CATALOG_KEYS.has(key)) return;
  const id = await targetProfileId(profileId);
  const { deleteAnswer } = await import("@/lib/services/profiles");
  await deleteAnswer(id, key);
  revalidatePath("/profiles");
}

export async function saveSettingsAction(patch: {
  autoApply?: boolean;
  dailyLimit?: number;
  batchSize?: number;
  skipW2Only?: boolean;
  sevenDaysOnly?: boolean;
  notifyEmail?: boolean;
}) {
  await currentProfile();
  const { getDb } = await import("@/lib/db/client");
  const { ownerSettings } = await import("@/lib/db/schema");
  const clean = {
    ...(patch.autoApply !== undefined ? { autoApply: Boolean(patch.autoApply) } : {}),
    ...(patch.dailyLimit !== undefined ? { dailyLimit: Math.max(1, Math.min(200, Math.round(patch.dailyLimit))) } : {}),
    ...(patch.batchSize !== undefined ? { batchSize: Math.max(1, Math.min(50, Math.round(patch.batchSize))) } : {}),
    ...(patch.skipW2Only !== undefined ? { skipW2Only: Boolean(patch.skipW2Only) } : {}),
    ...(patch.sevenDaysOnly !== undefined ? { sevenDaysOnly: Boolean(patch.sevenDaysOnly) } : {}),
    ...(patch.notifyEmail !== undefined ? { notifyEmail: Boolean(patch.notifyEmail) } : {}),
  };
  await getDb()
    .insert(ownerSettings)
    .values({ id: "owner", ...clean })
    .onConflictDoUpdate({ target: ownerSettings.id, set: { ...clean, updatedAt: new Date() } });
  if (patch.skipW2Only !== undefined) {
    const { profiles } = await import("@/lib/db/schema");
    await getDb().update(profiles).set({ skipW2Only: Boolean(patch.skipW2Only) });
  }
  revalidatePath("/settings");
  revalidatePath("/feed");
}

export async function disconnectMailAction(id: string) {
  await currentProfile();
  const { disconnectMail } = await import("@/lib/inbox/connections");
  await disconnectMail(id);
  revalidatePath("/inbox");
}

export async function connectGmailAction() {
  await currentProfile();
  const { signIn } = await import("@/auth");
  await signIn("gmail", { redirectTo: "/inbox" });
}

/** Personal info + preferences on the Profiles page. Personal fields are kept as saved answers (used by the form filler). */
export async function saveProfileDetailsAction(profileId: string, formData: FormData) {
  const { email } = await currentProfile();
  const list = (name: string) =>
    String(formData.get(name) ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const salary = String(formData.get("salary") ?? "").match(/\d[\d,]*/g)?.map((n) => Number(n.replace(/,/g, ""))) ?? [];
  const k = (n: number) => (n < 1000 ? n * 1000 : n);
  await updateProfile(profileId, {
    name: String(formData.get("profileName") ?? "").trim() || undefined,
    targetTitles: list("titles"),
    locations: list("locations"),
    yearsExperience: Number(formData.get("years")) || null,
    ...(salary.length ? { salaryMin: k(salary[0]), salaryMax: k(salary[1] ?? salary[0]) } : {}),
    email,
  });
  const personal = [
    ["full_name", "Full name", "name"],
    ["email", "Email", "email"],
    ["phone", "Phone", "phone"],
    ["linkedin", "LinkedIn", "linkedin"],
    ["location", "Location", "location"],
    ["remote", "Open to remote", "remote"],
    ["job_type", "Job type", "jobType"],
  ] as const;
  await updateAnswers(
    profileId,
    personal.map(([key, question, field]) => ({ key, question, answer: String(formData.get(field) ?? "").trim() })).filter((a) => a.answer),
  );
  revalidatePath("/profiles");
}

/** Store an uploaded resume file for a profile (stored as-is; text extracted for matching). */
export async function uploadResumeAction(profileId: string, formData: FormData) {
  await currentProfile();
  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file" };
  if (file.size > 5_000_000) return { ok: false, error: "Resume must be 5 MB or smaller." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const resumeText = await extractResumeText(file.name, bytes);
  await updateProfile(profileId, { resumeText, resumeFilename: file.name });
  const { getDb } = await import("@/lib/db/client");
  const { profiles } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await getDb().update(profiles).set({ resumeFile: Buffer.from(bytes), resumeMime: file.type || "application/octet-stream" }).where(eq(profiles.id, profileId));
  revalidatePath("/profiles");
  return { ok: true };
}

export async function setDefaultProfileAction(profileId: string) {
  const { email } = await currentProfile();
  await setActiveProfile(profileId, email);
  await remember(profileId);
  revalidatePath("/profiles");
}

export async function newProfileAction() {
  const { email } = await currentProfile();
  const { listProfiles } = await import("@/lib/services/profiles");
  const { maxProfiles } = await import("@/lib/profile/defaults");
  const existing = await listProfiles(email);
  if (existing.length >= maxProfiles()) return { ok: false, error: `You can have up to ${maxProfiles()} profiles.` };
  const profile = await createProfile({ name: `Profile ${existing.length + 1}`, email, onboardingComplete: true });
  await updateAnswers(profile.id, defaultAnswers());
  revalidatePath("/profiles");
  return { ok: true, id: profile.id };
}
