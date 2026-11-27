import { encode } from "next-auth/jwt";
import { NextResponse } from "next/server";
import { isAllowedEmail } from "@/lib/auth-allowlist";
import { safeEqual } from "@/lib/secret";
import { PROFILE_COOKIE } from "@/lib/current";
import { ensureOwner, updateProfile } from "@/lib/services/profiles";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Local e2e, or a Vercel *preview* that runs against a throwaway Neon branch and presents the E2E_TOKEN. Never production.
  const url0 = new URL(request.url);
  const previewOk =
    process.env.VERCEL_ENV === "preview" && Boolean(process.env.E2E_TOKEN) && safeEqual(url0.searchParams.get("token") ?? "", process.env.E2E_TOKEN ?? "");
  if (process.env.E2E_AUTH !== "1" || (process.env.VERCEL && !previewOk)) {
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
    salt: process.env.VERCEL ? "__Secure-authjs.session-token" : "authjs.session-token",
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
  const secure = Boolean(process.env.VERCEL);
  const response = NextResponse.redirect(`${secure ? "https" : "http"}://${host}/feed`);
  const cookieName = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
  response.cookies.set(cookieName, token, { httpOnly: true, sameSite: "lax", path: "/", secure });
  response.cookies.set(PROFILE_COOKIE, profile.id, { httpOnly: true, sameSite: "lax", path: "/", secure });
  return response;
}
