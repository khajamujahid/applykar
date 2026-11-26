import { extensionCors, extensionJson, extensionProfile, extensionSnapshot } from "@/lib/extension/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: extensionCors });
}

export async function GET(request: Request) {
  const profile = await extensionProfile(request);
  if (!profile) return extensionJson({ error: "Unauthorized" }, 401);
  return extensionJson(await extensionSnapshot());
}
