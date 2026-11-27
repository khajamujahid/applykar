import { and, eq, sql } from "drizzle-orm";
import { SENIORITIES, type AnswerRecord, type ProfileInput, type ProfileRecord, type Seniority } from "@/lib/domain";
import { getDb } from "@/lib/db/client";
import { ownerSettings, profiles, standardAnswers } from "@/lib/db/schema";
import { applicationAddress } from "@/lib/inbox/extract";
import { defaultAnswers, defaultProfile, maxProfiles } from "@/lib/profile/defaults";
import { CATALOG_KEYS, cleanQuestion, customAnswerKey, matchAnswerKey } from "@/lib/profile/answer-catalog";

function asSeniority(values: string[]): Seniority[] {
  return values.filter((value): value is Seniority => (SENIORITIES as readonly string[]).includes(value));
}

function toProfile(row: typeof profiles.$inferSelect, email: string): ProfileRecord {
  return {
    id: row.id,
    name: row.name,
    email,
    headline: row.headline ?? "",
    skills: row.skills ?? [],
    targetTitles: row.targetTitles ?? [],
    locations: row.locations ?? [],
    interests: row.interests ?? [],
    seniorityFilters: asSeniority(row.seniorityFilters ?? []),
    yearsExperience: row.yearsExperience,
    yoeMax: row.yoeMax,
    visaStatus: row.visaStatus,
    needsSponsorship: row.needsSponsorship,
    openToRelocate: row.openToRelocate,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    c2cMinHourly: row.c2cMinHourly,
    availableImmediately: row.availableImmediately,
    usaOnly: row.usaOnly,
    prefersC2c: row.prefersC2c,
    skipW2Only: row.skipW2Only,
    includeLeadership: row.includeLeadership,
    resumeFilename: row.resumeFilename,
    resumeText: row.resumeText,
    applicationEmail: row.applicationEmail,
    onboardingComplete: row.onboardingComplete,
  };
}

async function insertAnswers(profileId: string, answers = defaultAnswers()): Promise<void> {
  const db = getDb();
  if (answers.length === 0) return;
  await db
    .insert(standardAnswers)
    .values(answers.map((answer) => ({ ...answer, profileId })))
    .onConflictDoNothing();
}

export async function listProfiles(email = ""): Promise<ProfileRecord[]> {
  const rows = await getDb().select().from(profiles).orderBy(profiles.createdAt);
  return rows.map((row) => toProfile(row, email));
}

export async function getProfile(id: string, email = ""): Promise<ProfileRecord | null> {
  const rows = await getDb().select().from(profiles).where(eq(profiles.id, id)).limit(1);
  const row = rows[0];
  return row ? toProfile(row, email) : null;
}

/**
 * Merge the full default answer set into a profile: add missing keys and fill answers that are still blank.
 * Never overwrites a non-blank answer the owner set.
 */
export async function mergeDefaultAnswers(profileId: string, existing?: { key: string; answer: string }[]): Promise<number> {
  const rows = existing ?? (await getDb().select({ key: standardAnswers.key, answer: standardAnswers.answer }).from(standardAnswers).where(eq(standardAnswers.profileId, profileId)));
  const have = new Map(rows.map((r) => [r.key, r.answer]));
  const add = defaultAnswers().filter((d) => !have.has(d.key));
  const fill = defaultAnswers().filter((d) => have.has(d.key) && !(have.get(d.key) ?? "").trim() && d.answer.trim());
  if (add.length) await insertAnswers(profileId, add);
  for (const d of fill) {
    await getDb()
      .update(standardAnswers)
      .set({ answer: d.answer, updatedAt: new Date() })
      .where(and(eq(standardAnswers.profileId, profileId), eq(standardAnswers.key, d.key), sql`trim(${standardAnswers.answer}) = ''`));
  }
  return add.length + fill.length;
}

/** Save questions the bot could not answer as blank saved answers (fill once, reused on every later form). */
export async function rememberQuestions(profileId: string, labels: string[]): Promise<number> {
  const answers = await getAnswers(profileId);
  const fresh: AnswerRecord[] = [];
  for (const raw of labels) {
    const question = cleanQuestion(raw);
    if (!question || question.length > 300 || /unsupported application site/i.test(question)) continue;
    if (matchAnswerKey(question, answers)) continue;
    const key = customAnswerKey(question);
    if (!fresh.some((f) => f.key === key)) fresh.push({ key, question, answer: "" });
  }
  if (fresh.length) await insertAnswers(profileId, fresh);
  return fresh.length;
}

