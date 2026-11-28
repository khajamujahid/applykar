import { BOARD_SOURCES, type BoardSource } from "@/lib/domain";

const ALLOWED_HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "myworkdayjobs.com",
  "icims.com",
  "jobs.smartrecruiters.com",
  "smartrecruiters.com",
  "apply.workable.com",
  "workable.com",
  "recruitee.com",
  "bamboohr.com",
  "breezy.hr",
  "ats.rippling.com",
  "rippling.com",
  "applytojob.com",
  "jazz.co",
  "applicantpro.com",
  "localhost",
  "127.0.0.1",
];

/** Every career-page ATS in the feed can be opened and filled. Adzuna/USAJobs/JSearch are aggregators, not apply targets. */
export type ApplySource = BoardSource;

const BOARD_SET = new Set<string>(BOARD_SOURCES);

export function sourceFromUrl(url: string): ApplySource | null {
  try {
    const host = new URL(url).hostname;
    if (host.includes("greenhouse.io")) return "greenhouse";
    if (host.includes("lever.co")) return "lever";
    if (host.includes("ashbyhq.com")) return "ashby";
    if (host.endsWith(".myworkdayjobs.com")) return "workday";
    if (host.endsWith(".icims.com")) return "icims";
    if (host.includes("smartrecruiters.com")) return "smartrecruiters";
    if (host.includes("workable.com")) return "workable";
    if (host.endsWith(".recruitee.com") || host === "recruitee.com") return "recruitee";
    if (host.endsWith(".bamboohr.com")) return "bamboohr";
    if (host.endsWith(".breezy.hr") || host === "breezy.hr") return "breezy";
    if (host.includes("rippling.com")) return "rippling";
    if (host.endsWith(".applytojob.com") || host.endsWith(".jazz.co") || host.endsWith(".applicantpro.com")) return "jazzhr";
    return null;
  } catch {
    return null;
  }
}

export function assertApplyHost(url: string, source?: ApplySource): void {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const okProtocol = parsed.protocol === "https:" || host === "localhost" || host === "127.0.0.1";
  if (!okProtocol) throw new Error("Applykar only opens https application pages.");
  if (source && BOARD_SET.has(source)) return;
  if (!ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    throw new Error("Applykar only fills forms on supported career sites (Greenhouse, Lever, Ashby, Workday, iCIMS, SmartRecruiters, Workable, Recruitee, BambooHR, Breezy, Rippling, JazzHR).");
  }
}

/**
 * The page the bot should fill. Some feeds store an API URL (SmartRecruiters) or a company-domain
 * Greenhouse board; those are rewritten to the hosted application form.
 */
export function applyTarget(job: { source: string; externalId: string; applyUrl: string }): { url: string; source: ApplySource } | null {
  const direct = sourceFromUrl(job.applyUrl);
  if (direct && !/api\.smartrecruiters\.com/i.test(job.applyUrl)) return { url: job.applyUrl, source: direct };

  const gh = /^([a-z0-9_-]+):(\d+)$/i.exec(job.externalId);
  if (job.source === "greenhouse" && gh) {
    return { url: `https://job-boards.greenhouse.io/embed/job_app?for=${encodeURIComponent(gh[1])}&token=${gh[2]}`, source: "greenhouse" };
  }

  const sr = /(?:api\.smartrecruiters\.com\/v1\/companies\/([^/]+)\/postings\/([^/?#]+)|^([a-z0-9_-]+):(\d+)$)/i.exec(
    /api\.smartrecruiters\.com/i.test(job.applyUrl) ? job.applyUrl : job.externalId,
  );
  if (job.source === "smartrecruiters") {
    const slug = sr?.[1] ?? sr?.[3];
    const id = sr?.[2] ?? sr?.[4];
    if (slug && id) return { url: `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}/${encodeURIComponent(id)}`, source: "smartrecruiters" };
  }

  if (BOARD_SET.has(job.source) && /^https?:\/\//i.test(job.applyUrl) && !/api\.smartrecruiters\.com/i.test(job.applyUrl)) {
    return { url: job.applyUrl, source: job.source as ApplySource };
  }
  return null;
}
