import { normalizeWebhookPayload } from "@/lib/inbox/extract";
import { ingestInboundEmail } from "@/lib/inbox/store";
import { safeEqual } from "@/lib/secret";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.INBOX_WEBHOOK_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!secret || !token || !safeEqual(token, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = normalizeWebhookPayload(await request.json());
  if (!payload) return Response.json({ error: "Unrecognized email payload" }, { status: 400 });
  return Response.json(await ingestInboundEmail(payload));
}