export async function deleteAnswer(profileId: string, key: string): Promise<void> {
  await getDb().delete(standardAnswers).where(and(eq(standardAnswers.profileId, profileId), eq(standardAnswers.key, key)));
}

export async function getAnswers(profileId: string): Promise<AnswerRecord[]> {
  let rows = await getDb()
    .select()
    .from(standardAnswers)
    .where(eq(standardAnswers.profileId, profileId));
  const keys = new Set(rows.map((r) => r.key));
  if (CATALOG_KEYS.size && [...CATALOG_KEYS].some((k) => !keys.has(k))) {
    await mergeDefaultAnswers(profileId, rows);
    rows = await getDb().select().from(standardAnswers).where(eq(standardAnswers.profileId, profileId));
  }
  return rows
    .map((row) => ({ key: row.key, question: row.question, answer: row.answer }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export async function createProfile(input?: Partial<ProfileInput>): Promise<ProfileRecord> {
  const db = getDb();
  const count = await db.select({ value: sql<number>`count(*)::int` }).from(profiles);
  const existing = count[0]?.value ?? 0;
  if (existing >= maxProfiles()) {
    throw new Error(`You can keep up to ${maxProfiles()} profiles.`);
  }
  const draft = { ...defaultProfile(), ...input };
  const rows = await db
    .insert(profiles)
    .values({
      name: draft.name,
      headline: draft.headline,
      skills: draft.skills,
      targetTitles: draft.targetTitles,
      locations: draft.locations,
      interests: draft.interests,
      seniorityFilters: draft.seniorityFilters,
      yearsExperience: draft.yearsExperience,
      yoeMax: draft.yoeMax,
      visaStatus: draft.visaStatus,
      needsSponsorship: draft.needsSponsorship,
      openToRelocate: draft.openToRelocate,
      salaryMin: draft.salaryMin,
      salaryMax: draft.salaryMax,
      c2cMinHourly: draft.c2cMinHourly,
      availableImmediately: draft.availableImmediately,
      usaOnly: draft.usaOnly,
      prefersC2c: draft.prefersC2c,
      skipW2Only: draft.skipW2Only,
      includeLeadership: draft.includeLeadership,
      resumeFilename: draft.resumeFilename,
      resumeText: draft.resumeText,
      applicationEmail: draft.applicationEmail ?? applicationAddress(draft.name),
      onboardingComplete: draft.onboardingComplete,
    })
    .returning();
  const created = rows[0];
  if (!created) throw new Error("Could not create the profile");
  await insertAnswers(created.id);
  return toProfile(created, draft.email);
}

export async function updateProfile(id: string, patch: Partial<ProfileInput>): Promise<ProfileRecord> {
  const db = getDb();
  const rows = await db
    .update(profiles)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.headline !== undefined ? { headline: patch.headline } : {}),
      ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
      ...(patch.targetTitles !== undefined ? { targetTitles: patch.targetTitles } : {}),
      ...(patch.locations !== undefined ? { locations: patch.locations } : {}),
      ...(patch.interests !== undefined ? { interests: patch.interests } : {}),
      ...(patch.seniorityFilters !== undefined ? { seniorityFilters: patch.seniorityFilters } : {}),
      ...(patch.yearsExperience !== undefined ? { yearsExperience: patch.yearsExperience } : {}),
      ...(patch.yoeMax !== undefined ? { yoeMax: patch.yoeMax } : {}),
      ...(patch.visaStatus !== undefined ? { visaStatus: patch.visaStatus } : {}),
      ...(patch.needsSponsorship !== undefined ? { needsSponsorship: patch.needsSponsorship } : {}),
      ...(patch.openToRelocate !== undefined ? { openToRelocate: patch.openToRelocate } : {}),
      ...(patch.salaryMin !== undefined ? { salaryMin: patch.salaryMin } : {}),
      ...(patch.salaryMax !== undefined ? { salaryMax: patch.salaryMax } : {}),
      ...(patch.c2cMinHourly !== undefined ? { c2cMinHourly: patch.c2cMinHourly } : {}),
      ...(patch.availableImmediately !== undefined ? { availableImmediately: patch.availableImmediately } : {}),
      ...(patch.usaOnly !== undefined ? { usaOnly: patch.usaOnly } : {}),
      ...(patch.prefersC2c !== undefined ? { prefersC2c: patch.prefersC2c } : {}),
      ...(patch.skipW2Only !== undefined ? { skipW2Only: patch.skipW2Only } : {}),
      ...(patch.includeLeadership !== undefined ? { includeLeadership: patch.includeLeadership } : {}),
      ...(patch.resumeFilename !== undefined ? { resumeFilename: patch.resumeFilename } : {}),
      ...(patch.resumeText !== undefined ? { resumeText: patch.resumeText } : {}),
      ...(patch.applicationEmail !== undefined ? { applicationEmail: patch.applicationEmail } : {}),
      ...(patch.onboardingComplete !== undefined ? { onboardingComplete: patch.onboardingComplete } : {}),
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, id))
    .returning();
  const row = rows[0];
  if (!row) throw new Error("Profile not found");
  return toProfile(row, patch.email ?? "");
}

