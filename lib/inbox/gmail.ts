import { getGmailConnection } from "@/lib/inbox/connections";
import { ingestInboundEmail } from "@/lib/inbox/store";

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: { name: string; value: string }[] };

function decode(data?: string): string {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function plainText(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decode(part.body.data);
  for (const child of part.parts ?? []) {
    const text = plainText(child);
    if (text) return text;
  }
  return "";
}

function htmlText(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/html" && part.body?.data) {
    // Keep hrefs so verify links survive the HTML-to-text step.
    return decode(part.body.data)
      .replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, " $1 ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ");
  }
  for (const child of part.parts ?? []) {
    const text = htmlText(child);
    if (text) return text;
  }
  return "";
}

function header(part: GmailPart, name: string): string {
  return part.headers?.find((item) => item.name.toLowerCase() === name)?.value ?? "";
}

export async function syncGmail(options: { newerThan?: string; max?: number } = {}): Promise<{ imported: number; skipped?: string }> {
  const connection = await getGmailConnection();
  const refreshToken = connection?.refreshToken;
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!refreshToken || !clientId || !clientSecret) return { imported: 0, skipped: "Gmail is not connected" };

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenResponse.ok) return { imported: 0, skipped: "Gmail token refresh failed" };
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) return { imported: 0, skipped: "Gmail token refresh failed" };

  const query = encodeURIComponent(
    `newer_than:${options.newerThan ?? "21d"} (verification OR verify OR code OR passcode OR confirm OR application OR interview OR unfortunately)`,
  );
  const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${options.max ?? 25}&q=${query}`, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!listResponse.ok) return { imported: 0, skipped: "Gmail list failed" };
  const list = (await listResponse.json()) as { messages?: { id: string }[] };
  let imported = 0;
  for (const message of list.messages ?? []) {
    const detailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (!detailResponse.ok) continue;
    const detail = (await detailResponse.json()) as { payload?: GmailPart; internalDate?: string };
    const payload = detail.payload;
    if (!payload) continue;
    const stored = await ingestInboundEmail({
      from: header(payload, "from"),
      to: header(payload, "to"),
      subject: header(payload, "subject"),
      messageId: header(payload, "message-id") || message.id,
      text: plainText(payload) || htmlText(payload),
      receivedAt: detail.internalDate ? new Date(Number(detail.internalDate)) : undefined,
    });
    if (!stored.duplicate) imported += 1;
  }
  return { imported };
}
