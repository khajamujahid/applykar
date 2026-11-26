import { encode } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/auth-allowlist";
import { PROFILE_COOKIE } from "@/lib/current";
import { ensureOwner, updateProfile } from "@/lib/services/profiles";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.E2E_AUTH !== "1" || process.env.VERCEL) {
    return new Response("Not found", { status: 404 });
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) return new Response("AUTH_SECRET is not set", { status: 500 });
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") || "khaja@applykar.local").toLowerCase();
  if (!isAllowedEmail(email)) return new Response("Email is not allowlisted", { status: 403 });
  const token = await encode({
    token: { sub: "owner", email, name: "Khaja Mujahiddin Mohammed" },
    secret,
    salt: "authjs.session-token",
  });
  const profile = await ensureOwner(email);
  if (!profile.onboardingComplete) {
    await updateProfile(profile.id, {
      onboardingComplete: true,
      skills: profile.skills.length ? profile.skills : ["sql", "python"],
      interests: profile.interests.length ? profile.interests : ["Analytics"],
      locations: profile.locations.length ? profile.locations : ["Remote", "United States"],
    });
  }
  const host = request.headers.get("host") ?? `localhost:4317`;
  const response = NextResponse.redirect(`http://${host}/feed`);
  response.cookies.set("authjs.session-token", token, { httpOnly: true, sameSite: "lax", path: "/", secure: false });
  response.cookies.set(PROFILE_COOKIE, profile.id, { httpOnly: true, sameSite: "lax", path: "/", secure: false });
  return response;
}
