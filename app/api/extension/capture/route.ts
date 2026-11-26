import { captureJob } from "@/lib/extension/capture";
import { extensionCors, extensionJson, extensionProfile } from "@/lib/extension/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: extensionCors });
}

export async function POST(request: Request) {
  const profile = await extensionProfile(request);
  if (!profile) return extensionJson({ error: "Unauthorized" }, 401);
  const body = (await request.json()) as {
    url?: string;
    title?: string;
    company?: string;
    location?: string;
    description?: string;
    profileId?: string;
  };
  try {
    const profileId = body.profileId || profile.id;
    const result = await captureJob(profileId, {
      url: body.url ?? "",
      title: body.title ?? "",
      company: body.company ?? "",
      location: body.location,
      description: body.description,
    });
    return extensionJson(result);
  } catch (error) {
    return extensionJson({ error: error instanceof Error ? error.message : "Could not save the job" }, 400);
  }
}
