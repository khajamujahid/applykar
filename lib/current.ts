import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { ProfileRecord } from "@/lib/domain";
import { ensureOwner } from "@/lib/services/profiles";

export const PROFILE_COOKIE = "applykar-profile";

export async function currentProfile(): Promise<{ email: string; name: string; profile: ProfileRecord }> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");
  const jar = await cookies();
  const profile = await ensureOwner(email, jar.get(PROFILE_COOKIE)?.value);
  return { email, name: session.user.name, profile };
}
