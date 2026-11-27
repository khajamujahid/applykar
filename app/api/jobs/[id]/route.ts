import { apiProfile, unauthorized } from "@/lib/api-auth";
import { fullDescription } from "@/lib/apply/pipeline";
import { splitSections } from "@/lib/jobs/details";
import { getJob } from "@/lib/services/jobs";

export const dynamic = "force-dynamic";

/** Job detail panel: the job plus its full description split into sections (fetched live from the ATS, cached). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await apiProfile();
  if (!owner) return unauthorized();
  const { id } = await params;
  const job = await getJob(owner.profile.id, id);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  const description = await fullDescription(id);
  return Response.json({ job: { ...job, description: null }, description, sections: splitSections(description) });
}
