import { cookies } from "next/headers";
import { auth } from "@/auth";
import { PROFILE_COOKIE } from "@/lib/current";
import type { ProfileRecord } from "@/lib/domain";
import { ensureOwner } from "@/lib/services/profiles";
import { safeEqual } from "@/lib/secret";

/** Owner profile for API routes (null when signed out). */
export async function apiProfile(): Promise<{ email: string; profile: ProfileRecord } | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  const jar = await cookies();
  return { email, profile: await ensureOwner(email, jar.get(PROFILE_COOKIE)?.value) };
}

export function workerAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const allowed = [process.env.WORKER_SECRET, process.env.CRON_SECRET].filter((v): v is string => Boolean(v));
  return Boolean(header) && allowed.some((secret) => safeEqual(secret, header));
}

export const unauthorized = () => Response.json({ error: "Sign in required" }, { status: 401 });
