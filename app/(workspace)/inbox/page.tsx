import { desc, eq, or, isNotNull, and } from "drizzle-orm";
import { EmailScreen } from "@/components/app/email-screen";
import { currentProfile } from "@/lib/current";
import { getDb } from "@/lib/db/client";
import { inboxMessages } from "@/lib/db/schema";
import { listConnections } from "@/lib/inbox/connections";

export const dynamic = "force-dynamic";

export default async function EmailIntegrationPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const { connected, error } = await searchParams;
  const { profile } = await currentProfile();
  const [connections, activity] = await Promise.all([
    listConnections().catch(() => []),
    getDb()
      .select({ id: inboxMessages.id, ats: inboxMessages.ats, employer: inboxMessages.employer, code: inboxMessages.verificationCode, link: inboxMessages.verifyUrl, kind: inboxMessages.kind, subject: inboxMessages.subject, at: inboxMessages.receivedAt })
      .from(inboxMessages)
      .where(and(eq(inboxMessages.profileId, profile.id), or(isNotNull(inboxMessages.verificationCode), isNotNull(inboxMessages.verifyUrl), eq(inboxMessages.kind, "confirmation"), eq(inboxMessages.kind, "interview"))))
      .orderBy(desc(inboxMessages.receivedAt))
      .limit(12)
      .catch(() => []),
  ]);
  return (
    <EmailScreen
      notice={connected ? `Connected ${connected}` : error ? "Could not connect that inbox" : null}
      googleReady={Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)}
      connections={connections.map((c) => ({
        id: c.id,
        provider: c.provider,
        email: c.email ?? c.imapUser ?? c.id,
        lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
        codesRead: c.codesRead,
        ok: c.provider === "gmail" ? Boolean(c.refreshToken) : Boolean(c.imapHost && c.imapUser),
      }))}
      activity={activity.map((a) => ({
        id: a.id,
        source: a.ats !== "unknown" ? a.ats[0].toUpperCase() + a.ats.slice(1) : a.employer || "Email",
        text: a.code ? `code ${a.code} read` : a.link ? "email verified link found" : a.kind === "interview" ? "interview email" : "confirmation received",
        at: a.at.toISOString(),
      }))}
    />
  );
}
