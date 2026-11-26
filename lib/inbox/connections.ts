import { eq } from "drizzle-orm";
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
      id: "gmail",
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

export async function getGmailConnection() {
  const rows = await getDb().select().from(mailConnections).where(eq(mailConnections.id, "gmail")).limit(1);
  return rows[0] ?? null;
}

export async function saveImapConnection(input: { host: string; port: number; user: string; password: string; tls: boolean }) {
  await getDb()
    .insert(mailConnections)
    .values({
      id: "imap",
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
  const rows = await getDb().select().from(mailConnections).where(eq(mailConnections.id, "imap")).limit(1);
  return rows[0] ?? null;
}
