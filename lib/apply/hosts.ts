const ALLOWED_HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "myworkdayjobs.com",
  "icims.com",
  "localhost",
  "127.0.0.1",
];

export type ApplySource = "greenhouse" | "lever" | "ashby" | "workday" | "icims";

export function sourceFromUrl(url: string): ApplySource | null {
  try {
    const host = new URL(url).hostname;
    if (host.includes("greenhouse.io")) return "greenhouse";
    if (host.includes("lever.co")) return "lever";
    if (host.includes("ashbyhq.com")) return "ashby";
    if (host.endsWith(".myworkdayjobs.com")) return "workday";
    if (host.endsWith(".icims.com")) return "icims";
    return null;
  } catch {
    return null;
  }
}

export function assertApplyHost(url: string): void {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    throw new Error("Applykar only submits on Greenhouse, Lever, Ashby, Workday, and iCIMS application pages.");
  }
}

/**
 * The page the bot should fill. Greenhouse boards on a company domain (careers.x.com/jobs/1?gh_jid=1)
 * use Greenhouse's hosted embed form, built from the "board:id" external id.
 */
export function applyTarget(job: { source: string; externalId: string; applyUrl: string }): { url: string; source: ApplySource } | null {
  const direct = sourceFromUrl(job.applyUrl);
  if (direct) return { url: job.applyUrl, source: direct };
  const gh = /^([a-z0-9_-]+):(\d+)$/i.exec(job.externalId);
  if (job.source === "greenhouse" && gh) {
    return { url: `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(gh[1])}&token=${gh[2]}`, source: "greenhouse" };
  }
  return null;
}
