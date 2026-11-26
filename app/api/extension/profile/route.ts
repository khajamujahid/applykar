import { extensionCors, extensionJson, extensionProfile, switchExtensionProfile } from "@/lib/extension/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: extensionCors });
}

export async function POST(request: Request) {
  const profile = await extensionProfile(request);
  if (!profile) return extensionJson({ error: "Unauthorized" }, 401);
  const body = (await request.json()) as { profileId?: string };
  if (!body.profileId) return extensionJson({ error: "Profile id is required" }, 400);
  return extensionJson(await switchExtensionProfile(body.profileId));
}
