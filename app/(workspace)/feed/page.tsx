import { JobsView } from "@/components/jobs/jobs-view";
import { history } from "@/lib/ai/assistant";
import { currentProfile } from "@/lib/current";
import { parseFilters } from "@/lib/filters";
import { markFeedVisit, searchJobs } from "@/lib/services/jobs";
import { OWNER_NAME } from "@/lib/profile/defaults";

export const dynamic = "force-dynamic";

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { profile } = await currentProfile();
  const filters = parseFilters(params);
  const since = await markFeedVisit(profile.id);
  const [result, messages] = await Promise.all([searchJobs(profile.id, filters, { since, sinceFallbackHours: 24 }), history(profile.id)]);
  const selected = typeof params.job === "string" ? params.job : null;
  return (
    <JobsView
      jobs={result.jobs}
      total={result.total}
      newSinceVisit={result.newSinceVisit}
      filters={filters}
      selectedId={selected}
      firstName={OWNER_NAME.split(" ")[0]}
      initialMessages={messages}
    />
  );
}
