import { NextResponse } from "next/server";
import { auth } from "@/auth";

const protectedPrefixes = ["/feed", "/applications", "/inbox", "/onboarding", "/profiles", "/settings"];

export default auth((request) => {
  const path = request.nextUrl.pathname;
  const signedIn = Boolean(request.auth?.user?.email);
  const isProtected = protectedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  if (isProtected && !signedIn) {
    const login = new URL("/login", request.nextUrl.origin);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  if (path === "/login" && signedIn) {
    return NextResponse.redirect(new URL("/feed", request.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/feed/:path*", "/applications/:path*", "/inbox/:path*", "/onboarding/:path*", "/profiles/:path*", "/settings/:path*", "/login"],
};
