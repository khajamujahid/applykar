import { and, eq } from "drizzle-orm";
import { apiProfile, unauthorized } from "@/lib/api-auth";
import { getDb } from "@/lib/db/client";
import { applications } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Screenshot of the filled / submitted application form. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await apiProfile();
  if (!owner) return unauthorized();
  const { id } = await params;
  const rows = await getDb().select({ png: applications.proofPng }).from(applications).where(and(eq(applications.id, id), eq(applications.profileId, owner.profile.id))).limit(1);
  const png = rows[0]?.png;
  if (!png) return new Response("No proof yet", { status: 404 });
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "private, max-age=300" } });
}
