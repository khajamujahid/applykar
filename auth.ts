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
    async signIn({ user, profile, account }) {
      const email = user.email ?? (typeof profile?.email === "string" ? profile.email : null);
      if (account?.provider === "gmail") {
        // Connecting a job inbox: any Gmail account, as long as the owner is already signed in. The owner's session is kept.
        const current = await auth();
        const ownerSignedIn = isAllowedEmail(current?.user?.email);
        if (ownerSignedIn || isAllowedEmail(email)) {
          if (account.refresh_token) {
            const { saveGmailConnection } = await import("@/lib/inbox/connections");
            await saveGmailConnection({
              email: email ?? null,
              refreshToken: account.refresh_token,
              accessToken: account.access_token ?? null,
              expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
            });
          }
          if (ownerSignedIn) return `/inbox?connected=${encodeURIComponent(email ?? "gmail")}`;
          return true;
        }
        return false;
      }
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
