import { currentProfile } from "@/lib/current";
import { createExtensionToken } from "@/lib/extension/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const { email } = await currentProfile();
  const token = await createExtensionToken(email);
  return Response.json({ token });
}
