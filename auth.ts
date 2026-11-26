import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isAllowedEmail } from "@/lib/auth-allowlist";

const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: googleConfigured
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
        }),
        Google({
          id: "gmail",
          name: "Gmail",
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
          authorization: {
            params: {
              scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
              access_type: "offline",
              prompt: "consent",
            },
          },
        }),
      ]
    : [],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    signIn({ user, profile }) {
      const email = user.email ?? (typeof profile?.email === "string" ? profile.email : null);
      return isAllowedEmail(email);
    },
    jwt({ token, user }) {
      if (user?.email) {
        if (!isAllowedEmail(user.email)) return {};
        token.email = user.email;
        token.name = user.name ?? "Khaja Mujahiddin Mohammed";
        token.sub = "owner";
      }
      return token;
    },
    session({ session, token }) {
      const email = typeof token.email === "string" ? token.email : null;
      if (!email || !isAllowedEmail(email)) return session;
      session.user = {
        ...session.user,
        id: "owner",
        email,
        name: typeof token.name === "string" ? token.name : "Khaja Mujahiddin Mohammed",
      };
      return session;
    },
  },
  events: {
    async signIn({ account, user }) {
      if (account?.provider !== "gmail" || !account.refresh_token) return;
      const { saveGmailConnection } = await import("@/lib/inbox/connections");
      await saveGmailConnection({
        email: user.email ?? null,
        refreshToken: account.refresh_token,
        accessToken: account.access_token ?? null,
        expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
      });
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
    };
  }
}
