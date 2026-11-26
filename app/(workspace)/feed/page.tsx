import { FeedView } from "@/components/feed-view";
import { currentProfile } from "@/lib/current";
import { latestBulkRun } from "@/lib/apply/bulk";
import { listPresets } from "@/lib/feed/presets";
import { parseFilters } from "@/lib/filters";
import { getJob, searchJobs } from "@/lib/services/jobs";

export const dynamic = "force-dynamic";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { profile } = await currentProfile();
  const filters = parseFilters(params);
  const result = await searchJobs(profile.id, filters);
  const requested = typeof params.job === "string" ? params.job : result.jobs[0]?.id;
  const selected = requested ? await getJob(profile.id, requested) : null;
  const presets = await listPresets(profile.id);
  const latest = await latestBulkRun(profile.id);
  const bulk = latest
    ? {
        status: latest.status,
        items: latest.items.map((item) => ({
          id: item.id,
          title: item.title,
          companyName: item.companyName,
          status: item.status,
          detail: item.detail,
          missingQuestions: item.missingQuestions ?? [],
        })),
      }
    : null;
  return <FeedView jobs={result.jobs} total={result.total} selected={selected} filters={filters} presets={presets} bulk={bulk} />;
}
