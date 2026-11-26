import type { FetchLike } from "@/lib/sources/types";
import { USER_AGENT } from "@/lib/sources/types";

export class NotFoundError extends Error {
  readonly status = 404;
  constructor() {
    super("Board was not found");
    this.name = "NotFoundError";
  }
}

export async function fetchJson(url: string, fetchImpl: FetchLike = fetch, init?: RequestInit): Promise<unknown> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      accept: "application/json",
      "user-agent": USER_AGENT,
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(45_000),
  });
  if (response.status === 404) throw new NotFoundError();
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return response.json();
}
