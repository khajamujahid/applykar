import type { BoardSource, JobSource, NormalizedJob } from "@/lib/domain";

export const USER_AGENT = "Applykar/0.1 (personal job search; public job-board JSON)";

export type FetchLike = typeof fetch;

export interface BoardAdapter {
  source: BoardSource;
  fetchJobs(company: { slug: string; name: string }, fetchImpl?: FetchLike): Promise<NormalizedJob[]>;
}

export interface OptionalAdapter {
  source: Extract<JobSource, "adzuna" | "usajobs" | "jsearch">;
  enabled(): boolean;
  fetchJobs(fetchImpl?: FetchLike): Promise<NormalizedJob[]>;
}

export class SourceError extends Error {
  constructor(
    message: string,
    readonly source: JobSource,
  ) {
    super(message);
    this.name = "SourceError";
  }
}
