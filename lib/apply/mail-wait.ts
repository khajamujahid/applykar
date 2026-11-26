import { getLatestCode, getVerifyLink } from "@/lib/inbox/store";

/** Ask the site to pull fresh mail (Gmail OAuth / IMAP live on Vercel), falling back to a local sync. */
export async function refreshInbox(): Promise<void> {
  const base = process.env.APPLYKAR_URL;
  const secret = process.env.WORKER_SECRET;
  if (base && secret) {
    await fetch(`${base.replace(/\/$/, "")}/api/worker/inbox-sync`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(45_000),
    }).catch(() => undefined);
    return;
  }
  const { syncGmail } = await import("@/lib/inbox/gmail");
  const { pollImapInbox } = await import("@/lib/inbox/poll");
  await syncGmail({ newerThan: "1d", max: 15 }).catch(() => undefined);
  await pollImapInbox().catch(() => undefined);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait up to ~2 minutes for a code/link from this employer that arrived after the apply started. */
export function mailWaiter(profileId: string, since: Date, attempts = Number(process.env.MAIL_WAIT_ATTEMPTS || 8)) {
  const after = new Date(since.getTime() - 60_000);
  async function poll<T>(lookup: () => Promise<T | null>): Promise<T | null> {
    for (let i = 0; i < attempts; i += 1) {
      const found = await lookup();
      if (found) return found;
      await refreshInbox();
      const again = await lookup();
      if (again) return again;
      await sleep(12_000);
    }
    return null;
  }
  return {
    getCode: async (employer: string) => (await poll(() => getLatestCode(profileId, employer, after)))?.code ?? null,
    getLink: async (employer: string) => (await poll(() => getVerifyLink(profileId, employer, after)))?.url ?? null,
  };
}
