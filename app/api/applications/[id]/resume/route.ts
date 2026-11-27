import { and, eq } from "drizzle-orm";
import { apiProfile, unauthorized } from "@/lib/api-auth";
import { latestTailored } from "@/lib/apply/pipeline";
import { getDb } from "@/lib/db/client";
import { applications } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** The tailored resume PDF that was (or will be) uploaded for this application. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await apiProfile();
  if (!owner) return unauthorized();
  const { id } = await params;
  const app = await getDb().select({ id: applications.id }).from(applications).where(and(eq(applications.id, id), eq(applications.profileId, owner.profile.id))).limit(1);
  if (!app[0]) return new Response("Not found", { status: 404 });
  const tailored = await latestTailored(id);
  if (!tailored?.pdf) return new Response("No tailored resume yet", { status: 404 });
  const data = tailored.data as { personalInformation?: { firstName?: string; lastName?: string } };
  const name = `${[data.personalInformation?.firstName, data.personalInformation?.lastName].filter(Boolean).join("_") || "Resume"}_Resume.pdf`;
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(tailored.pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`, "cache-control": "private, no-store" },
  });
}
