import { and, eq, inArray } from "drizzle-orm";
import { apiProfile, unauthorized } from "@/lib/api-auth";
import { getDb } from "@/lib/db/client";
import { applications } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Live status for job cards: ?jobs=id,id,... -> { [jobId]: { id, status, missing } } */
export async function GET(request: Request) {
  const owner = await apiProfile();
  if (!owner) return unauthorized();
  const ids = (new URL(request.url).searchParams.get("jobs") ?? "").split(",").filter((v) => /^[0-9a-f-]{36}$/i.test(v)).slice(0, 200);
  if (!ids.length) return Response.json({});
  const rows = await getDb()
    .select({ id: applications.id, jobId: applications.jobId, status: applications.status, missing: applications.missing })
    .from(applications)
    .where(and(eq(applications.profileId, owner.profile.id), inArray(applications.jobId, ids)));
  return Response.json(Object.fromEntries(rows.map((r) => [r.jobId, { id: r.id, status: r.status, missing: r.missing.length }])));
}
