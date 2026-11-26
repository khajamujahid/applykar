"use server";

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
