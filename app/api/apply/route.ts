import { after } from "next/server";
import { apiProfile, unauthorized } from "@/lib/api-auth";
import { drainQueue, queueApply } from "@/lib/apply/pipeline";
import { launchChromium } from "@/lib/resume/pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Queue one or more jobs instantly, then start applying in the background of this function. */
export async function POST(request: Request) {
  const owner = await apiProfile();
  if (!owner) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { jobId?: string; jobIds?: string[] };
  const ids = [...new Set([body.jobId, ...(body.jobIds ?? [])].filter((v): v is string => typeof v === "string"))].slice(0, 50);
  if (!ids.length) return Response.json({ error: "jobId required" }, { status: 400 });
  const queued: { jobId: string; id: string; status: string }[] = [];
  for (const jobId of ids) queued.push({ jobId, ...(await queueApply(owner.profile.id, jobId)) });
  const origin = new URL(request.url).origin;
  after(async () => {
    // Work through what this request queued (claims are atomic, so the GitHub worker can share the queue); time-boxed, then hands off.
    const ids = queued.filter((item) => item.status === "queued").map((item) => item.id);
    if (ids.length) await drainQueue(launchChromium, { ids, origin });
  });
  return Response.json({ queued });
}
