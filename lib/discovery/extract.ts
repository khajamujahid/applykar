/**
 * Pulls ATS board identifiers (source + slug) out of arbitrary text: URLs in job postings, CSV/JSON lists,
 * Common Crawl URLs, READMEs. Slugs are normalised the same way the seed list stores them.
 */
import type { BoardSource } from "@/lib/domain";

export type BoardRef = { source: BoardSource; slug: string; name?: string };

const RESERVED = new Set([
  "embed", "api", "jobs", "job", "v0", "v1", "v2", "search", "careers", "career", "www", "static", "assets", "apply",
  "favicon.ico", "robots.txt", "sitemap.xml", "j", "app", "help", "status", "blog", "marketing", "support", "partners",
  "go", "info", "login", "signin", "signup", "admin", "docs", "developers", "cdn", "mail", "email", "auth", "oauth",
  "public", "share", "widget", "widgets", "integrations", "demo", "test", "staging", "sandbox", "en", "de", "fr", "es",
  "home", "about", "pricing", "features", "security", "privacy", "terms", "legal", "hire", "talent", "recruiting",
  "posting-api", "job-board", "boards", "job-boards", "company", "companies", "postings", "s", "c", "u", "undefined", "null",
]);

const PATTERNS: { source: BoardSource; re: RegExp; slug: (m: RegExpExecArray) => string | null }[] = [
  { source: "greenhouse", re: /(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([A-Za-z0-9_-]+)/g, slug: (m) => m[1] },
  { source: "greenhouse", re: /boards-api\.greenhouse\.io\/v1\/boards\/([A-Za-z0-9_-]+)/g, slug: (m) => m[1] },
  { source: "greenhouse", re: /(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/([A-Za-z0-9_-]+)/g, slug: (m) => m[1] },
  { source: "lever", re: /api(?:\.eu)?\.lever\.co\/v0\/postings\/([A-Za-z0-9_.-]+)/g, slug: (m) => m[1] },
  { source: "lever", re: /jobs(?:\.eu)?\.lever\.co\/([A-Za-z0-9_.-]+)/g, slug: (m) => m[1] },
  { source: "ashby", re: /api\.ashbyhq\.com\/posting-api\/job-board\/([A-Za-z0-9_.%-]+)/g, slug: (m) => m[1] },
  { source: "ashby", re: /jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/g, slug: (m) => m[1] },
  { source: "smartrecruiters", re: /api\.smartrecruiters\.com\/v1\/companies\/([A-Za-z0-9_-]+)/g, slug: (m) => m[1] },
  { source: "smartrecruiters", re: /(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/g, slug: (m) => m[1] },
  { source: "workable", re: /apply\.workable\.com\/(?:api\/v[13]\/(?:widget\/)?accounts\/)?([A-Za-z0-9_-]+)/g, slug: (m) => m[1] },
  {
    source: "workday",
    re: /([a-z0-9-]+)\.(wd\d{1,3})\.myworkdayjobs\.com\/(?:wday\/cxs\/[a-z0-9_-]+\/)?(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)/g,
    slug: (m) => (["wday", "job", "jobs", "en-US"].includes(m[3]) ? null : `${m[1]}.${m[2]}/${m[3]}`),
  },
  { source: "icims", re: /careers-([a-z0-9-]+)\.icims\.com/gi, slug: (m) => m[1] },
  { source: "recruitee", re: /\b([a-z0-9-]+)\.recruitee\.com/gi, slug: (m) => m[1] },
  { source: "bamboohr", re: /\b([a-z0-9-]+)\.bamboohr\.com/gi, slug: (m) => m[1] },
  { source: "breezy", re: /\b([a-z0-9-]+)\.breezy\.hr/gi, slug: (m) => m[1] },
  { source: "rippling", re: /ats\.rippling\.com\/(?:api\/v2\/board\/)?([a-z0-9-]+)/gi, slug: (m) => m[1] },
  { source: "jazzhr", re: /\b([a-z0-9-]+)\.applytojob\.com/gi, slug: (m) => m[1] },
];

const CASE_SENSITIVE: BoardSource[] = ["ashby", "smartrecruiters", "workday"];

export function normaliseSlug(source: BoardSource, raw: string): string | null {
  let slug = raw.trim();
  try {
    slug = decodeURIComponent(slug);
  } catch {
    /* keep raw */
  }
  slug = slug.replace(/[.\s]+$/, "");
  if (!slug || slug.length > 80) return null;
  if (!CASE_SENSITIVE.includes(source)) slug = slug.toLowerCase();
  const head = source === "workday" ? slug.split("/")[1] ?? "" : slug;
  if (!head || RESERVED.has(head.toLowerCase())) return null;
  if (source !== "workday" && /[/?#]/.test(slug)) return null;
  if (source === "ashby" ? !/^[A-Za-z0-9 _.&'-]+$/.test(slug) : source !== "workday" && !/^[A-Za-z0-9_.-]+$/.test(slug)) return null;
  if (/^(www|api|app|help|status|cdn)$/i.test(slug)) return null;
  return slug;
}

export function extractBoards(text: string): BoardRef[] {
  const out = new Map<string, BoardRef>();
  if (!text) return [];
  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(text))) {
      const raw = pattern.slug(match);
      const slug = raw ? normaliseSlug(pattern.source, raw) : null;
      if (slug) out.set(`${pattern.source}\t${slug}`, { source: pattern.source, slug });
    }
  }
  return [...out.values()];
}

/** Candidate slugs to try on other ATS for a company name ("Acme Robotics, Inc." -> acmerobotics, acme-robotics, acme). */
export function nameSlugs(name: string): string[] {
  const clean = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|gmbh|plc|pbc|limited|group|holdings|technologies|the)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!clean || clean.length < 2) return [];
  const words = clean.split(" ");
  const set = new Set([words.join(""), words.join("-")]);
  if (words.length > 1 && words[0].length >= 4) set.add(words[0]);
  return [...set].filter((s) => s.length >= 2 && s.length <= 60 && !RESERVED.has(s));
}
