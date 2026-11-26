const ALLOWED_HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "localhost",
  "127.0.0.1",
];

export type ApplySource = "greenhouse" | "lever" | "ashby";

export function sourceFromUrl(url: string): ApplySource | null {
  try {
    const host = new URL(url).hostname;
    if (host.includes("greenhouse.io")) return "greenhouse";
    if (host.includes("lever.co")) return "lever";
    if (host.includes("ashbyhq.com")) return "ashby";
    return null;
  } catch {
    return null;
  }
}

export function assertApplyHost(url: string): void {
  const host = new URL(url).hostname;
  if (!ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    throw new Error("Applykar only submits on Greenhouse, Lever, and Ashby application pages.");
  }
}
