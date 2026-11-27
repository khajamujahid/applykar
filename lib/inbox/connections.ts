import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { mailConnections } from "@/lib/db/schema";

export async function saveGmailConnection(input: {
  email: string | null;
  refreshToken: string;
  accessToken: string | null;
  expiresAt: Date | null;
}) {
  await getDb()
    .insert(mailConnections)
    .values({
      id: input.email ? `gmail:${input.email.toLowerCase()}` : "gmail",
      provider: "gmail",
      email: input.email,
      refreshToken: input.refreshToken,
      accessToken: input.accessToken,
      expiresAt: input.expiresAt,
    })
    .onConflictDoUpdate({
      target: mailConnections.id,
      set: {
        email: input.email,
        refreshToken: input.refreshToken,
        accessToken: input.accessToken,
        expiresAt: input.expiresAt,
        updatedAt: new Date(),
      },
    });
}

/** All connected Gmail inboxes (any Gmail account, independent of the sign-in email). */
export async function getGmailConnections() {
  return getDb().select().from(mailConnections).where(eq(mailConnections.provider, "gmail"));
}

export async function getGmailConnection() {
  const rows = await getGmailConnections();
  return rows[0] ?? null;
}

export async function listConnections() {
  return getDb().select().from(mailConnections).orderBy(mailConnections.createdAt);
}

export async function disconnectMail(id: string) {
  await getDb().delete(mailConnections).where(eq(mailConnections.id, id));
}

export async function markSynced(id: string, codes: number) {
  await getDb()
    .update(mailConnections)
    .set({ lastSyncedAt: new Date(), codesRead: sql`${mailConnections.codesRead} + ${codes}`, updatedAt: new Date() })
    .where(and(eq(mailConnections.id, id)));
}

export async function saveImapConnection(input: { host: string; port: number; user: string; password: string; tls: boolean }) {
  await getDb()
    .insert(mailConnections)
    .values({
      id: `imap:${input.user.toLowerCase()}`,
      provider: "imap",
      imapHost: input.host,
      imapPort: input.port,
      imapUser: input.user,
      imapPassword: input.password,
      imapTls: input.tls,
    })
    .onConflictDoUpdate({
      target: mailConnections.id,
      set: {
        imapHost: input.host,
        imapPort: input.port,
        imapUser: input.user,
        imapPassword: input.password || undefined,
        imapTls: input.tls,
        updatedAt: new Date(),
      },
    });
}

export async function getImapConnection() {
  const rows = await getDb().select().from(mailConnections).where(eq(mailConnections.provider, "imap")).limit(1);
  return rows[0] ?? null;
}
