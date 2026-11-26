import type { FetchLike } from "@/lib/sources/types";
import { USER_AGENT } from "@/lib/sources/types";

export class NotFoundError extends Error {
  readonly status = 404;
  constructor() {
    super("Board was not found");
    this.name = "NotFoundError";
  }
}

export async function fetchJson(url: string, fetchImpl: FetchLike = fetch, init?: RequestInit, attempt = 0): Promise<unknown> {
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
  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    const retryAfter = Number(response.headers.get("retry-after")) || 0;
    await new Promise((resolve) => setTimeout(resolve, Math.min(20_000, Math.max(retryAfter * 1000, 1500 * 2 ** attempt))));
    return fetchJson(url, fetchImpl, init, attempt + 1);
  }
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return response.json();
}
