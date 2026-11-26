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
