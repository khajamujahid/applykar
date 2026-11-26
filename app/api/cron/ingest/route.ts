import { syncGmail } from "@/lib/inbox/gmail";
import { pollImapInbox } from "@/lib/inbox/poll";
import { ingestBatch } from "@/lib/ingest/run";
import { safeEqual } from "@/lib/secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !token || !safeEqual(token, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stats = await ingestBatch({ limitCompanies: 8, includeOptional: true });
  let mail = "skipped";
  try {
    const gmail = await syncGmail();
    const imap = await pollImapInbox();
    mail = `gmail ${gmail.imported}, imap ${imap.imported}`;
  } catch {
    mail = "mail sync failed";
  }
  return Response.json({ ...stats, mail });
}
