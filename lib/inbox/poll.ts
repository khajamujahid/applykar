import { ingestInboundEmail } from "@/lib/inbox/store";
import { parseRawEmail } from "@/lib/inbox/extract";

type ImapClient = {
  connect(): Promise<void>;
  logout(): Promise<void>;
  getMailboxLock(name: string): Promise<{ release(): void }>;
  fetch(query: unknown, options: unknown): AsyncIterable<{ source?: Buffer; uid: number }>;
};

async function openImap(options: Record<string, unknown>): Promise<ImapClient> {
  const load = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<{ ImapFlow: new (options: Record<string, unknown>) => ImapClient }>;
  const imported = await load("imapflow");
  return new imported.ImapFlow(options);
}

export async function pollImapInbox(): Promise<{ imported: number; skipped?: string }> {
  const host = process.env.INBOX_IMAP_HOST;
  const user = process.env.INBOX_IMAP_USER;
  const password = process.env.INBOX_IMAP_PASSWORD;
  if (!host || !user || !password) return { imported: 0, skipped: "IMAP is not configured" };

  const client = await openImap({
    host,
    port: Number(process.env.INBOX_IMAP_PORT || 993),
    secure: process.env.INBOX_IMAP_TLS !== "false",
    auth: { user, pass: password },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock(process.env.INBOX_IMAP_MAILBOX || "INBOX");
  let imported = 0;
  try {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    for await (const message of client.fetch({ since }, { source: true, uid: true })) {
      const source = message.source?.toString("utf8");
      if (!source) continue;
      const parsed = parseRawEmail(source);
      if (!parsed.to || !parsed.from) continue;
      const stored = await ingestInboundEmail({ ...parsed, messageId: parsed.messageId ?? `imap-${message.uid}` });
      if (!stored.duplicate) imported += 1;
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return { imported };
}
