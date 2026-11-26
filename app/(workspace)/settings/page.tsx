import { signIn } from "@/auth";
import { ingestAction, saveImapAction, syncMailAction } from "@/app/actions";
import { ExtensionPair } from "@/components/extension-pair";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentProfile } from "@/lib/current";
import { getDb } from "@/lib/db/client";
import { companies, ingestRuns, jobs } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await currentProfile();
  const db = getDb();
  const [companyCount] = await db.select({ value: sql<number>`count(*)::int` }).from(companies);
  const [jobCount] = await db.select({ value: sql<number>`count(*)::int` }).from(jobs);
  const runs = await db.select().from(ingestRuns).orderBy(desc(ingestRuns.startedAt)).limit(8);
  const flags = [
    ["Google sign-in", Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)],
    ["Allowlist", Boolean(process.env.ALLOWED_EMAILS)],
    ["OpenAI enrichment", Boolean(process.env.OPENAI_API_KEY)],
    ["Adzuna", Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY)],
    ["USAJobs", Boolean(process.env.USAJOBS_API_KEY)],
    ["JSearch", Boolean(process.env.JSEARCH_API_KEY)],
  ] as const;

  return (
    <div className="grid gap-6 px-4 py-4 lg:grid-cols-2">
      <section>
        <h1 className="text-base font-medium">Ingest</h1>
        <p className="mt-1 text-muted-foreground">
          {companyCount?.value ?? 0} company boards tracked · {jobCount?.value ?? 0} postings stored. Each run refreshes the oldest boards.
        </p>
        <form action={ingestAction} className="mt-3">
          <Button type="submit">Refresh a batch</Button>
        </form>
        <ul className="mt-4 grid gap-2 text-[12px] text-muted-foreground">
          {runs.length === 0 ? <li>No ingest runs yet.</li> : null}
          {runs.map((run) => (
            <li key={run.id}>
              {run.source} · {run.status} · +{run.added} / {run.updated} updated / {run.staled} stale
              {run.error ? ` · ${run.error}` : ""}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-sm font-medium">Connections</h2>
        <ul className="mt-3 grid gap-1 text-[13px]">
          {flags.map(([label, on]) => (
            <li key={label} className="flex justify-between border-b border-border py-1">
              <span>{label}</span>
              <span className={on ? "text-primary" : "text-muted-foreground"}>{on ? "Ready" : "Off"}</span>
            </li>
          ))}
        </ul>
        <h2 className="mt-6 text-sm font-medium">Shortcuts</h2>
        <p className="mt-2 text-muted-foreground">On the feed: j and k move, s saves, h hides, a queues, o opens the apply link, / focuses search, ⌘K opens the palette.</p>
        <h2 className="mt-6 text-sm font-medium">Mail</h2>
        <p className="mt-2 text-muted-foreground">Gmail is read-only. IMAP is the generic inbox. Both update codes, links, interviews, and rejections.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {process.env.AUTH_GOOGLE_ID ? (
            <form
              action={async () => {
                "use server";
                await signIn("gmail", { redirectTo: "/settings" });
              }}
            >
              <Button type="submit" variant="secondary">Connect Gmail</Button>
            </form>
          ) : (
            <p className="text-[12px] text-muted-foreground">Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET, then add the gmail.readonly scope.</p>
          )}
          <form action={syncMailAction}>
            <Button type="submit" variant="outline">Sync mail</Button>
          </form>
        </div>
        <form action={saveImapAction} className="mt-3 grid gap-2 sm:grid-cols-2">
          <Input name="host" placeholder="imap.gmail.com" />
          <Input name="port" placeholder="993" defaultValue="993" />
          <Input name="user" placeholder="IMAP user" />
          <Input name="password" type="password" placeholder="IMAP password" />
          <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" name="tls" defaultChecked /> TLS</label>
          <Button type="submit" variant="outline">Save IMAP</Button>
        </form>
        <h2 className="mt-6 text-sm font-medium">Chrome extension</h2>
        <p className="mt-2 text-muted-foreground">
          Create a pairing token, then paste it into the extension with this app URL. Greenhouse, Lever, and Ashby pages queue your apply worker. Other sites, including LinkedIn and Indeed, are saved for autofill only. You still submit those yourself.
        </p>
        <div className="mt-3">
          <ExtensionPair />
        </div>
        <h2 className="mt-6 text-sm font-medium">MCP</h2>
        <p className="mt-2 text-muted-foreground">
          Streamable HTTP at <code>/api/mcp</code>. Send <code>Authorization: Bearer $MCP_BEARER_TOKEN</code>. Tools follow the active profile.
        </p>
      </section>
    </div>
  );
}
