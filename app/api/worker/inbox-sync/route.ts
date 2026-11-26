import { syncGmail } from "@/lib/inbox/gmail";
import { pollImapInbox } from "@/lib/inbox/poll";
import { safeEqual } from "@/lib/secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called by the background apply worker while a form waits for a verification code or link. */
export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const allowed = [process.env.WORKER_SECRET, process.env.CRON_SECRET].filter((value): value is string => Boolean(value));
  if (!token || !allowed.some((secret) => safeEqual(token, secret))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gmail = await syncGmail({ newerThan: "1d", max: 15 }).catch(() => ({ imported: 0, skipped: "Gmail sync failed" }));
  const imap = await pollImapInbox().catch(() => ({ imported: 0, skipped: "IMAP poll failed" }));
  return Response.json({ gmail, imap });
}
