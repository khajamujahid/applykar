import { companySlug, slugify } from "@/lib/text";
import type { Workplace } from "@/lib/domain";

export function dedupeKey(input: {
  companyName: string;
  title: string;
  locationRaw?: string | null;
  workplace: Workplace;
}): string {
  const company = companySlug(input.companyName) || "company";
  const title = slugify(input.title) || "role";
  const location =
    input.workplace === "remote"
      ? "remote"
      : slugify(input.locationRaw ?? "") || "unspecified";
  return `${company}|${title}|${location}`;
}

export type DuplicateCandidate = {
  id: string;
  dedupeKey: string;
  richness: number;
  firstSeenAt: number;
};

/** The richest active posting for a key stays canonical. Others point at it. */
export function markDuplicates(items: DuplicateCandidate[]): Map<string, string | null> {
  const groups = new Map<string, DuplicateCandidate[]>();
  for (const item of items) {
    const group = groups.get(item.dedupeKey) ?? [];
    group.push(item);
    groups.set(item.dedupeKey, group);
  }

  const result = new Map<string, string | null>();
  for (const group of groups.values()) {
    const ranked = [...group].sort((a, b) => {
      if (b.richness !== a.richness) return b.richness - a.richness;
      return a.firstSeenAt - b.firstSeenAt;
    });
    const keeper = ranked[0];
    if (!keeper) continue;
    result.set(keeper.id, null);
    for (const other of ranked.slice(1)) result.set(other.id, keeper.id);
  }
  return result;
}
