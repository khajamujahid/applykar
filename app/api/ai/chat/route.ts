import { apiProfile, unauthorized } from "@/lib/api-auth";
import { OWNER_NAME } from "@/lib/profile/defaults";
import { clearHistory, history, respond } from "@/lib/ai/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const owner = await apiProfile();
  if (!owner) return unauthorized();
  return Response.json({ messages: await history(owner.profile.id) });
}

export async function POST(request: Request) {
  const owner = await apiProfile();
  if (!owner) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { message?: string; reset?: boolean };
  if (body.reset) {
    await clearHistory(owner.profile.id);
    return Response.json({ ok: true });
  }
  const message = (body.message ?? "").trim();
  if (!message) return Response.json({ error: "message required" }, { status: 400 });
  const first = OWNER_NAME.split(" ")[0];
  return Response.json(await respond(owner.profile, message, first));
}
