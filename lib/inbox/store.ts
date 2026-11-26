import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { inboxMessages, profiles } from "@/lib/db/schema";
import { extractApplicationMail, type InboundEmail } from "@/lib/inbox/extract";
import { listApplications, updateApplicationStatus } from "@/lib/services/applications";

export type StoredMail = {
  id: string;
  profileId: string | null;
  applicationId: string | null;
  recipient: string;
  sender: string;
  subject: string;
  ats: string;
  kind: string;
  employer: string | null;
  verificationCode: string | null;
  verifyUrl: string | null;
  receivedAt: string;
  duplicate: boolean;
};

export async function ingestInboundEmail(message: InboundEmail): Promise<StoredMail> {
  const db = getDb();
  const recipient = message.to.toLowerCase();
  const profileRows = await db
    .select()
    .from(profiles)
    .where(sql`lower(${profiles.applicationEmail}) = ${recipient}`)
    .limit(1);
  const profile = profileRows[0];
  const extracted = extractApplicationMail(message);
  const receivedAt = message.receivedAt ?? new Date();
  const messageId = message.messageId?.trim() || null;

  if (messageId) {
    const existing = await db.select().from(inboxMessages).where(eq(inboxMessages.messageId, messageId)).limit(1);
    const prior = existing[0];
    if (prior) return toStored(prior, true);
  }

  const inserted = await db
    .insert(inboxMessages)
    .values({
      profileId: profile?.id,
      recipient,
      sender: message.from,
      subject: message.subject,
      textBody: message.text.slice(0, 20_000),
      messageId,
      ats: extracted.ats,
      kind: extracted.kind,
      employer: extracted.employer,
      verificationCode: extracted.code,
      verifyUrl: extracted.verifyUrl,
      receivedAt,
    })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("Could not store the email");

  let applicationId: string | null = null;
  if (profile && (extracted.kind === "confirmation" || extracted.kind === "interview" || extracted.kind === "rejection")) {
    const status = extracted.kind === "confirmation" ? "applied" : extracted.kind === "interview" ? "interview" : "rejected";
    applicationId = await matchApplication(profile.id, extracted.employer, `${message.subject}\n${message.text}`, message.from, status);
  }
  if (applicationId) {
    await db.update(inboxMessages).set({ applicationId }).where(eq(inboxMessages.id, row.id));
    row.applicationId = applicationId;
  }
  return toStored(row, false);
}

async function matchApplication(
  profileId: string,
  employer: string | null,
  blob: string,
  from: string,
  status: "applied" | "interview" | "rejected",
): Promise<string | null> {
  const open = await listApplications(profileId);
  const haystack = `${employer ?? ""}\n${blob}`.toLowerCase();
  const match = open.find((item) => {
    if (item.status === "rejected") return false;
    if (status === "applied" && (item.status === "applied" || item.status === "interview")) return false;
    const company = item.companyName.trim().toLowerCase();
    return company.length >= 3 && haystack.includes(company);
  });
  if (!match) return null;
  const note = `${status} email from ${from}${employer ? ` · ${employer}` : ""}\n${blob.slice(0, 700)}`;
  await updateApplicationStatus(profileId, match.id, status, { note });
  return match.id;
}

export async function listInbox(profileId: string) {
  const rows = await getDb()
    .select()
    .from(inboxMessages)
    .where(eq(inboxMessages.profileId, profileId))
    .orderBy(desc(inboxMessages.receivedAt))
    .limit(100);
  return rows.map((row) => toStored(row, false));
}

export async function getLatestCode(profileId: string, employer: string) {
  const row = await findForEmployer(profileId, employer, true);
  if (!row?.verificationCode) return null;
  return {
    code: row.verificationCode,
    employer: row.employer,
    ats: row.ats,
    subject: row.subject,
    verifyUrl: row.verifyUrl,
    receivedAt: row.receivedAt.toISOString(),
  };
}

export async function getVerifyLink(profileId: string, employer: string) {
  const row = await findForEmployer(profileId, employer, false);
  if (!row?.verifyUrl) return null;
  return {
    url: row.verifyUrl,
    employer: row.employer,
    ats: row.ats,
    subject: row.subject,
    code: row.verificationCode,
    receivedAt: row.receivedAt.toISOString(),
  };
}

async function findForEmployer(profileId: string, employer: string, codeOnly: boolean) {
  const needle = `%${employer.trim()}%`;
  const rows = await getDb()
    .select()
    .from(inboxMessages)
    .where(
      and(
        eq(inboxMessages.profileId, profileId),
        codeOnly ? isNotNull(inboxMessages.verificationCode) : isNotNull(inboxMessages.verifyUrl),
        or(ilike(inboxMessages.employer, needle), ilike(inboxMessages.subject, needle), ilike(inboxMessages.textBody, needle), ilike(inboxMessages.sender, needle)),
      ),
    )
    .orderBy(desc(inboxMessages.receivedAt))
    .limit(1);
  return rows[0] ?? null;
}

function toStored(row: typeof inboxMessages.$inferSelect, duplicate: boolean): StoredMail {
  return {
    id: row.id,
    profileId: row.profileId,
    applicationId: row.applicationId,
    recipient: row.recipient,
    sender: row.sender,
    subject: row.subject,
    ats: row.ats,
    kind: row.kind,
    employer: row.employer,
    verificationCode: row.verificationCode,
    verifyUrl: row.verifyUrl,
    receivedAt: row.receivedAt.toISOString(),
    duplicate,
  };
}

export async function profileIdForAddress(address: string): Promise<string | null> {
  const rows = await getDb()
    .select({ id: profiles.id })
    .from(profiles)
    .where(sql`lower(${profiles.applicationEmail}) = ${address.toLowerCase()}`)
    .limit(1);
  return rows[0]?.id ?? null;
}
