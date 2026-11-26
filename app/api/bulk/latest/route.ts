import { latestBulkRun } from "@/lib/apply/bulk";
import { currentProfile } from "@/lib/current";

export const dynamic = "force-dynamic";

export async function GET() {
  const { profile } = await currentProfile();
  return Response.json({ run: await latestBulkRun(profile.id) });
}
