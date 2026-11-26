import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { extensionTokens } from "@/lib/db/schema";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createExtensionToken(label: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await getDb().insert(extensionTokens).values({ tokenHash: hashToken(token), label });
  return token;
}

export async function extensionTokenIsValid(token: string | null): Promise<boolean> {
  if (!token) return false;
  const digest = hashToken(token);
  const rows = await getDb().select().from(extensionTokens).where(eq(extensionTokens.tokenHash, digest)).limit(1);
  const stored = rows[0]?.tokenHash;
  if (!stored || stored.length !== digest.length) return false;
  return timingSafeEqual(Buffer.from(stored), Buffer.from(digest));
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}
