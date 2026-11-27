import { workerAuthorized } from "@/lib/api-auth";
import { claimQueued, processApplication } from "@/lib/apply/pipeline";
import { launchChromium } from "@/lib/resume/pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Worker / cron entry: process queued applications for up to ~4 minutes. */
export async function POST(request: Request) {
  if (!workerAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const results: { id: string; status: string }[] = [];
  while (Date.now() - started < 240_000) {
    const [claimed] = await claimQueued(1);
    if (!claimed) break;
    results.push({ id: claimed.id, status: await processApplication(claimed, launchChromium) });
  }
  return Response.json({ processed: results.length, results });
}
