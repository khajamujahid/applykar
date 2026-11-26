import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const googleReady = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const allowlist = Boolean(process.env.ALLOWED_EMAILS?.trim());

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <p className="text-[12px] uppercase tracking-[0.16em] text-primary">Applykar</p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight">Sign in</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
        Google sign-in is limited to the addresses in ALLOWED_EMAILS. There is no public sign-up.
      </p>
      {error ? (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px]">
          That Google account is not on the allowlist.
        </p>
      ) : null}
      {googleReady && allowlist ? (
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/feed" });
          }}
        >
          <Button type="submit" className="w-full">
            Continue with Google
          </Button>
        </form>
      ) : (
        <div className="mt-6 rounded-lg border border-border p-3 text-[13px] text-muted-foreground">
          <p>Google sign-in still needs these environment variables:</p>
          <ul className="mt-2 list-disc pl-4">
            {!process.env.AUTH_GOOGLE_ID ? <li>AUTH_GOOGLE_ID</li> : null}
            {!process.env.AUTH_GOOGLE_SECRET ? <li>AUTH_GOOGLE_SECRET</li> : null}
            {!allowlist ? <li>ALLOWED_EMAILS</li> : null}
            {!process.env.AUTH_SECRET ? <li>AUTH_SECRET</li> : null}
          </ul>
        </div>
      )}
    </main>
  );
}
