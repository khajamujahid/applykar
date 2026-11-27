import { workerAuthorized } from "@/lib/api-auth";
import { after } from "next/server";
import { drainQueue } from "@/lib/apply/pipeline";
import { launchChromium } from "@/lib/resume/pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Worker / cron entry: process queued applications for up to ~4 minutes. */
export async function POST(request: Request) {
  if (!workerAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const origin = new URL(request.url).origin;
  after(async () => {
    await drainQueue(launchChromium, { origin });
  });
  return Response.json({ started: true });
}
