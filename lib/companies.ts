import type { BoardSource } from "@/lib/domain";
import { BOARD_SOURCES } from "@/lib/domain";
import companies from "@/data/companies.json";

export type CompanySeed = {
  name: string;
  slug: string;
  source: BoardSource;
};

export function loadCompanySeed(): CompanySeed[] {
  return companies.flatMap((company) => {
    if (!BOARD_SOURCES.includes(company.source as BoardSource)) return [];
    return [{ name: company.name, slug: company.slug, source: company.source as BoardSource }];
  });
}

export function boardEndpoints(source: BoardSource, slug: string): { apiUrl: string; careersUrl: string } {
  switch (source) {
    case "greenhouse":
      return {
        apiUrl: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
        careersUrl: `https://boards.greenhouse.io/${encodeURIComponent(slug)}`,
      };
    case "lever":
      return {
        apiUrl: `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
        careersUrl: `https://jobs.lever.co/${encodeURIComponent(slug)}`,
      };
    case "ashby":
      return {
        apiUrl: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
        careersUrl: `https://jobs.ashbyhq.com/${encodeURIComponent(slug)}`,
      };
    case "smartrecruiters":
      return {
        apiUrl: `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(slug)}/postings`,
        careersUrl: `https://jobs.smartrecruiters.com/${encodeURIComponent(slug)}`,
      };
    case "workable":
      return {
        apiUrl: `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}?details=true`,
        careersUrl: `https://apply.workable.com/${encodeURIComponent(slug)}`,
      };
  }
}