export async function updateAnswers(profileId: string, answers: AnswerRecord[]): Promise<AnswerRecord[]> {
  const db = getDb();
  for (const answer of answers) {
    await db
      .insert(standardAnswers)
      .values({ profileId, key: answer.key, question: answer.question, answer: answer.answer })
      .onConflictDoUpdate({
        target: [standardAnswers.profileId, standardAnswers.key],
        set: { question: answer.question, answer: answer.answer, updatedAt: new Date() },
      });
  }
  return getAnswers(profileId);
}

export async function setActiveProfile(profileId: string, email?: string): Promise<ProfileRecord> {
  const profile = await getProfile(profileId, email ?? "");
  if (!profile) throw new Error("Profile not found");
  const db = getDb();
  await db
    .insert(ownerSettings)
    .values({ id: "owner", email: email ?? null, activeProfileId: profileId })
    .onConflictDoUpdate({
      target: ownerSettings.id,
      set: { activeProfileId: profileId, email: email ?? sql`${ownerSettings.email}`, updatedAt: new Date() },
    });
  return profile;
}

export async function ensureOwner(email?: string | null, preferredId?: string | null): Promise<ProfileRecord> {
  const db = getDb();
  const settings = await db.select().from(ownerSettings).where(eq(ownerSettings.id, "owner")).limit(1);
  const knownEmail = email || settings[0]?.email || "";
  if (preferredId) {
    const preferred = await getProfile(preferredId, knownEmail);
    if (preferred) {
      await setActiveProfile(preferred.id, knownEmail || undefined);
      return { ...preferred, email: knownEmail };
    }
  }
  const activeId = settings[0]?.activeProfileId;
  if (activeId) {
    const active = await getProfile(activeId, knownEmail);
    if (active) {
      if (email) {
        await db.update(ownerSettings).set({ email, updatedAt: new Date() }).where(eq(ownerSettings.id, "owner"));
      }
      return { ...active, email: knownEmail };
    }
  }
  const existing = await listProfiles(knownEmail);
  const first = existing[0];
  if (first) {
    await setActiveProfile(first.id, knownEmail || undefined);
    return { ...first, email: knownEmail };
  }
  const created = await createProfile({ name: "Primary", email: knownEmail });
  await setActiveProfile(created.id, knownEmail || undefined);
  return { ...created, email: knownEmail };
}

export async function deleteProfile(id: string): Promise<void> {
  const db = getDb();
  const remaining = await db.select({ id: profiles.id }).from(profiles);
  if (remaining.length <= 1) throw new Error("Keep at least one profile.");
  await db.delete(profiles).where(eq(profiles.id, id));
  const settings = await db.select().from(ownerSettings).where(eq(ownerSettings.id, "owner")).limit(1);
  if (settings[0]?.activeProfileId === id) {
    const next = await db.select().from(profiles).limit(1);
    if (next[0]) await setActiveProfile(next[0].id);
  }
}

export async function profileCount(): Promise<number> {
  const rows = await getDb().select({ value: sql<number>`count(*)::int` }).from(profiles);
  return rows[0]?.value ?? 0;
}
